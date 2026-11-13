'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Phone, PhoneOff, Mic, MicOff, Bell, Download, Volume2, Loader2, MessageSquare, PhoneMissed, Wifi, WifiOff, CheckCircle2, LogOut, UserRound } from 'lucide-react'
import { LoginForm } from '@/components/login-form'
import { authHeaders, clearAuth, getAuth, updateAuthToken, type AuthSession } from '@/lib/client-auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CallData = {
  id: string
  taskName: string
  summary: string | null
  result: string | null
  message: string | null
  urgency: string
  status: string
}

type Turn = { role: 'user' | 'assistant' | 'agent'; text: string }

type PhoneState = 'idle' | 'ringing' | 'in-call' | 'ended' | 'missed'

type LastCall = {
  id: string
  taskName: string
  status: string
  createdAt: string
  durationSec: number | null
}

// SpeechRecognition types (not in standard lib)
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PhonePage() {
  const [state, setState] = useState<PhoneState>('idle')
  const [connected, setConnected] = useState(false)
  const [auth, setAuth] = useState<AuthSession | null>(null)
  const [authLoaded, setAuthLoaded] = useState(false)
  const [currentCall, setCurrentCall] = useState<CallData | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [callStatus, setCallStatus] = useState<'connecting' | 'speaking' | 'listening' | 'thinking'>('connecting')
  const [muted, setMuted] = useState(false)
  const [duration, setDuration] = useState(0)
  const [endedInfo, setEndedInfo] = useState<{ duration: number; turns: number } | null>(null)
  const [textInput, setTextInput] = useState('')
  const [sttSupported, setSttSupported] = useState(true)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [installReady, setInstallReady] = useState(false)
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const [lastCalls, setLastCalls] = useState<LastCall[]>([])
  const [interimText, setInterimText] = useState('')

  const socketRef = useRef<Socket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const tokenRef = useRef<string>('')
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const vibrateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const mutedRef = useRef(false)
  const speakingRef = useRef(false)
  const callActiveRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])
  const installPromptRef = useRef<{ prompt: () => Promise<void> } | null>(null)
  const turnsEndRef = useRef<HTMLDivElement | null>(null)
  // live-call bridge (GPT/Claude <-> call): queue of updates pushed via send_call_update
  const agentQueueRef = useRef<string[]>([])
  const agentProcessingRef = useRef(false)
  const processedAgentIdxRef = useRef<Set<number>>(new Set())

  // -------------------------------------------------------------------------
  // Boot: auth gate, then config, socket, sw, deep-link, voices
  // -------------------------------------------------------------------------
  useEffect(() => {
    const saved = getAuth()
    if (saved) setAuth(saved)
    setAuthLoaded(true)
  }, [])

  useEffect(() => {
    if (!auth?.token) return

    setSttSupported(!!getSpeechRecognition())
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        voicesRef.current = window.speechSynthesis.getVoices()
      }
      loadVoices()
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
    }

    // service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    const token = auth.token
    let cancelled = false
    let socketInstance: Socket | null = null

    ;(async () => {
      try {
        // check push permission state
        if ('Notification' in window) {
          setPushEnabled(Notification.permission === 'granted')
        }

        // Realtime socket channel (ring + live bridge). Optional: when
        // NEXT_PUBLIC_SOCKET_URL is not set (e.g. Vercel serverless where the
        // socket.io mini-service cannot run), the app falls back to polling
        // GET /api/calls + GET /api/calls/<id>/updates (both are wired below).
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL
        if (socketUrl) {
          socketInstance = io(socketUrl, {
            transports: ['websocket', 'polling'],
            forceNew: true,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1500,
            timeout: 10000,
          })
          socketRef.current = socketInstance

          socketInstance.on('connect', () => {
            setConnected(true)
            socketInstance!.emit('join:phone', { token })
          })
          socketInstance.on('disconnect', () => setConnected(false))
          socketInstance.on('joined', () => setConnected(true))
          socketInstance.on('join-error', () => setConnected(false))

          socketInstance.on('incoming-call', (call: CallData) => {
            if (!call || !call.id) return
            if (callActiveRef.current) return // already in a call
            startRinging(call)
          })

          socketInstance.on('call-missed', (data: { callId?: string }) => {
            if (data?.callId && currentCallRef.current?.id === data.callId && stateRef.current === 'ringing') {
              stopRing()
              setState('missed')
              setCurrentCall(null)
            }
          })

          // live update pushed by the external agent (GPT/Claude) via send_call_update:
          // the assistant announces it out loud mid-call
          socketInstance.on('agent-update', (data: { callId?: string; message?: string; index?: number }) => {
            if (!data?.message || !data?.callId) return
            if (currentCallRef.current?.id !== data.callId) return
            if (typeof data.index === 'number') processedAgentIdxRef.current.add(data.index)
            agentQueueRef.current.push(data.message)
            processAgentQueue()
          })
        }
      } catch {
        /* config failed */
      }
    })()

    // install prompt capture
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      installPromptRef.current = e as unknown as { prompt: () => Promise<void> }
      setInstallReady(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    // deep link: /phone?call=<id> from a Web Push notification (scoped to this account)
    const params = new URLSearchParams(window.location.search)
    const callParam = params.get('call')
    if (callParam) {
      fetch(`/api/calls/${callParam}`, { headers: authHeaders({ token } as AuthSession) })
        .then((r) => r.json())
        .then((data) => {
          if (data?.ok && data.call && data.call.status === 'ringing') {
            startRinging(data.call as CallData)
          }
        })
        .catch(() => {})
    }

    // unlock audio on any first tap
    const unlock = () => {
      unlockAudio()
      setAudioUnlocked(true)
    }
    window.addEventListener('pointerdown', unlock, { once: true })

    return () => {
      cancelled = true
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('pointerdown', unlock)
      socketInstance?.disconnect()
      stopRing()
      stopTimer()
      recognitionRef.current?.abort()
      stopAudioPlayback()
    }
  }, [auth?.token])

  // refresh last calls when idle (this account's calls only)
  const refreshLastCalls = useCallback(() => {
    const token = authRef.current?.token
    if (!token) return
    fetch('/api/calls', { headers: authHeaders({ token } as AuthSession) })
      .then((r) => r.json())
      .then((data) => setLastCalls((data?.calls || []).slice(0, 6)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (state === 'idle') refreshLastCalls()
  }, [state, refreshLastCalls])

  // Resilience fallback: when the realtime socket is unavailable (proxy blocked,
  // network hiccup), poll for ringing calls and keep the ring UX alive.
  useEffect(() => {
    if (connected || !auth?.token) return
    const t = setInterval(() => {
      if (stateRef.current !== 'idle' || callActiveRef.current) return
      fetch('/api/calls', { headers: authHeaders({ token: auth.token } as AuthSession) })
        .then((r) => r.json())
        .then((data) => {
          const ringing = (data?.calls || []).find((c: { id: string; status: string }) => c.status === 'ringing')
          if (ringing && stateRef.current === 'idle' && !callActiveRef.current) {
            startRinging(ringing as CallData)
          }
        })
        .catch(() => {})
    }, 3000)
    return () => clearInterval(t)
  }, [connected, auth?.token])

  // auto-scroll transcript
  useEffect(() => {
    turnsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  // Polling fallback for the live-call bridge: when the realtime socket is
  // unavailable, poll for agent updates (send_call_update) while in call.
  useEffect(() => {
    if (state !== 'in-call' || connectedRef.current) return
    const t = setInterval(async () => {
      const call = currentCallRef.current
      if (!call || !callActiveRef.current) return
      try {
        const res = await fetch(`/api/calls/${call.id}/updates`, { headers: authHeaders({ token: tokenRef.current } as AuthSession) })
        if (!res.ok) return
        const data = (await res.json()) as { turns?: Array<{ index: number; role: string; text: string }> }
        for (const turn of data?.turns || []) {
          if (turn.role !== 'agent' || processedAgentIdxRef.current.has(turn.index)) continue
          processedAgentIdxRef.current.add(turn.index)
          agentQueueRef.current.push(turn.text)
        }
        processAgentQueue()
      } catch {
        /* ignore */
      }
    }, 3000)
    return () => clearInterval(t)
  }, [state])

  // -------------------------------------------------------------------------
  // Refs mirroring state for event handlers
  // -------------------------------------------------------------------------
  const stateRef = useRef<PhoneState>('idle')
  useEffect(() => {
    stateRef.current = state
  }, [state])
  const currentCallRef = useRef<CallData | null>(null)
  useEffect(() => {
    currentCallRef.current = currentCall
  }, [currentCall])
  const authRef = useRef<AuthSession | null>(null)
  useEffect(() => {
    authRef.current = auth
    tokenRef.current = auth?.token || ''
  }, [auth])
  const connectedRef = useRef(false)
  useEffect(() => {
    connectedRef.current = connected
  }, [connected])

  // -------------------------------------------------------------------------
  // Ringtone (WebAudio classic two-tone ring) + vibration
  // -------------------------------------------------------------------------
  function unlockAudio() {
    if (audioCtxRef.current) return
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtxRef.current = new Ctx()
      // silent beep to unlock on iOS
      const osc = audioCtxRef.current.createOscillator()
      const gain = audioCtxRef.current.createGain()
      gain.gain.value = 0.0001
      osc.connect(gain).connect(audioCtxRef.current.destination)
      osc.start()
      osc.stop(audioCtxRef.current.currentTime + 0.05)
    } catch {
      /* audio unsupported */
    }
  }

  function beep(times: number) {
    const ctx = audioCtxRef.current
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const t0 = ctx.currentTime
    for (let i = 0; i < times; i++) {
      ;[440, 480].forEach((freq) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = freq
        osc.type = 'sine'
        const start = t0 + i * 1.2
        const stop = start + 0.9
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(0.25, start + 0.05)
        gain.gain.setValueAtTime(0.25, stop - 0.1)
        gain.gain.linearRampToValueAtTime(0, stop)
        osc.connect(gain).connect(ctx.destination)
        osc.start(start)
        osc.stop(stop)
      })
    }
  }

  function startRinging(call: CallData) {
    setCurrentCall(call)
    setTurns([])
    setState('ringing')
    stopRing()
    beep(1)
    ringIntervalRef.current = setInterval(() => beep(1), 1600)
    if ('vibrate' in navigator) {
      navigator.vibrate?.([800, 400, 800])
      vibrateIntervalRef.current = setInterval(() => navigator.vibrate?.([800, 400, 800]), 2200)
    }
    // local 45s ring timeout (works even without the realtime missed-timer,
    // e.g. on Vercel where the socket mini-service is not running)
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current)
    ringTimeoutRef.current = setTimeout(() => {
      ringTimeoutRef.current = null
      if (stateRef.current !== 'ringing') return
      const ringingCall = currentCallRef.current
      stopRing()
      setState('missed')
      setCurrentCall(null)
      if (ringingCall) {
        fetch(`/api/calls/${ringingCall.id}`, {
          method: 'PATCH',
          headers: { ...authHeaders({ token: tokenRef.current } as AuthSession), 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'missed' }),
        }).catch(() => {})
      }
    }, 45000)
  }

  function stopRing() {
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current)
      ringIntervalRef.current = null
    }
    if (vibrateIntervalRef.current) {
      clearInterval(vibrateIntervalRef.current)
      vibrateIntervalRef.current = null
    }
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current)
      ringTimeoutRef.current = null
    }
    if (typeof navigator !== 'undefined') navigator.vibrate?.(0)
  }

  // -------------------------------------------------------------------------
  // Voice output: server-side AI voice first (guaranteed Arabic speech),
  // browser speechSynthesis as fallback.
  // -------------------------------------------------------------------------
  function stopAudioPlayback() {
    const el = audioElRef.current
    if (el) {
      try {
        el.pause()
        el.removeAttribute('src')
      } catch {
        /* ignore */
      }
      audioElRef.current = null
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  function pickVoice(): SpeechSynthesisVoice | null {
    const voices = voicesRef.current
    return voices.find((v) => v.lang?.toLowerCase().startsWith('ar-eg')) || voices.find((v) => v.lang?.toLowerCase().startsWith('ar')) || null
  }

  /** Browser TTS fallback (device voices). */
  const speakWithBrowser = useCallback((text: string, finish: () => void, onStart: () => void) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      // No TTS at all — continue after a short delay
      setTimeout(finish, Math.min(8000, 1200 + text.length * 60))
      return
    }

    const synth = window.speechSynthesis
    synth.cancel()
    onStart()

    // split long text into sentence chunks (some engines cut long utterances)
    const chunks = text.match(/[^.!?؟]+[.!?؟]*/g) || [text]
    const merged: string[] = []
    let buf = ''
    for (const c of chunks) {
      if ((buf + c).length <= 160) buf += c
      else {
        if (buf.trim()) merged.push(buf.trim())
        buf = c
      }
    }
    if (buf.trim()) merged.push(buf.trim())

    const voice = pickVoice()
    let doneCount = 0
    let watchdog: ReturnType<typeof setTimeout> | null = null
    const utterances = merged.map((chunk) => {
      const u = new SpeechSynthesisUtterance(chunk)
      if (voice) u.voice = voice
      u.lang = voice?.lang || 'ar-EG'
      u.rate = 1.0
      u.pitch = 1.0
      u.onend = () => {
        doneCount++
        if (doneCount >= merged.length) {
          if (watchdog) clearTimeout(watchdog)
          finish()
        }
      }
      u.onerror = () => {
        doneCount++
        if (doneCount >= merged.length) {
          if (watchdog) clearTimeout(watchdog)
          finish()
        }
      }
      return u
    })

    // watchdog: if onend never fires (headless / buggy engines), force continue
    const estimate = 2500 + text.length * 110
    watchdog = setTimeout(finish, estimate)

    utterances.forEach((u) => synth.speak(u))
  }, [])

  /** Server-side AI voice (fish.audio first, z-ai fallback) played through an Audio element. */
  const serverSpeak = useCallback(async (text: string, onStart: () => void): Promise<boolean> => {
    const call = currentCallRef.current
    if (!call) return false
    try {
      const res = await fetch('/api/call/tts', {
        method: 'POST',
        headers: { ...authHeaders({ token: tokenRef.current } as AuthSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: call.id, text, token: tokenRef.current }),
      })
      if (!res.ok) return false
      const data = (await res.json()) as { ok?: boolean; audio?: string[]; mime?: string }
      if (!data?.ok || !data.audio?.length) return false
      const mime = data.mime || 'audio/mpeg'

      for (const b64 of data.audio) {
        if (!callActiveRef.current || !speakingRef.current) return true // cancelled mid-playback
        const bin = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
        try {
          await new Promise<void>((resolve) => {
            const el = audioElRef.current || new Audio()
            audioElRef.current = el
            el.src = url
            el.onended = () => resolve()
            el.onerror = () => resolve()
            el.play().catch(() => resolve())
          })
          onStart()
        } finally {
          URL.revokeObjectURL(url)
        }
      }
      return true
    } catch {
      return false
    }
  }, [])

  const speak = useCallback(
    (text: string, onDone: () => void, intro = false) => {
      speakingRef.current = true
      if (intro) setCallStatus('connecting') // preparing the voice report

      const finish = () => {
        if (!speakingRef.current) return
        speakingRef.current = false
        onDone()
      }

      ;(async () => {
        const ok = await serverSpeak(text, () => setCallStatus('speaking'))
        if (ok) {
          finish()
          return
        }
        // fallback: device/browser TTS
        setCallStatus('speaking')
        speakWithBrowser(text, finish, () => setCallStatus('speaking'))
      })()
    },
    [serverSpeak, speakWithBrowser]
  )

  // -------------------------------------------------------------------------
  // STT (browser SpeechRecognition, Egyptian Arabic)
  // -------------------------------------------------------------------------
  const startListening = useCallback(() => {
    if (!callActiveRef.current || mutedRef.current || speakingRef.current) return
    const SR = getSpeechRecognition()
    if (!SR) return
    try {
      recognitionRef.current?.abort()
    } catch {
      /* ignore */
    }
    const rec = new SR()
    rec.lang = 'ar-EG'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (event) => {
      if (speakingRef.current) return
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        if (res.isFinal) {
          const text = (res[0]?.transcript || '').trim()
          if (text.length > 1) {
            setInterimText('')
            handleUserUtterance(text)
            return
          }
        } else {
          interim = res[0]?.transcript || ''
        }
      }
      setInterimText(interim.trim())
    }
    rec.onend = () => {
      // auto-restart while in call and not muted / not speaking
      if (callActiveRef.current && !mutedRef.current && !speakingRef.current) {
        setTimeout(() => {
          if (callActiveRef.current && !mutedRef.current && !speakingRef.current) {
            try {
              recognitionRef.current?.start()
            } catch {
              /* already started */
            }
          }
        }, 400)
      }
    }
    rec.onerror = () => {
      /* network/no-speech errors handled by onend restart */
    }
    recognitionRef.current = rec
    try {
      rec.start()
      setCallStatus('listening')
    } catch {
      /* ignore */
    }
  }, [])

  // -------------------------------------------------------------------------
  // Live-call bridge: announce updates pushed by the external agent
  // (GPT/Claude) via send_call_update — out loud, mid-call, in order.
  // -------------------------------------------------------------------------
  function processAgentQueue() {
    if (agentProcessingRef.current) return
    if (speakingRef.current) {
      setTimeout(processAgentQueue, 700)
      return
    }
    const call = currentCallRef.current
    if (!call || !callActiveRef.current) {
      agentQueueRef.current = []
      return
    }
    const msg = agentQueueRef.current.shift()
    if (!msg) return
    agentProcessingRef.current = true
    setInterimText('')
    recognitionRef.current?.abort()
    setCallStatus('thinking')
    fetch('/api/call/chat', {
      method: 'POST',
      headers: { ...authHeaders({ token: tokenRef.current } as AuthSession), 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId: call.id, agentMessage: msg }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!callActiveRef.current) return
        const reply = (data?.reply || msg) as string
        setTurns((prev) => [...prev, { role: 'assistant', text: reply }])
        speak(
          reply,
          () => {
            agentProcessingRef.current = false
            if (agentQueueRef.current.length) processAgentQueue()
            else {
              setCallStatus('listening')
              startListening()
            }
          },
          false
        )
      })
      .catch(() => {
        if (!callActiveRef.current) return
        agentProcessingRef.current = false
        // at least say the raw update so the user never misses agent news
        setTurns((prev) => [...prev, { role: 'agent', text: msg }])
        speak(
          msg,
          () => {
            if (agentQueueRef.current.length) processAgentQueue()
            else {
              setCallStatus('listening')
              startListening()
            }
          },
          false
        )
      })
  }

  const handleUserUtterance = useCallback(
    (text: string) => {
      const call = currentCallRef.current
      if (!call || !callActiveRef.current) return
      setCallStatus('thinking')
      setInterimText('')
      setTurns((prev) => [...prev, { role: 'user', text }])
      fetch('/api/call/chat', {
        method: 'POST',
        headers: { ...authHeaders({ token: tokenRef.current } as AuthSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: call.id, text }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (!callActiveRef.current) return
          const reply = data?.reply || 'معلش، مش قادر أرد دلوقتي. جرّب تاني.'
          setTurns((prev) => [...prev, { role: 'assistant', text: reply }])
          speak(reply, () => {
            setCallStatus('listening')
            startListening()
          })
        })
        .catch(() => {
          if (!callActiveRef.current) return
          setCallStatus('listening')
          startListening()
        })
    },
    [speak, startListening]
  )

  // -------------------------------------------------------------------------
  // Call lifecycle
  // -------------------------------------------------------------------------
  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const answerCall = useCallback(() => {
    const call = currentCallRef.current
    if (!call) return
    stopRing()
    socketRef.current?.emit('call:answer', { callId: call.id })
    if (!connectedRef.current) {
      fetch(`/api/calls/${call.id}`, {
        method: 'PATCH',
        headers: { ...authHeaders({ token: tokenRef.current } as AuthSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'answered' }),
      }).catch(() => {})
    }
    callActiveRef.current = true
    mutedRef.current = false
    setMuted(false)
    setState('in-call')
    setCallStatus('connecting')
    setInterimText('')
    stopAudioPlayback()
    setTurns([])
    setDuration(0)
    stopTimer()
    agentQueueRef.current = []
    agentProcessingRef.current = false
    processedAgentIdxRef.current = new Set()
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000)

    // opening greeting from the assistant
    fetch('/api/call/chat', {
      method: 'POST',
      headers: { ...authHeaders({ token: tokenRef.current } as AuthSession), 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId: call.id, text: '' }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!callActiveRef.current) return
        const reply = data?.reply || `أهلاً! المهمة "${call.taskName}" خلصت. تحب تفاصيل أكتر؟`
        setTurns((prev) => [...prev, { role: 'assistant', text: reply }])
        speak(
          reply,
          () => {
            setCallStatus('listening')
            startListening()
          },
          true
        )
      })
      .catch(() => {
        if (!callActiveRef.current) return
        const fallback = `أهلاً! المهمة "${call.taskName}" خلصت خلاص. تحب تفاصيل أكتر؟`
        setTurns((prev) => [...prev, { role: 'assistant', text: fallback }])
        speak(
          fallback,
          () => {
            setCallStatus('listening')
            startListening()
          },
          true
        )
      })
  }, [speak, startListening])

  function endCall() {
    const call = currentCallRef.current
    const secs = duration
    callActiveRef.current = false
    stopRing()
    stopTimer()
    recognitionRef.current?.abort()
    recognitionRef.current = null
    stopAudioPlayback()
    speakingRef.current = false
    agentQueueRef.current = []
    agentProcessingRef.current = false
    setInterimText('')
    if (call) socketRef.current?.emit('call:end', { callId: call.id, durationSec: secs })
    if (!connectedRef.current && call) {
      fetch(`/api/calls/${call.id}`, {
        method: 'PATCH',
        headers: { ...authHeaders({ token: tokenRef.current } as AuthSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'ended', durationSec: secs }),
      }).catch(() => {})
    }
    if (stateRef.current === 'in-call') {
      setEndedInfo({ duration: secs, turns: turns.length })
      setState('ended')
    } else {
      setState('idle')
    }
    setCurrentCall(null)
  }

  function declineCall() {
    const call = currentCallRef.current
    callActiveRef.current = false
    stopRing()
    stopAudioPlayback()
    speakingRef.current = false
    agentQueueRef.current = []
    agentProcessingRef.current = false
    setInterimText('')
    if (call) socketRef.current?.emit('call:decline', { callId: call.id })
    if (!connectedRef.current && call) {
      fetch(`/api/calls/${call.id}`, {
        method: 'PATCH',
        headers: { ...authHeaders({ token: tokenRef.current } as AuthSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'declined' }),
      }).catch(() => {})
    }
    setState('idle')
    setCurrentCall(null)
  }

  function toggleMute() {
    const next = !muted
    setMuted(next)
    mutedRef.current = next
    if (next) {
      recognitionRef.current?.abort()
    } else if (callActiveRef.current && !speakingRef.current) {
      startListening()
    }
  }

  function sendTextFallback() {
    const text = textInput.trim()
    if (!text || !callActiveRef.current || speakingRef.current) return
    setTextInput('')
    recognitionRef.current?.abort()
    handleUserUtterance(text)
  }

  // -------------------------------------------------------------------------
  // Push subscription
  // -------------------------------------------------------------------------
  async function enablePush() {
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return
      const reg = await navigator.serviceWorker.ready
      const cfg = await fetch('/api/config').then((r) => r.json())
      const key = cfg.vapidPublicKey as string
      const existing = await reg.pushManager.getSubscription()
      const sub =
        existing ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }))
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { ...authHeaders({ token: tokenRef.current } as AuthSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), token: tokenRef.current }),
      })
      setPushEnabled(true)
    } catch {
      /* push unsupported (e.g. iOS not installed) */
    }
  }

  async function installApp() {
    installPromptRef.current?.prompt()
    installPromptRef.current = null
    setInstallReady(false)
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------
  function logout() {
    clearAuth()
    setAuth(null)
    setConnected(false)
    setLastCalls([])
    setPushEnabled(false)
  }

  const urgencyLabel: Record<string, { text: string; cls: string }> = {
    low: { text: 'استعجال عادي', cls: 'bg-zinc-700 text-zinc-200' },
    normal: { text: 'استعجال متوسط', cls: 'bg-amber-600 text-white' },
    high: { text: 'مستعجلة!', cls: 'bg-red-600 text-white' },
  }

  const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // -------------------------------------------------------------------------

  if (!authLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin" />
      </div>
    )
  }

  if (!auth) {
    return <LoginForm onLogin={setAuth} app="phone" />
  }

  if (state === 'ringing' && currentCall) {
    return <RingingScreen call={currentCall} onAnswer={answerCall} onDecline={declineCall} urgencyLabel={urgencyLabel} />
  }

  if (state === 'in-call' && currentCall) {
    return (
      <InCallScreen
        call={currentCall}
        turns={turns}
        status={callStatus}
        muted={muted}
        duration={duration}
        sttSupported={sttSupported}
        interimText={interimText}
        textInput={textInput}
        setTextInput={setTextInput}
        onSendText={sendTextFallback}
        onToggleMute={toggleMute}
        onEnd={endCall}
        turnsEndRef={turnsEndRef}
        urgencyLabel={urgencyLabel}
      />
    )
  }

  if (state === 'ended') {
    return (
      <EndedScreen
        info={endedInfo || { duration: duration, turns: turns.length }}
        onDone={() => {
          setEndedInfo(null)
          setState('idle')
        }}
      />
    )
  }

  // ------------------------------ idle / missed ------------------------------
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50 via-white to-white">
      <header className="bg-gradient-to-l from-emerald-700 to-emerald-600 text-white px-5 pt-8 pb-10 rounded-b-[2rem] shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Phone className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold leading-tight">نداء</h1>
              <p className="text-emerald-100 text-sm">مكالمات المساعد الذكي</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${connected ? 'bg-white/20' : 'bg-black/20'}`}
            >
              {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {connected ? 'متصل' : 'غير متصل'}
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full bg-white/15">
              <UserRound className="w-3.5 h-3.5" />
              <span className="max-w-24 truncate">{auth.displayName || auth.username}</span>
              <button
                onClick={logout}
                aria-label="تسجيل خروج"
                title="تسجيل خروج"
                className="w-6 h-6 rounded-full bg-black/25 hover:bg-black/40 flex items-center justify-center transition"
              >
                <LogOut className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 space-y-4 max-w-md w-full mx-auto">
        {state === 'missed' && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 flex items-center gap-3">
            <PhoneMissed className="w-5 h-5 shrink-0" />
            <p className="text-sm font-semibold">فاتتك مكالمة! المساعد استنى 45 ثانية ولو مفيش رد سجلها كمكالمة فايتة.</p>
          </div>
        )}

        <div className="bg-white border border-emerald-100 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${connected ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-400'}`}>
              <Phone className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-[15px]">{connected ? 'جاهز لاستقبال المكالمات' : 'بيحاول يوصل بالسيرفر...'}</p>
              <p className="text-xs text-zinc-500">{connected ? 'أول ما إيجنت يخلص مهمة هيرن عليك هنا فوراً' : 'شيك على النت أو افتح الصفحة تاني'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 pt-1">
            <Button
              onClick={() => {
                unlockAudio()
                setAudioUnlocked(true)
              }}
              variant={audioUnlocked ? 'secondary' : 'default'}
              className="w-full h-12 rounded-xl"
              disabled={audioUnlocked}
            >
              <Volume2 className="w-4 h-4 ml-2" />
              {audioUnlocked ? 'صوت الرنين مفعّل' : 'تفعيل صوت الرنين (مهم!)'}
            </Button>

            <Button onClick={enablePush} variant={pushEnabled ? 'secondary' : 'outline'} className="w-full h-12 rounded-xl" disabled={pushEnabled}>
              <Bell className="w-4 h-4 ml-2" />
              {pushEnabled ? 'الإشعارات مفعّلة' : 'تفعيل إشعارات المكالمات'}
            </Button>

            {installReady && (
              <Button onClick={installApp} className="w-full h-12 rounded-xl bg-emerald-700 hover:bg-emerald-800">
                <Download className="w-4 h-4 ml-2" />
                ثبّت التطبيق على الهاتف
              </Button>
            )}
          </div>

          {!pushEnabled && (
            <p className="text-[11px] leading-5 text-zinc-500 bg-zinc-50 rounded-xl p-3">
              نصيحة: على آيفون لازم تضيف الصفحة للشاشة الرئيسية (زر المشاركة ← Add to Home Screen) قبل تفعيل الإشعارات. على أندرويد بيشتغل من غير خطوات.
            </p>
          )}
        </div>

        <div className="bg-white border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-[15px]">آخر المكالمات</h2>
            <Badge variant="secondary" className="text-xs">
              {lastCalls.length}
            </Badge>
          </div>
          {lastCalls.length === 0 ? (
            <p className="text-sm text-zinc-400 py-6 text-center">لسه مفيش مكالمات — جرّب زر «مكالمة تجريبية» من لوحة التحكم</p>
          ) : (
            <div className="divide-y">
              {lastCalls.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-2.5">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      c.status === 'missed' ? 'bg-red-100 text-red-600' : c.status === 'ringing' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {c.status === 'missed' ? <PhoneMissed className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{c.taskName}</p>
                    <p className="text-[11px] text-zinc-500">
                      {new Date(c.createdAt).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                      {c.durationSec ? ` — ${fmtDuration(c.durationSec)}` : ''}
                    </p>
                  </div>
                  <Badge variant={c.status === 'missed' ? 'destructive' : 'secondary'} className="text-[10px] shrink-0">
                    {c.status === 'missed' ? 'فاتت' : c.status === 'ringing' ? 'بتنال' : c.status === 'completed' ? 'خلصت' : c.status === 'answered' ? 'تم الرد' : 'مرفوضة'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-[12px] leading-6 text-emerald-900">
          <p className="font-bold mb-1">إزاي يجيلك رنين حقيقي؟</p>
          سيب الصفحة دي مفتوحة (أو ثبّتها كتطبيق) — لما الإيجنت يخلص مهمة هتسمع جرس وتهتز الموبايل وتطلع شاشة مكالمة. لو التطبيق مقفول هيوصلك إشعار بيفتح المكالمة بضغطة.
        </div>
      </main>

      <footer className="mt-auto text-center text-[11px] text-zinc-400 pb-6 pt-2">نداء — MCP Voice Caller</footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-screens
// ---------------------------------------------------------------------------

/** Animated waveform shown while the assistant speaks. */
function VoiceBars() {
  return (
    <span className="flex items-end gap-[3px] h-4" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="w-[3px] rounded-full bg-emerald-400 voicebar" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </span>
  )
}

function RingingScreen({
  call,
  onAnswer,
  onDecline,
  urgencyLabel,
}: {
  call: CallData
  onAnswer: () => void
  onDecline: () => void
  urgencyLabel: Record<string, { text: string; cls: string }>
}) {
  const u = urgencyLabel[call.urgency] || urgencyLabel.normal
  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black text-white flex flex-col items-center justify-between px-6 py-12">
      <div className="text-center mt-6">
        <p className="text-emerald-400 text-sm font-semibold tracking-wide mb-2">مكالمة واردة من المساعد</p>
        <h1 className="text-3xl font-extrabold mb-3">{call.taskName}</h1>
        <Badge className={`${u.cls} border-0 text-xs px-3 py-1`}>{u.text}</Badge>
      </div>

      <div className="relative flex items-center justify-center">
        <div className="absolute w-44 h-44 rounded-full bg-emerald-500/20 animate-ping" />
        <div className="absolute w-44 h-44 rounded-full bg-emerald-500/10 animate-pulse" />
        <div className="relative w-40 h-40 rounded-full bg-gradient-to-b from-emerald-500 to-emerald-700 flex items-center justify-center shadow-2xl">
          <Phone className="w-16 h-16" />
        </div>
      </div>

      <div className="w-full max-w-sm space-y-6">
        {(call.summary || call.result) && (
          <div className="bg-white/10 backdrop-blur rounded-2xl p-4 text-center space-y-2.5">
            {call.summary && (
              <div>
                <p className="text-xs text-zinc-400 mb-1">ملخص سريع</p>
                <p className="text-sm leading-6 text-zinc-100 line-clamp-3">{call.summary}</p>
              </div>
            )}
            {call.result && (
              <div>
                <p className="text-xs text-emerald-400 mb-1 font-semibold">النتيجة الفعلية</p>
                <p className="text-sm leading-6 text-zinc-100 line-clamp-3">{call.result}</p>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-center gap-16">
          <button
            onClick={onDecline}
            aria-label="رفض المكالمة"
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-[68px] h-[68px] rounded-full bg-red-600 group-active:scale-95 transition flex items-center justify-center shadow-lg">
              <PhoneOff className="w-7 h-7" />
            </div>
            <span className="text-xs text-zinc-400">رفض</span>
          </button>
          <button
            onClick={onAnswer}
            aria-label="رد على المكالمة"
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-[68px] h-[68px] rounded-full bg-emerald-600 group-active:scale-95 transition flex items-center justify-center shadow-lg animate-bounce">
              <Phone className="w-7 h-7" />
            </div>
            <span className="text-xs text-emerald-400 font-bold">رد</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function InCallScreen({
  call,
  turns,
  status,
  muted,
  duration,
  sttSupported,
  interimText,
  textInput,
  setTextInput,
  onSendText,
  onToggleMute,
  onEnd,
  turnsEndRef,
  urgencyLabel,
}: {
  call: CallData
  turns: Turn[]
  status: 'connecting' | 'speaking' | 'listening' | 'thinking'
  muted: boolean
  duration: number
  sttSupported: boolean
  interimText: string
  textInput: string
  setTextInput: (v: string) => void
  onSendText: () => void
  onToggleMute: () => void
  onEnd: () => void
  turnsEndRef: React.RefObject<HTMLDivElement | null>
  urgencyLabel: Record<string, { text: string; cls: string }>
}) {
  const statusText =
    status === 'connecting'
      ? 'بيجهّز التقرير الصوتي...'
      : status === 'speaking'
        ? 'المساعد بيتكلم...'
        : status === 'thinking'
          ? 'المساعد بيفكر...'
          : muted
            ? 'ميكروفون مقفول'
            : 'بسمعك — اتكلم براحتك'

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black text-white flex flex-col">
      {/* header */}
      <div className="px-6 pt-8 pb-3 text-center border-b border-white/10">
        <p className="text-emerald-400 text-xs font-semibold mb-1">مكالمة مع المساعد نداء</p>
        <h2 className="text-xl font-bold">{call.taskName}</h2>
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="text-sm text-zinc-400 font-mono">{Math.floor(duration / 60)}:{String(duration % 60).padStart(2, '0')}</span>
          <Badge className={`${(urgencyLabel[call.urgency] || urgencyLabel.normal).cls} border-0 text-[10px]`}>
            {(urgencyLabel[call.urgency] || urgencyLabel.normal).text}
          </Badge>
        </div>
        <p className="text-xs mt-2 text-zinc-300 flex items-center justify-center gap-2">
          {status === 'thinking' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : status === 'speaking' ? (
            <VoiceBars />
          ) : (
            <span className={`w-2 h-2 rounded-full ${muted ? 'bg-zinc-500' : 'bg-amber-400 animate-pulse'}`} />
          )}
          {statusText}
        </p>
      </div>

      {/* transcript */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {turns.length === 0 && (
          <p className="text-center text-zinc-500 text-sm mt-8">المكالمة فاتحة — المساعد هيبلّغ التقرير حالاً...</p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                t.role === 'user'
                  ? 'bg-zinc-800 text-zinc-100'
                  : t.role === 'agent'
                    ? 'bg-indigo-600/90 text-white border border-indigo-400/30'
                    : 'bg-emerald-700/90 text-white'
              }`}
            >
              <p className="text-[10px] opacity-70 mb-0.5 flex items-center gap-1">
                {t.role === 'user' ? 'أنت' : t.role === 'agent' ? 'تحديث مباشر من الإيجنت' : 'نداء'}
              </p>
              {t.text}
            </div>
          </div>
        ))}
        {interimText && status === 'listening' && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 bg-zinc-800/60 text-zinc-300 border border-dashed border-zinc-600">
              <p className="text-[10px] opacity-60 mb-0.5">أنت بتقول دلوقتي...</p>
              {interimText}
            </div>
          </div>
        )}
        <div ref={turnsEndRef} />
      </div>

      {/* controls */}
      <div className="px-4 pb-6 pt-2 space-y-3 border-t border-white/10 bg-black/30 backdrop-blur">
        {!sttSupported && (
          <p className="text-[11px] text-amber-400 text-center leading-5">
            التعرف على الصوت غير مدعوم في المتصفح ده — استخدم الكتابة تحت، أو افتح التطبيق في Chrome على الموبايل.
          </p>
        )}
        <div className="flex items-center justify-center gap-12">
          <button onClick={onToggleMute} aria-label={muted ? 'فتح الميكروفون' : 'كتم الميكروفون'} className="flex flex-col items-center gap-1.5">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center transition ${muted ? 'bg-zinc-700' : 'bg-white/15'}`}>
              {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </div>
            <span className="text-[11px] text-zinc-400">{muted ? 'مكتوم' : 'مايك'}</span>
          </button>
          <button onClick={onEnd} aria-label="إنهاء المكالمة" className="flex flex-col items-center gap-1.5">
            <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg active:scale-95 transition">
              <PhoneOff className="w-7 h-7" />
            </div>
            <span className="text-[11px] text-zinc-400">إنهاء</span>
          </button>
        </div>
        <div className="flex gap-2">
          <Input
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSendText()}
            placeholder="أو اكتب رسالة بدل الكلام..."
            className="bg-white/10 border-white/15 text-white placeholder:text-zinc-500 rounded-xl h-11"
          />
          <Button onClick={onSendText} disabled={!textInput.trim()} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl h-11 px-4">
            <MessageSquare className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function EndedScreen({ info, onDone }: { info: { duration: number; turns: number }; onDone: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-zinc-900 to-black text-white flex flex-col items-center justify-center px-8 text-center gap-6">
      <div className="w-20 h-20 rounded-full bg-emerald-600/20 flex items-center justify-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-400" />
      </div>
      <div>
        <h2 className="text-2xl font-extrabold mb-2">المكالمة خلصت</h2>
        <p className="text-zinc-400 text-sm">
          المدة: {Math.floor(info.duration / 60)}:{String(info.duration % 60).padStart(2, '0')} — {info.turns} رسالة في المحادثة
        </p>
        <p className="text-zinc-500 text-xs mt-2">تقدر ترجع للسجل من لوحة التحكم في أي وقت</p>
      </div>
      <Button onClick={onDone} className="bg-emerald-600 hover:bg-emerald-700 rounded-xl h-12 px-8">
        تمام، رجوع
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
