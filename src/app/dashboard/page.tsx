'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { LoginForm } from '@/components/login-form'
import { authHeaders, clearAuth, getAuth, updateAuthToken, type AuthSession } from '@/lib/client-auth'
import {
  Copy, Check, Phone, Smartphone, Activity, PhoneOutgoing, History, Link2,
  KeyRound, RefreshCw, FlaskConical, Zap, CircleDot, Terminal, Timer, PhoneMissed,
  AudioLines, Eye, EyeOff, Save, CirclePlay, LogOut, UserRound, Brain, Sparkles,
} from 'lucide-react'

// ---------------------------------------------------------------------------

type CallRecord = {
  id: string
  source: string
  taskName: string
  summary: string | null
  result: string | null
  message: string | null
  urgency: string
  status: string
  createdAt: string
  durationSec: number | null
  transcript: string | null
}

type FeedItem = { id: number; ts: string; text: string; kind: 'call' | 'info' | 'warn' }

const STATUS_AR: Record<string, string> = {
  ringing: 'بتنال',
  answered: 'تم الرد',
  completed: 'خلصت',
  declined: 'مرفوضة',
  missed: 'فاتت',
}

const SOURCE_AR: Record<string, string> = {
  mcp: 'MCP',
  rest: 'REST',
  test: 'تجريبية',
}

// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { toast } = useToast()
  const [auth, setAuth] = useState<AuthSession | null>(null)
  const [authLoaded, setAuthLoaded] = useState(false)
  const [origin, setOrigin] = useState<string>('')
  const [phoneOnline, setPhoneOnline] = useState(false)
  const [calls, setCalls] = useState<CallRecord[]>([])
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [testing, setTesting] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string>('')
  const [fishKey, setFishKey] = useState('')
  const [fishVoice, setFishVoice] = useState('')
  const [fishInfo, setFishInfo] = useState<{ configured: boolean; apiKeyMasked: string | null; voiceId: string | null; model: string } | null>(null)
  const [showFishKey, setShowFishKey] = useState(false)
  const [savingFish, setSavingFish] = useState(false)
  const [testingFish, setTestingFish] = useState(false)
  const [llmKey, setLlmKey] = useState('')
  const [llmBaseUrl, setLlmBaseUrl] = useState('')
  const [llmModel, setLlmModel] = useState('')
  const [llmInfo, setLlmInfo] = useState<{ configured: boolean; apiKeyMasked: string | null; baseUrl: string; model: string; presets?: Array<{ label: string; baseUrl: string; model: string }> } | null>(null)
  const [showLlmKey, setShowLlmKey] = useState(false)
  const [savingLlm, setSavingLlm] = useState(false)
  const [testingLlm, setTestingLlm] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const feedIdRef = useRef(0)
  const fishAudioRef = useRef<HTMLAudioElement | null>(null)
  const authRef = useRef<AuthSession | null>(null)
  useEffect(() => {
    authRef.current = auth
  }, [auth])

  const pushFeed = useCallback((text: string, kind: FeedItem['kind']) => {
    feedIdRef.current += 1
    setFeed((prev) => [{ id: feedIdRef.current, ts: new Date().toISOString(), text, kind }, ...prev].slice(0, 30))
  }, [])

  const refreshCalls = useCallback(async () => {
    const token = authRef.current?.token
    if (!token) return
    try {
      const res = await fetch('/api/calls', { headers: authHeaders({ token } as AuthSession) })
      if (!res.ok) return
      const data = await res.json()
      setCalls(data?.calls || [])
    } catch {
      /* ignore */
    }
  }, [])

  const refreshConfig = useCallback(async () => {
    const token = authRef.current?.token
    if (!token) return
    try {
      const res = await fetch('/api/calls', { headers: authHeaders({ token } as AuthSession) })
      setLoaded(true)
      if (!res.ok) return
      const data = await res.json()
      setCalls(data?.calls || [])
    } catch {
      setLoaded(true)
    }
  }, [])

  const refreshFish = useCallback(async () => {
    const token = authRef.current?.token
    if (!token) return
    try {
      const res = await fetch('/api/settings/fish-audio', { headers: authHeaders({ token } as AuthSession) })
      if (!res.ok) return
      const data = await res.json()
      if (data?.ok) {
        setFishInfo({
          configured: !!data.configured,
          apiKeyMasked: data.apiKeyMasked,
          voiceId: data.voiceId || '',
          model: data.model || 's2.1-pro-free',
        })
        setFishVoice((v) => v || data.voiceId || '')
      }
    } catch {
      /* ignore */
    }
  }, [])

  // load fish.audio settings once the account is available
  useEffect(() => {
    if (auth?.token) refreshFish()
  }, [auth?.token, refreshFish])

  const refreshLlm = useCallback(async () => {
    const token = authRef.current?.token
    if (!token) return
    try {
      const res = await fetch('/api/settings/llm', { headers: authHeaders({ token } as AuthSession) })
      if (!res.ok) return
      const data = await res.json()
      if (data?.ok) {
        setLlmInfo({
          configured: !!data.configured,
          apiKeyMasked: data.apiKeyMasked,
          baseUrl: data.baseUrl || '',
          model: data.model || '',
          presets: data.presets,
        })
        setLlmBaseUrl((v) => v || data.baseUrl || '')
        setLlmModel((v) => v || data.model || '')
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (auth?.token) refreshLlm()
  }, [auth?.token, refreshLlm])

  // auth boot: restore the saved session (or show the login gate)
  useEffect(() => {
    setOrigin(window.location.origin)
    const saved = getAuth()
    if (saved) setAuth(saved)
    setAuthLoaded(true)
  }, [])

  // the dashboard is Arabic-only — restore rtl if the landing page switched
  // the document to English/ltr before navigating here
  useEffect(() => {
    document.documentElement.lang = 'ar'
    document.documentElement.dir = 'rtl'
  }, [])

  // main boot: only after login — socket room + calls feed are scoped to this account
  useEffect(() => {
    if (!auth?.token) return
    const token = auth.token
    setLoaded(false)
    refreshConfig()
    refreshCalls()

    // phone online status via heartbeat API (works on Vercel, where the socket
    // mini-service doesn't run). The socket 'phone-online' handler below still
    // overrides it instantly on the local setup.
    const refreshPhoneStatus = () => {
      fetch('/api/phone/status', { headers: authHeaders({ token } as AuthSession) })
        .then((r) => r.json())
        .then((d) => setPhoneOnline(!!d?.online))
        .catch(() => {})
    }
    refreshPhoneStatus()

    // live feed over socket.io (per-account room dash:<userId>)
    // Optional: when NEXT_PUBLIC_SOCKET_URL is not set (e.g. Vercel serverless),
    // the dashboard relies on the /api/calls polling below instead.
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL
    if (socketUrl) {
      const socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        forceNew: true,
        reconnection: true,
        timeout: 10000,
      })
      socketRef.current = socket
      socket.on('connect', () => socket.emit('join:dash', { token }))
      socket.on('phone-online', (data: { online?: boolean }) => {
        setPhoneOnline(!!data?.online)
        pushFeed(data?.online ? 'تطبيق الموبايل اتصل بالسيرفر — جاهز للرنين' : 'تطبيق الموبايل قطع الاتصال', 'info')
      })
      socket.on('incoming-call', (call: CallRecord) => {
        pushFeed(`مكالمة واردة: «${call.taskName}» (${SOURCE_AR[call.source] || call.source})`, 'call')
        refreshCalls()
      })
      socket.on('call-answered', (d: { callId?: string }) => {
        pushFeed('المستخدم رد على المكالمة — المساعد بدأ يتكلم', 'call')
        refreshCalls()
      })
      socket.on('call-ended', (d: { callId?: string; durationSec?: number }) => {
        pushFeed(`المكالمة اتقفلت${d?.durationSec ? ` — المدة ${d.durationSec} ثانية` : ''}`, 'call')
        refreshCalls()
      })
      socket.on('call-missed', () => {
        pushFeed('المكالمة فاتت — مفيش رد خلال 45 ثانية', 'warn')
        refreshCalls()
      })
      socket.on('agent-update', (d: { callId?: string; message?: string }) => {
        pushFeed(`الإيجنت بعت تحديث مباشر جوه المكالمة: «${d?.message || ''}»`, 'call')
      })
      socket.on('call-updated', () => refreshCalls())
    }

    const poll = setInterval(refreshConfig, 15000)
    const statusPoll = setInterval(refreshPhoneStatus, 20000)
    return () => {
      clearInterval(poll)
      clearInterval(statusPoll)
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [auth?.token, refreshConfig, refreshCalls, pushFeed])

  // ---------------------------------------------------------------------------

  const copy = useCallback(
    (text: string, key: string, label: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopiedKey(key)
          setTimeout(() => setCopiedKey(''), 2000)
          toast({ title: 'تم النسخ', description: label })
        })
        .catch(() => toast({ title: 'فشل النسخ', description: 'انسخه يدوياً من الصندوق', variant: 'destructive' }))
    },
    [toast]
  )

  const mcpUrl = auth?.token ? `${origin || 'https://<your-domain>'}/api/mcp?token=${auth.token}` : ''
  const notifyUrl = auth?.token ? `${origin || 'https://<your-domain>'}/api/notify?token=${auth.token}` : ''

  function logout() {
    clearAuth()
    setAuth(null)
    setCalls([])
    setFeed([])
    setFishInfo(null)
    setLlmInfo(null)
    setLlmKey('')
    setLlmBaseUrl('')
    setLlmModel('')
    setLoaded(false)
    toast({ title: 'خرجت من حسابك', description: 'الجلسة اتقفلت على الجهاز ده بس' })
  }

  async function runTestCall() {
    setTesting(true)
    try {
      const res = await fetch('/api/test-call', { method: 'POST', headers: authHeaders(auth) })
      const data = await res.json()
      if (data?.ok) {
        toast({
          title: 'المكالمة التجريبية بتبدأ',
          description: phoneOnline ? 'افتح صفحة /phone على الموبايل وهترن حالاً' : 'التطبيق مش متصل — هيتبعت إشعار Push بدلاً من الرنين المباشر',
        })
        pushFeed('تم طلب مكالمة تجريبية من لوحة التحكم', 'call')
        refreshCalls()
      } else {
        toast({ title: 'فشل طلب المكالمة', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'فشل الاتصال بالسيرفر', variant: 'destructive' })
    } finally {
      setTesting(false)
    }
  }

  async function regenerateToken() {
    try {
      const res = await fetch('/api/auth/regenerate-token', {
        method: 'POST',
        headers: authHeaders(auth),
      })
      const data = await res.json()
      if (data?.ok && data.token) {
        updateAuthToken(data.token)
        setAuth((a) => (a ? { ...a, token: data.token } : a))
        toast({ title: 'توكن جديد اتولّد', description: 'حدّث الرابط عند العملاء اللي مربوطة بالتوكن القديم' })
      } else {
        toast({ title: 'فشل تغيير التوكن', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'فشل الاتصال', variant: 'destructive' })
    }
  }

  async function saveFish() {
    setSavingFish(true)
    try {
      const res = await fetch('/api/settings/fish-audio', {
        method: 'POST',
        headers: { ...authHeaders(auth), 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: fishKey.trim(), voice_id: fishVoice.trim() }),
      })
      const data = await res.json()
      if (data?.ok) {
        setFishInfo({
          configured: !!data.configured,
          apiKeyMasked: data.apiKeyMasked,
          voiceId: data.voiceId || '',
          model: fishInfo?.model || 's2.1-pro-free',
        })
        setFishKey('')
        setShowFishKey(false)
        toast({ title: 'إعدادات الصوت اتسجّلت', description: `المفتاح: ${data.apiKeyMasked}` })
      } else {
        toast({ title: 'فشل الحفظ', description: data?.error || 'حاول تاني', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'فشل الاتصال', variant: 'destructive' })
    } finally {
      setSavingFish(false)
    }
  }

  async function saveLlm(reset = false) {
    setSavingLlm(true)
    try {
      const res = await fetch('/api/settings/llm', {
        method: 'POST',
        headers: { ...authHeaders(auth), 'Content-Type': 'application/json' },
        body: JSON.stringify(
          reset
            ? { reset: true }
            : { api_key: llmKey.trim(), base_url: llmBaseUrl.trim(), model: llmModel.trim() }
        ),
      })
      const data = await res.json()
      if (data?.ok) {
        setLlmInfo({
          configured: !!data.configured,
          apiKeyMasked: data.apiKeyMasked,
          baseUrl: data.baseUrl || '',
          model: data.model || '',
          presets: llmInfo?.presets,
        })
        setLlmKey('')
        setShowLlmKey(false)
        toast(
          reset
            ? { title: 'تم مسح مفتاح الذكاء الاصطناعي', description: 'المكالمة هترد دلوقتي من بيانات المهمة بس' }
            : { title: 'دماغ النداء اتسجّلت', description: `المفتاح: ${data.apiKeyMasked} — المكالمة هتبقى حوار حر من دلوقتي` }
        )
      } else {
        toast({ title: 'فشل الحفظ', description: data?.error || 'حاول تاني', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'فشل الاتصال', variant: 'destructive' })
    } finally {
      setSavingLlm(false)
    }
  }

  async function testLlm() {
    if (testingLlm) return
    setTestingLlm(true)
    try {
      const res = await fetch('/api/settings/llm/test', {
        method: 'POST',
        headers: { ...authHeaders(auth), 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data?.ok) {
        toast({
          title: 'الدماغ شغالة تمام',
          description: `الموديل ${data.model} رد في ${(data.ms / 1000).toFixed(1)} ثانية: «${(data.reply || '').slice(0, 50)}»`,
        })
      } else {
        toast({ title: 'الدماغ مش شغالة', description: data?.error || 'راجع المفتاح أو اسم الموديل', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'فشل الاتصال', variant: 'destructive' })
    } finally {
      setTestingLlm(false)
    }
  }

  async function testFish() {
    if (testingFish) return
    setTestingFish(true)
    try {
      const res = await fetch('/api/settings/fish-audio/test', {
        method: 'POST',
        headers: { ...authHeaders(auth), 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: fishKey.trim() || undefined, voice_id: fishVoice.trim() || undefined }),
      })
      const data = await res.json()
      if (data?.ok && data.audio) {
        const bin = atob(data.audio)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const url = URL.createObjectURL(new Blob([bytes], { type: data.mime || 'audio/mpeg' }))
        const el = fishAudioRef.current || new Audio()
        fishAudioRef.current = el
        el.src = url
        el.play().catch(() => {})
        toast({ title: 'الصوت شغال تمام', description: `عينة صوت اتولدت في ${(data.ms / 1000).toFixed(1)} ثانية — اسمعها دلوقتي` })
      } else {
        toast({ title: 'الصوت مش شغال', description: data?.error || 'راجع المفتاح أو رقم الصوت', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'فشل الاتصال', variant: 'destructive' })
    } finally {
      setTestingFish(false)
    }
  }

  // config snippets -----------------------------------------------------------

  const claudeDesktopSteps = [
    'افتح Claude Desktop ← Settings ← Connectors ← Add custom connector',
    'الصق الرابط: ' + mcpUrl,
    'بعد الإضافة، اطلب من Claude: "لما تخلص أي مهمة استخدم أداة notify_task_complete"',
  ].join('\n')

  const claudeCodeCmd = `claude mcp add --transport http nidaa "${mcpUrl}"`

  const genericJson = JSON.stringify({ mcpServers: { nidaa: { url: mcpUrl, transport: 'http' } } }, null, 2)

  const chatgptSteps = [
    '1) في ChatGPT: Settings ← Connectors (أو Apps & Connectors) ← Create (Developer mode)',
    '2) الاسم: nidaa — الـ MCP Server URL: ' + mcpUrl,
    '3) فعّل الـ connector في المحادثة أو في الـ GPT بتاعك',
    '4) للجدولة اليومية: اكتب طلبك عادي واطلب "فعّل Scheduled task" — وضيف تعليمة ثابتة:',
    '   "بعد ما تخلص أي مهمة، استخدم أداة notify_task_complete وابعت task_name وsummary وresult بالعربي — result فيه إيه اللي حصل فعلاً بالأرقام"',
    '5) الأهم — المكالمة جلسة حية مش إشعار: بعد notify_task_complete لفّ على wait_for_call_updates لحد ما المكالمة تخلص، نفذ أي طلب المستخدم يكله أثناء المكالمة (زي رد على إيميل)، وابعت النتيجة جوه نفس المكالمة بـ send_call_update وهيتقاله بصوت المساعد في نفس اللحظة. متقفلش الرد ما دامت المكالمة شغالة.',
  ].join('\n')

  const curlSnippet = `curl -X POST "${notifyUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"task_name":"فحص البريد","summary":"لقيت 3 رسايل جديدة مهمة","result":"رسالة من المدير قبل الـ 5، ورسالتين من الدعم، و42 سبام اتمسح"}'`

  const stats = {
    total: calls.length,
    answered: calls.filter((c) => c.status === 'answered' || c.status === 'completed').length,
    missed: calls.filter((c) => c.status === 'missed').length,
  }

  // ---------------------------------------------------------------------------

  if (!authLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin" />
      </div>
    )
  }

  if (!auth) {
    return (
      <div>
        <LoginForm onLogin={setAuth} app="dashboard" />
        <div className="fixed bottom-4 inset-x-0 flex justify-center" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <a
            href="/"
            className="inline-flex items-center gap-2 bg-white/90 backdrop-blur border border-emerald-200 rounded-full px-4 py-2 text-xs font-bold text-emerald-700 shadow-md hover:bg-emerald-50 transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            شوف مميزات نداء كلها — الصفحة الرئيسية
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50/70 via-white to-white">
      {/* header */}
      <header className="bg-gradient-to-l from-emerald-800 to-emerald-600 text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Phone className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold leading-tight">نداء — MCP Voice Caller</h1>
              <p className="text-emerald-100 text-xs sm:text-sm">لما مهمة تخلص… المساعد يتصل بيك مكالمة حقيقية</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full ${phoneOnline ? 'bg-white/20' : 'bg-black/25'}`}
              title="حالة تطبيق الموبايل"
            >
              <CircleDot className={`w-4 h-4 ${phoneOnline ? 'text-emerald-300' : 'text-zinc-300'}`} />
              {phoneOnline ? 'الموبايل متصل وجاهز للرنين' : 'الموبايل غير متصل (هيتبعت إشعار Push)'}
            </div>
            <div
              className="flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-full bg-white/15"
              title="الحساب الحالي — كل حساب له توكنه وصوته ومكالماته"
            >
              <UserRound className="w-4 h-4" />
              <span className="max-w-36 truncate">{auth.displayName || auth.username}</span>
              <button
                onClick={logout}
                aria-label="تسجيل خروج"
                title="تسجيل خروج"
                className="w-7 h-7 rounded-full bg-black/25 hover:bg-black/40 flex items-center justify-center transition"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {!loaded ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-zinc-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={<Smartphone className="w-5 h-5" />} label="حالة الموبايل" value={phoneOnline ? 'متصل' : 'غير متصل'} good={phoneOnline} />
              <StatCard icon={<History className="w-5 h-5" />} label="إجمالي المكالمات" value={String(stats.total)} />
              <StatCard icon={<PhoneOutgoing className="w-5 h-5" />} label="تم الرد" value={String(stats.answered)} good={stats.answered > 0} />
              <StatCard icon={<PhoneMissed className="w-5 h-5" />} label="فاتت بدون رد" value={String(stats.missed)} bad={stats.missed > 0} />
            </div>

            {/* MCP connection */}
            <Card className="border-emerald-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Link2 className="w-5 h-5 text-emerald-700" />
                  ربط الـ MCP مع ChatGPT / Claude / أي إيجنت
                </CardTitle>
                <CardDescription className="leading-6">
                  ده رابط السيرفر بتاعك — انسخه وضيفه في الأداة اللي تحبها. التوكن مولّد تلقائياً ومحمي بيه السيرفر.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <CodeBox value={mcpUrl} label="MCP Server URL" onCopy={copy} copied={copiedKey === 'mcp-url'} mono breakAll />

                <Tabs defaultValue="chatgpt" dir="rtl">
                  <TabsList className="grid grid-cols-3 sm:grid-cols-5 h-auto p-1 gap-1">
                    <TabsTrigger value="chatgpt" className="text-xs sm:text-sm px-2">ChatGPT</TabsTrigger>
                    <TabsTrigger value="claude-desktop" className="text-xs sm:text-sm px-2">Claude Desktop</TabsTrigger>
                    <TabsTrigger value="claude-code" className="text-xs sm:text-sm px-2">Claude Code</TabsTrigger>
                    <TabsTrigger value="cursor" className="text-xs sm:text-sm px-2">Cursor وغيره</TabsTrigger>
                    <TabsTrigger value="rest" className="text-xs sm:text-sm px-2">REST / أي أداة</TabsTrigger>
                  </TabsList>

                  <TabsContent value="chatgpt">
                    <SnippetsBlock
                      raw={chatgptSteps}
                      copyKey="chatgpt"
                      copiedKey={copiedKey}
                      onCopy={copy}
                      title="خطوات ربط ChatGPT"
                    />
                  </TabsContent>
                  <TabsContent value="claude-desktop">
                    <SnippetsBlock
                      raw={claudeDesktopSteps}
                      copyKey="claude-desktop"
                      copiedKey={copiedKey}
                      onCopy={copy}
                      title="خطوات ربط Claude Desktop"
                    />
                  </TabsContent>
                  <TabsContent value="claude-code">
                    <SnippetsBlock raw={claudeCodeCmd} copyKey="claude-code" copiedKey={copiedKey} onCopy={copy} title="أمر إضافة في الطرفية" mono />
                  </TabsContent>
                  <TabsContent value="cursor">
                    <SnippetsBlock
                      raw={genericJson}
                      copyKey="cursor"
                      copiedKey={copiedKey}
                      onCopy={copy}
                      title="ضع في ~/.cursor/mcp.json (وشغّال كمان في Windsurf / Cline وأي عميل MCP)"
                      mono
                    />
                  </TabsContent>
                  <TabsContent value="rest">
                    <SnippetsBlock
                      raw={curlSnippet}
                      copyKey="rest"
                      copiedKey={copiedKey}
                      onCopy={copy}
                      title="نداء مباشر من cron أو n8n أو Make أو أي سكريبت — بدون MCP"
                      mono
                    />
                  </TabsContent>
                </Tabs>

                <Separator />

                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={runTestCall} disabled={testing} className="bg-emerald-700 hover:bg-emerald-800 h-11 rounded-xl">
                    {testing ? <RefreshCw className="w-4 h-4 ml-2 animate-spin" /> : <FlaskConical className="w-4 h-4 ml-2" />}
                    مكالمة تجريبية دلوقتي
                  </Button>
                  <Button variant="outline" onClick={regenerateToken} className="h-11 rounded-xl">
                    <KeyRound className="w-4 h-4 ml-2" />
                    توليد توكن جديد
                  </Button>
                  <a href="/phone" target="_blank" rel="noreferrer" className="text-sm font-semibold text-emerald-700 hover:underline flex items-center gap-1.5 px-2">
                    <Smartphone className="w-4 h-4" />
                    فتح تطبيق الموبايل /phone
                  </a>
                </div>
              </CardContent>
            </Card>

            {/* voice engine settings (fish.audio) */}
            <Card className="border-emerald-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <AudioLines className="w-5 h-5 text-emerald-700" />
                  صوت المساعد — fish.audio
                </CardTitle>
                <CardDescription className="leading-6">
                  ده المحرك اللي بيحوّل كلام المساعد لصوت طبيعي في المكالمة. أي حد بيستخدم المشروع يقدر يضيف مفتاحه هنا من الواجهة — من غير أي كود.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge
                    variant="outline"
                    className={`border ${fishInfo?.configured ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}
                  >
                    {fishInfo?.configured ? 'المفتاح مفعّل واتخزن' : 'لسه بدون مفتاح'}
                  </Badge>
                  {fishInfo?.apiKeyMasked && (
                    <code dir="ltr" className="text-xs font-mono text-zinc-500 bg-zinc-50 border rounded px-2 py-1">
                      {fishInfo.apiKeyMasked}
                    </code>
                  )}
                  <a
                    href="https://fish.audio"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    الحصول على مفتاح من fish.audio ↗
                  </a>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fish-key" className="text-sm font-semibold">
                      مفتاح الـ API
                    </Label>
                    <div className="relative">
                      <Input
                        id="fish-key"
                        dir="ltr"
                        type={showFishKey ? 'text' : 'password'}
                        placeholder="sk-fish-..."
                        className="font-mono text-xs pl-10 h-11 rounded-xl"
                        value={fishKey}
                        onChange={(e) => setFishKey(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowFishKey((s) => !s)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                        aria-label={showFishKey ? 'إخفاء المفتاح' : 'إظهار المفتاح'}
                      >
                        {showFishKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-5">
                      لو سبته فاضي هيتسجل المفتاح المحفوظ حالياً زي ما هو.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="fish-voice" className="text-sm font-semibold">
                      رقم الصوت (Voice ID)
                    </Label>
                    <Input
                      id="fish-voice"
                      dir="ltr"
                      className="font-mono text-xs h-11 rounded-xl"
                      placeholder="12a85233597842b6a4e169c3db4ec1e0"
                      value={fishVoice}
                      onChange={(e) => setFishVoice(e.target.value)}
                    />
                    <p className="text-[11px] text-zinc-500 leading-5">
                      اختار أي صوت عربي من مكتبة fish.audio وانسخ الـ ID بتاعه هنا.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={saveFish} disabled={savingFish} className="bg-emerald-700 hover:bg-emerald-800 h-11 rounded-xl">
                    {savingFish ? <RefreshCw className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
                    حفظ الإعدادات
                  </Button>
                  <Button onClick={testFish} disabled={testingFish} variant="outline" className="h-11 rounded-xl">
                    {testingFish ? <RefreshCw className="w-4 h-4 ml-2 animate-spin" /> : <CirclePlay className="w-4 h-4 ml-2" />}
                    جرّب الصوت (هيتشغل صوتياً)
                  </Button>
                  <span className="text-xs text-zinc-400 font-mono" dir="ltr">
                    model: {fishInfo?.model || 's2.1-pro-free'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* AI brain settings (OpenAI-compatible LLM) */}
            <Card className="border-emerald-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Brain className="w-5 h-5 text-emerald-700" />
                  دماغ المساعد — الذكاء الاصطناعي
                </CardTitle>
                <CardDescription className="leading-6">
                  ده اللي بيخلي المساعد يرد على أي كلام بتقوله في المكالمة بحرية. من غيره المكالمة بترد من بيانات المهمة بس. مفتاح واحد مجاني وكل حاجة تشتغل — نفس النظام بتاع مفتاح الصوت بالظبط.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge
                    variant="outline"
                    className={`border ${llmInfo?.configured ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}
                  >
                    {llmInfo?.configured ? 'المفتاح مفعّل واتخزن' : 'لسه بدون مفتاح'}
                  </Badge>
                  {llmInfo?.apiKeyMasked && (
                    <code dir="ltr" className="text-xs font-mono text-zinc-500 bg-zinc-50 border rounded px-2 py-1">
                      {llmInfo.apiKeyMasked}
                    </code>
                  )}
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    مفتاح مجاني من OpenRouter ↗ (اسحب لتحت واضغط Create Key)
                  </a>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-1.5 md:col-span-3">
                    <Label htmlFor="llm-key" className="text-sm font-semibold">
                      مفتاح الـ API
                    </Label>
                    <div className="relative">
                      <Input
                        id="llm-key"
                        dir="ltr"
                        type={showLlmKey ? 'text' : 'password'}
                        placeholder="sk-or-v1-... (OpenRouter) أو أي مفتاح OpenAI-compatible"
                        className="font-mono text-xs pl-10 h-11 rounded-xl"
                        value={llmKey}
                        onChange={(e) => setLlmKey(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowLlmKey((s) => !s)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                        aria-label={showLlmKey ? 'إخفاء المفتاح' : 'إظهار المفتاح'}
                      >
                        {showLlmKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-5">
                      لو سبته فاضي هيتسجل المفتاح المحفوظ حالياً زي ما هو.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="llm-base" className="text-sm font-semibold">
                      الـ Base URL
                    </Label>
                    <Input
                      id="llm-base"
                      dir="ltr"
                      className="font-mono text-xs h-11 rounded-xl"
                      placeholder="https://openrouter.ai/api/v1"
                      value={llmBaseUrl}
                      onChange={(e) => setLlmBaseUrl(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="llm-model" className="text-sm font-semibold">
                      اسم الموديل
                    </Label>
                    <Input
                      id="llm-model"
                      dir="ltr"
                      className="font-mono text-xs h-11 rounded-xl"
                      placeholder="openrouter/free"
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    {(llmInfo?.presets || []).map((p) => (
                      <Button
                        key={p.baseUrl}
                        type="button"
                        variant="outline"
                        className="h-11 rounded-xl text-xs"
                        onClick={() => {
                          setLlmBaseUrl(p.baseUrl)
                          setLlmModel(p.model)
                        }}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => saveLlm(false)} disabled={savingLlm} className="bg-emerald-700 hover:bg-emerald-800 h-11 rounded-xl">
                    {savingLlm ? <RefreshCw className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
                    حفظ الإعدادات
                  </Button>
                  {llmInfo?.configured && (
                    <Button onClick={() => saveLlm(true)} disabled={savingLlm} variant="outline" className="h-11 rounded-xl">
                      مسح المفتاح
                    </Button>
                  )}
                  {llmInfo?.configured && (
                    <Button onClick={testLlm} disabled={testingLlm} variant="outline" className="h-11 rounded-xl">
                      {testingLlm ? <RefreshCw className="w-4 h-4 ml-2 animate-spin" /> : <FlaskConical className="w-4 h-4 ml-2" />}
                      اختبر الدماغ
                    </Button>
                  )}
                  <span className="text-xs text-zinc-400 font-mono" dir="ltr">
                    {llmInfo?.configured ? `${llmInfo.model} @ ${llmInfo.baseUrl.replace(/^https?:\/\//, '')}` : 'المكالمة حالياً بترود من بيانات المهمة بس'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* live feed + tools info */}
            <div className="grid lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="w-5 h-5 text-emerald-700" />
                    البث المباشر للمكالمات
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-72 w-full rounded-lg border bg-zinc-50/60 p-3">
                    {feed.length === 0 ? (
                      <p className="text-sm text-zinc-400 text-center py-10">مفيش حوادث لسه — أول مكالمة هتظهر هنا لحظة بلحظة</p>
                    ) : (
                      <div className="space-y-2">
                        {feed.map((f) => (
                          <div key={f.id} className="flex items-start gap-2.5 text-sm">
                            <span
                              className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                                f.kind === 'call' ? 'bg-emerald-500' : f.kind === 'warn' ? 'bg-red-500' : 'bg-zinc-400'
                              }`}
                            />
                            <span className="text-[11px] text-zinc-400 font-mono shrink-0 pt-0.5">
                              {new Date(f.ts).toLocaleTimeString('ar-EG')}
                            </span>
                            <span className={f.kind === 'warn' ? 'text-red-700 font-medium' : ''}>{f.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Zap className="w-5 h-5 text-emerald-700" />
                    الأدوات المتاحة للإيجنت
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                    <p className="font-bold text-emerald-900 mb-1">notify_task_complete</p>
                    <p className="text-emerald-800/80 text-[13px]">
                      الإيجنت يبعت اسم المهمة + الملخص (+ استعجال اختياري) ← بتبدأ مكالمة صوتية فوراً والمساعد يقرا الملخص ويرد على أسئلة المستخدم بالعربي المصري.
                    </p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                    <p className="font-bold text-indigo-900 mb-1">wait_for_call_updates + send_call_update</p>
                    <p className="text-indigo-800/80 text-[13px]">
                      المكالمة بقت جلسة حية: الإيجنت يسمع كلامك جوه المكالمة في نفس اللحظة (long-poll)، ينفذ طلبك (زي رد على إيميل)، ويبعت النتيجة بـ send_call_update فيتقالها بصوت المساعد والمكالمة متقفلش غير لما إنت تقفلها.
                    </p>
                  </div>
                  <div className="bg-zinc-50 border rounded-xl p-3">
                    <p className="font-bold mb-1">get_call_history</p>
                    <p className="text-zinc-500 text-[13px]">الإيجنت يشوف آخر المكالمات وحالتها (اتردت / فاتت) عشان يعرف وصلت التنبيهات ولا لأ.</p>
                  </div>
                  <p className="text-[12px] text-zinc-500 leading-6">
                    نصيحة للجدولة: في ChatGPT اكتب مهمة مجدولة زي «كل يوم 9 صباحاً افحص بريدي» وفي التعليمات اطلب منه ينده على الأداة بعد كل فحص ويفضل مفتوح على المكالمة لحد ما تقفلها بنفسك.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* calls table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <History className="w-5 h-5 text-emerald-700" />
                  سجل المكالمات
                </CardTitle>
                <CardDescription>اضغط على أي مكالمة تشوف المحادثة اللي حصلت داخلها</CardDescription>
              </CardHeader>
              <CardContent>
                {calls.length === 0 ? (
                  <p className="text-sm text-zinc-400 text-center py-10">لسه مفيش مكالمات — ابدأ بـ «مكالمة تجريبية» فوق</p>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-zinc-50">
                          <TableHead className="text-right">المهمة</TableHead>
                          <TableHead className="text-right">المصدر</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right">المدة</TableHead>
                          <TableHead className="text-right">الوقت</TableHead>
                          <TableHead className="text-right">المحادثة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {calls.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-semibold max-w-[220px]">
                              <span className="block truncate">{c.taskName}</span>
                              {c.urgency === 'high' && <Badge variant="destructive" className="text-[9px] mt-1">مستعجلة</Badge>}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-[10px]">{SOURCE_AR[c.source] || c.source}</Badge>
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={c.status} />
                            </TableCell>
                            <TableCell className="text-sm text-zinc-500">
                              {c.durationSec ? <span className="inline-flex items-center gap-1"><Timer className="w-3.5 h-3.5" />{c.durationSec} ث</span> : '—'}
                            </TableCell>
                            <TableCell className="text-sm text-zinc-500 whitespace-nowrap">
                              {new Date(c.createdAt).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                            </TableCell>
                            <TableCell>
                              <CallTranscriptDialog call={c} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>

      <footer className="mt-auto border-t bg-white/70 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5" />
            نداء — MCP Voice Caller · بروتوكول MCP Streamable HTTP مع مصادقة بالتوكن
          </span>
          <span>الصفحة الرئيسية للربط · تطبيق الموبايل على /phone</span>
        </div>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------

function StatCard({ icon, label, value, good, bad }: { icon: React.ReactNode; label: string; value: string; good?: boolean; bad?: boolean }) {
  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm flex items-center gap-3">
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          good ? 'bg-emerald-100 text-emerald-700' : bad ? 'bg-red-100 text-red-600' : 'bg-zinc-100 text-zinc-600'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-zinc-500 font-medium">{label}</p>
        <p className="text-lg font-extrabold truncate">{value}</p>
      </div>
    </div>
  )
}

function CodeBox({
  value,
  label,
  onCopy,
  copied,
  mono,
  breakAll,
}: {
  value: string
  label: string
  onCopy: (v: string, key: string, label: string) => void
  copied: boolean
  mono?: boolean
  breakAll?: boolean
}) {
  return (
    <div className="bg-zinc-900 text-zinc-100 rounded-xl p-3 flex items-center gap-3">
      <code className={`flex-1 text-xs sm:text-[13px] leading-6 ${mono ? 'font-mono' : ''} ${breakAll ? 'break-all' : ''}`} dir="ltr">
        {value}
      </code>
      <Button
        size="sm"
        variant="secondary"
        className="shrink-0 h-9 bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
        onClick={() => onCopy(value, 'mcp-url', label)}
      >
        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  )
}

function SnippetsBlock({
  raw,
  title,
  copyKey,
  onCopy,
  mono,
  copiedKey,
}: {
  raw: string
  title: string
  copyKey: string
  onCopy: (v: string, k: string, l: string) => void
  mono?: boolean
  copiedKey?: string
}) {
  return (
    <div className="pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">{title}</p>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onCopy(raw, copyKey, title)}>
          {copiedKey === copyKey ? <Check className="w-3.5 h-3.5 ml-1 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 ml-1" />}
          نسخ
        </Button>
      </div>
      <pre className={`bg-zinc-50 border rounded-xl p-4 text-[12.5px] sm:text-[13px] leading-6 whitespace-pre-wrap ${mono ? 'font-mono' : ''}`} dir={mono ? 'ltr' : 'rtl'}>
        {raw}
      </pre>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    ringing: { text: 'بتنال', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
    answered: { text: 'تم الرد', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    completed: { text: 'خلصت', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    declined: { text: 'مرفوضة', cls: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
    missed: { text: 'فاتت', cls: 'bg-red-100 text-red-700 border-red-200' },
  }
  const s = map[status] || { text: status, cls: 'bg-zinc-100' }
  return <Badge variant="outline" className={`${s.cls} text-[10px] border`}>{s.text}</Badge>
}

type TranscriptTurn = { role: string; text: string; at: string }

function CallTranscriptDialog({ call }: { call: CallRecord }) {
  let turns: TranscriptTurn[] = []
  try {
    const parsed = call.transcript ? JSON.parse(call.transcript) : []
    if (Array.isArray(parsed)) turns = parsed
  } catch {
    turns = []
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs">
          عرض
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{call.taskName}</DialogTitle>
          <DialogDescription>
            {SOURCE_AR[call.source] || call.source} · {STATUS_AR[call.status] || call.status} ·{' '}
            {new Date(call.createdAt).toLocaleString('ar-EG')}
            {call.durationSec ? ` · ${call.durationSec} ثانية` : ''}
          </DialogDescription>
        </DialogHeader>
        {call.summary && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-sm leading-6">
            <span className="font-bold text-emerald-900">الملخص: </span>
            {call.summary}
          </div>
        )}
        {call.result && (
          <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 text-sm leading-6">
            <span className="font-bold text-emerald-900">النتيجة الفعلية اللي اتقالت في المكالمة: </span>
            {call.result}
          </div>
        )}
        {call.message && (
          <div className="bg-zinc-50 border rounded-xl p-3 text-sm leading-6">
            <span className="font-bold">رسالة إضافية: </span>
            {call.message}
          </div>
        )}
        <Separator />
        {turns.length === 0 ? (
          <p className="text-sm text-zinc-400 text-center py-6">مفيش محادثة صوتية مسجلة للمكالمة دي (يمكن كانت مكالمة فاتت أو مرفوضة)</p>
        ) : (
          <div className="space-y-3">
            {turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-6 ${
                    t.role === 'user'
                      ? 'bg-zinc-100'
                      : t.role === 'agent'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-emerald-600 text-white'
                  }`}
                >
                  <p className="text-[10px] opacity-70 mb-0.5">{t.role === 'user' ? 'المستخدم' : t.role === 'agent' ? 'تحديث من الإيجنت (GPT/Claude)' : 'المساعد نداء'}</p>
                  {t.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
