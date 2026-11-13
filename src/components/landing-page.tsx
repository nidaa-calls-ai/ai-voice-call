'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getAuth } from '@/lib/client-auth'
import {
  Phone, PhoneCall, MessagesSquare, Brain, AudioLines, Puzzle, Activity,
  BellRing, ShieldCheck, Smartphone, Youtube, Heart, Sparkles, UserRoundPlus, Github,
  Code2, Clock3, RefreshCw, Languages, ArrowLeft, ArrowRight, CheckCircle2,
  Globe, Mail, PlayCircle,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Landing page content — Arabic (default) + English, one toggle switches
// everything including the page direction (rtl / ltr).
// ---------------------------------------------------------------------------

const YOUTUBE_URL = 'https://www.youtube.com/@NextGen_AI2023'
const PAYPAL_DONATE_URL =
  'https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=hussainandshabaan%40gmail.com&currency_code=USD&item_name=%D8%AF%D8%B9%D9%85%20%D9%85%D8%B4%D8%B1%D9%88%D8%B9%20%D9%86%D8%AF%D8%A7%D8%A1'
const PAYPAL_EMAIL = 'hussainandshabaan@gmail.com'
const GITHUB_URL = 'https://github.com/nidaa-calls-ai/ai-voice-call'
const GITHUB_REPO = 'github.com/nidaa-calls-ai/ai-voice-call'

type Lang = 'ar' | 'en'

const T = {
  ar: {
    dir: 'rtl' as const,
    brand: 'نداء',
    brandSub: 'Nidaa — MCP Voice Caller',
    nav: {
      features: 'المميزات',
      how: 'إزاي يشتغل',
      owner: 'صاحب المشروع',
      support: 'ادعمنا',
      login: 'تسجيل الدخول',
      dashboard: 'لوحة التحكم',
    },
    hero: {
      badge: 'مجاني بالكامل — بدون متجر تطبيقات، بدون بطاقة بنكية',
      title1: 'أول ما مهمتك تخلص…',
      title2: 'النظام بيناديك بنفسه',
      sub: 'نداء مساعد ذكاء اصطناعي بيتصل بيك بمكالمة صوتية حقيقية على موبايلك، يتكلم معك بالعربي المصري بحرية، ويقولك نتايج مهامك وإيجنتاتك لحظة بلحظة — من غير ما تفتح أي حاجة.',
      ctaRegister: 'إنشاء حساب مجاني',
      ctaLogin: 'تسجيل الدخول',
      ctaYoutube: 'شوف الشرح على اليوتيوب',
      badges: [
        { icon: Puzzle, text: 'يشتغل مع Claude وChatGPT وكل الإيجنتات' },
        { icon: AudioLines, text: 'صوت عربي طبيعي عالي الجودة' },
        { icon: Smartphone, text: 'PWA — ما تحتاجش متجر تطبيقات' },
        { icon: ShieldCheck, text: 'خصوصية كاملة لكل حساب' },
      ],
      phone: {
        caller: 'نداء — المساعد الذكي',
        callType: 'مكالمة صوتية داخلية',
        task: 'المهمة خلصت: تقرير المبيعات جاهز',
        hint: 'المساعد هيرد على أسئلتك لحظياً بالعربي',
        answer: 'رد',
        decline: 'أجّل',
      },
    },
    features: {
      title: 'مميزات نداء بالكامل',
      sub: 'كل اللي تحتاجه عشان إيجنتك ومهامك توصلك بصوت بشري — مش رسالة نصية نايمة في الإشعارات',
      items: [
        {
          icon: PhoneCall,
          title: 'مكالمات صوتية حقيقية',
          desc: 'النظام بيتصل بموبايلك بمكالمة حية برنة حقيقية — مش إشعار ولا رسالة. سكّر ورن، وسمع تقرير مهمتك فوراً.',
        },
        {
          icon: MessagesSquare,
          title: 'حوار حر بالعربي المصري',
          desc: 'المساعد بيسمعك ويرد عليك لحظة بلحظة، ويسأله أي حاجة عن المهمة: التفاصيل، النتيجة، أو اللي حصل بالظبط.',
        },
        {
          icon: Brain,
          title: 'دماغ ذكاء اصطناعي من اختيارك',
          desc: 'اربط أي موديل متوافق مع OpenAI بمفتاحك الخاص — OpenRouter (فيه نماذج مجانية) أو Z.ai GLM — ويتخزن آمن لحسابك بس.',
        },
        {
          icon: AudioLines,
          title: 'صوت بشري ناعم',
          desc: 'تقنية fish.audio بجودة عالية مع صوت عربي جاهز من أول لحظة، وتقدر تركّب صوت مخصص (Voice ID) لو حابب.',
        },
        {
          icon: Puzzle,
          title: 'تكامل مع أي إيجنت',
          desc: 'MCP جاهز لـ Claude وChatGPT وأي إيجنت يدعمه + REST API ومكالمات مجدولة — سطرين إعداد وخلّصت.',
        },
        {
          icon: Activity,
          title: 'سجل وتقارير كاملة',
          desc: 'كل مكالمة بتتسجل: الحالة، المدة، والحوار كامل نصاً بنصاً — وترجع تراجعه أي وقت من لوحة التحكم.',
        },
      ],
      extra: [
        { icon: BellRing, text: 'إشعارات Push لحظية حتى لو التطبيق مقفول' },
        { icon: ShieldCheck, text: 'عزل كامل: كل حساب بتوكِنه وصوته وسجله' },
        { icon: Globe, text: 'يشتغل من أي متصفح — أندرويد وآيفون وكمبيوتر' },
      ],
    },
    benefits: {
      title: 'هيوفر عليك إيه؟',
      sub: 'نداء مش تطبيق تفتحه تراقبه — ده مساعد بيتحرك مكانك ويلحقك أولاً بأول',
      items: [
        {
          icon: Clock3,
          title: 'لو مشغول… وقتك أغلى حاجة',
          desc: 'مكالمة واحدة بتوفر عليك فتح التطبيق وتصفح السجلات وانتظار التحميل. النظام جه ليك — مش العكس.',
        },
        {
          icon: Code2,
          title: 'للمطورين وبناة الإيجنتات',
          desc: 'تركيب MCP في دقيقة وتوكن شخصي لكل حساب. إيجنتك بيقول نجاحه بصوت بشري — مش رسالة نصية بتضيع.',
        },
        {
          icon: UserRoundPlus,
          title: 'للجدد: مجاني وبسيط',
          desc: 'حساب في دقيقة واحدة، مفتاح ذكاء اصطناعي مجاني من OpenRouter، وصوت جاهز — صفر تكلفة وتجربة حقيقية في دقايق.',
        },
        {
          icon: RefreshCw,
          title: 'للمهام الروتينية المتكررة',
          desc: 'نسخ احتياطي، تقارير دورية، متابعة أسعار، أي مهمة مجدولة — بدل ما تفتكر تتابع، نداء يناديك بالنتيجة.',
        },
      ],
    },
    how: {
      title: 'إزاي يشتغل؟ 4 خطوات وتكون جاهز',
      steps: [
        { title: 'اعمل حسابك', desc: 'دقيقة واحدة — اسم مستخدم وكلمة سر، من غير بيانات شخصية ولا بطاقات.' },
        { title: 'اربط مهامك', desc: 'MCP أو REST API أو زر التجربة — وخلي أي إيجنت ينادي بالتوكن الشخصي بتاعك.' },
        { title: 'جهّز موبايلك', desc: 'افتح صفحة نداء على الموبايل مرة واحدة وسجّل دخولك — التطبيق يبقى مستعد يرن.' },
        { title: 'استقبل النداء', desc: 'الموبايل يرن، المساعد يتكلم معك بالعربي، ويسأله أي حاجة عن المهمة.' },
      ],
    },
    owner: {
      title: 'صاحب المشروع',
      name: 'حسين شعبان',
      nameEn: 'Hussain Shaaban',
      role: 'مطوّر ومالك مشروع نداء',
      bio: 'مطوّر عربي بيحب يبسّط الذكاء الاصطناعي للناس العادية. نداء واحد من مشاريعه المجانية اللي بتديها للجميع بدون مقابل — ونداء مفتوح المصدر بالكامل: الكود متاح على جيت هب لأي حد عايز يستخدمه أو يطوّره. على قناته على اليوتيوب تلاقي شروحات خطوة بخطوة عن الإيجنتات وأدوات الذكاء الاصطناعي وكيف تستخدمها في شغلك اليومي.',
      youtube: 'قناتي على اليوتيوب — NextGen AI',
      youtubeSub: 'شروحات ذكاء اصطناعي وإيجنتات بالعربي',
      github: 'المشروع مفتوح المصدر على جيت هب',
      githubSub: 'استخدمه وعدّله وشارك في تطويره بحرية',
    },
    support: {
      title: 'المشروع مجاني… ودعمتك هي اللي بتخليه مستمر',
      sub: 'نداء متاح للجميع بدون أي اشتراك أو رسوم. لو المشروع وفّر عليك وقت أو عجبك، دعمتك على باي بال بتساعد في تكاليف السيرفرات والتطوير المستمر.',
      button: 'ادعمنا على باي بال',
      note: 'أي مبلغ — صغير كان أو كبير — بتصنع فرق حقيقي. وشكراً ليك من القلب',
      emailLabel: 'بريد باي بال:',
    },
    footer: {
      rights: 'كل الحقوق محفوظة',
      made: 'مصنوع بحب لخدمة المجتمع العربي',
      links: { dashboard: 'لوحة التحكم', youtube: 'اليوتيوب', github: 'جيت هب', support: 'ادعمنا' },
    },
  },
  en: {
    dir: 'ltr' as const,
    brand: 'Nidaa',
    brandSub: 'نداء — MCP Voice Caller',
    nav: {
      features: 'Features',
      how: 'How it works',
      owner: 'The owner',
      support: 'Support us',
      login: 'Sign in',
      dashboard: 'Dashboard',
    },
    hero: {
      badge: 'Completely free — no app store, no credit card',
      title1: 'The moment your task is done…',
      title2: 'Nidaa calls YOU by name.',
      sub: 'Nidaa is an AI assistant that places a real voice call to your phone, speaks Egyptian Arabic naturally, and reports your tasks and agent results the second they are ready — no app-opening required.',
      ctaRegister: 'Create a free account',
      ctaLogin: 'Sign in',
      ctaYoutube: 'Watch the tutorial on YouTube',
      badges: [
        { icon: Puzzle, text: 'Works with Claude, ChatGPT & every MCP agent' },
        { icon: AudioLines, text: 'High-quality natural Arabic voice' },
        { icon: Smartphone, text: 'PWA — no app store needed' },
        { icon: ShieldCheck, text: 'Full privacy, isolated accounts' },
      ],
      phone: {
        caller: 'Nidaa — AI Assistant',
        callType: 'Incoming voice call',
        task: 'Task done: Sales report is ready',
        hint: 'The assistant answers your questions live, in Arabic',
        answer: 'Answer',
        decline: 'Later',
      },
    },
    features: {
      title: 'Everything Nidaa can do',
      sub: 'Everything you need so your agents and tasks reach you with a human voice — not a text notification buried in the tray',
      items: [
        {
          icon: PhoneCall,
          title: 'Real voice calls',
          desc: 'Nidaa dials your phone with a live call and a real ringtone — not a push message. Pick up and hear your task report instantly.',
        },
        {
          icon: MessagesSquare,
          title: 'Free-flowing Arabic conversation',
          desc: 'The assistant listens and replies in real time, in Egyptian Arabic. Ask it anything about the task: details, results, what exactly happened.',
        },
        {
          icon: Brain,
          title: 'Your choice of AI brain',
          desc: 'Plug any OpenAI-compatible model with your own key — OpenRouter (free models included) or Z.ai GLM. Stored securely, per account.',
        },
        {
          icon: AudioLines,
          title: 'Soft, human-like voice',
          desc: 'High-quality fish.audio synthesis with a ready-made Arabic voice — and you can attach your own custom Voice ID.',
        },
        {
          icon: Puzzle,
          title: 'Works with any agent',
          desc: 'Ready-made MCP integration for Claude, ChatGPT and any MCP-capable agent, plus a REST API and scheduled calls — two lines of setup.',
        },
        {
          icon: Activity,
          title: 'Full call history & reports',
          desc: 'Every call is logged: status, duration and the full word-by-word transcript — review it anytime from the dashboard.',
        },
      ],
      extra: [
        { icon: BellRing, text: 'Instant Web Push notifications, even when the app is closed' },
        { icon: ShieldCheck, text: 'Full isolation: every account has its own token, voice and log' },
        { icon: Globe, text: 'Works from any browser — Android, iPhone and desktop' },
      ],
    },
    benefits: {
      title: 'What does it save you?',
      sub: 'Nidaa is not an app you keep checking — it is an assistant that moves for you and catches you up',
      items: [
        {
          icon: Clock3,
          title: 'Busy? Your time is precious',
          desc: 'One call saves you opening the app, browsing logs and waiting on loaders. The system comes to you — not the other way around.',
        },
        {
          icon: Code2,
          title: 'For developers & agent builders',
          desc: 'MCP setup in a minute and a personal token per account. Your agent announces its success in a human voice — not a lost text message.',
        },
        {
          icon: UserRoundPlus,
          title: 'For newcomers: free & simple',
          desc: 'An account in one minute, a free OpenRouter AI key, a ready voice — zero cost and a real experience within minutes.',
        },
        {
          icon: RefreshCw,
          title: 'For repetitive routine tasks',
          desc: 'Backups, periodic reports, price tracking, any scheduled job — instead of remembering to check, Nidaa calls you with the result.',
        },
      ],
    },
    how: {
      title: 'How it works? 4 steps and you are ready',
      steps: [
        { title: 'Create your account', desc: 'One minute — a username and password. No personal data, no cards.' },
        { title: 'Connect your tasks', desc: 'MCP, REST API or the built-in test button — let any agent call using your personal token.' },
        { title: 'Ready your phone', desc: 'Open the Nidaa page on your phone once and sign in — the app stays ready to ring.' },
        { title: 'Receive the call', desc: 'Your phone rings, the assistant talks with you in Arabic — ask it anything about the task.' },
      ],
    },
    owner: {
      title: 'The owner',
      name: 'حسين شعبان',
      nameEn: 'Hussain Shaaban',
      role: 'Developer & owner of the Nidaa project',
      bio: 'An Arab developer who loves making AI simple for everyday people. Nidaa is one of his free projects — and fully open source: the whole codebase is on GitHub for anyone who wants to use it or build on it. On his YouTube channel you will find step-by-step tutorials about AI agents and tools, and how to use them in your daily work.',
      youtube: 'My YouTube channel — NextGen AI',
      youtubeSub: 'Arabic tutorials on AI & agents',
      github: 'Open source on GitHub',
      githubSub: 'Use it, customize it and contribute freely',
    },
    support: {
      title: 'The project is free… your support keeps it alive',
      sub: 'Nidaa is available to everyone with no subscription or fees. If the project saved you time or you simply like it, your support on PayPal helps cover servers and continuous development.',
      button: 'Support us on PayPal',
      note: 'Any amount — small or large — makes a real difference. Thank you from the heart',
      emailLabel: 'PayPal email:',
    },
    footer: {
      rights: 'All rights reserved',
      made: 'Made with love for the Arab community',
      links: { dashboard: 'Dashboard', youtube: 'YouTube', github: 'GitHub', support: 'Support us' },
    },
  },
}

/** Decorative soft background blobs. */
function Blobs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="nidaa-float absolute -top-24 -left-24 w-96 h-96 rounded-full bg-emerald-200/40 blur-3xl" />
      <div className="nidaa-float-slow absolute top-40 -right-32 w-[28rem] h-[28rem] rounded-full bg-teal-200/30 blur-3xl" />
      <div className="nidaa-float absolute bottom-0 left-1/3 w-80 h-80 rounded-full bg-emerald-100/50 blur-3xl" />
    </div>
  )
}

export function LandingPage() {
  const [lang, setLang] = useState<Lang>('ar')
  const [authed, setAuthed] = useState(false)
  const t = T[lang]
  const ForwardIcon = lang === 'ar' ? ArrowLeft : ArrowRight

  // restore language choice + detect an existing session (client-only,
  // one-time after hydration — a lazy useState init would break SSR hydration)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('nidaa-landing-lang')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount restore
      if (saved === 'en' || saved === 'ar') setLang(saved)
    } catch { /* ignore */ }
    setAuthed(!!getAuth())
  }, [])

  // switch the document direction + remember the choice
  useEffect(() => {
    document.documentElement.lang = lang === 'ar' ? 'ar' : 'en'
    document.documentElement.dir = t.dir
    try { window.localStorage.setItem('nidaa-landing-lang', lang) } catch { /* ignore */ }
  }, [lang, t.dir])

  const logo = (
    <div className="flex items-center gap-3">
      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 flex items-center justify-center shadow-md shadow-emerald-200">
        <Phone className="w-6 h-6 text-white" />
      </div>
      <div className="leading-tight">
        <div className="text-lg font-extrabold text-emerald-800">{t.brand}</div>
        <div className="text-[11px] text-zinc-500">{t.brandSub}</div>
      </div>
    </div>
  )

  const phoneMock = (
    <div className="relative mx-auto w-[250px] sm:w-[270px]">
      {/* pulsing rings behind the phone */}
      <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <div className="nidaa-ring w-40 h-40 rounded-full border-2 border-emerald-400/60" />
        <div className="nidaa-ring w-40 h-40 rounded-full border-2 border-emerald-400/40 absolute" style={{ animationDelay: '0.9s' }} />
      </div>
      <div className="relative rounded-[2.6rem] bg-zinc-900 p-2.5 shadow-2xl shadow-emerald-900/30">
        <div className="rounded-[2.2rem] overflow-hidden bg-gradient-to-b from-emerald-900 via-emerald-800 to-teal-900 text-white flex flex-col items-center justify-between h-[480px] px-5 py-9">
          {/* notch */}
          <div className="w-20 h-5 bg-zinc-900 rounded-full" />
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
                <Phone className="w-9 h-9 text-emerald-200" />
              </div>
              <span className="absolute -bottom-1.5 -left-1.5 w-6 h-6 rounded-full bg-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-900" />
              </span>
            </div>
            <div>
              <div className="text-[11px] text-emerald-200/80">{t.hero.phone.callType}</div>
              <div className="text-lg font-bold">{t.hero.phone.caller}</div>
            </div>
            <div className="mt-2 bg-white/10 backdrop-blur rounded-2xl px-4 py-3 max-w-[210px]">
              <div className="flex items-center gap-2 text-xs text-emerald-100">
                <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                <span>{t.hero.phone.task}</span>
              </div>
              <div className="mt-2 text-[10px] text-emerald-200/70 leading-4">{t.hero.phone.hint}</div>
            </div>
          </div>
          <div className="flex items-center gap-10">
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-12 h-12 rounded-full bg-rose-500/90 flex items-center justify-center shadow-lg">
                <Phone className="w-5 h-5 rotate-[135deg] text-white" />
              </div>
              <span className="text-[10px] text-white/70">{t.hero.phone.decline}</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-12 h-12 rounded-full bg-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/40">
                <Phone className="w-5 h-5 text-emerald-950" />
              </div>
              <span className="text-[10px] text-white/70">{t.hero.phone.answer}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div dir={t.dir} className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50/70 via-white to-teal-50/60 text-zinc-800 relative">
      <Blobs />

      {/* ================= header ================= */}
      <header className="relative z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          {logo}
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-zinc-600" aria-label="main">
            <a href="#features" className="hover:text-emerald-700 transition">{t.nav.features}</a>
            <a href="#how" className="hover:text-emerald-700 transition">{t.nav.how}</a>
            <a href="#owner" className="hover:text-emerald-700 transition">{t.nav.owner}</a>
            <a href="#support" className="hover:text-emerald-700 transition">{t.nav.support}</a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLang((l) => (l === 'ar' ? 'en' : 'ar'))}
              className="flex items-center gap-1.5 h-10 px-3.5 rounded-full border border-emerald-200 bg-white/80 backdrop-blur text-sm font-bold text-emerald-700 hover:bg-emerald-50 transition"
              aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
            >
              <Languages className="w-4 h-4" />
              {lang === 'ar' ? 'EN' : 'عربي'}
            </button>
            <Button asChild className="hidden sm:inline-flex h-10 rounded-full bg-emerald-700 hover:bg-emerald-800 px-5">
              <Link href="/dashboard">{authed ? t.nav.dashboard : t.nav.login}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        {/* ================= hero ================= */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-14 grid md:grid-cols-2 gap-10 items-center">
          <div className="text-center md:text-start">
            <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur border border-emerald-200 rounded-full px-4 py-2 text-xs font-bold text-emerald-700 shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              {t.hero.badge}
            </div>
            <h1 className="mt-5 text-4xl sm:text-5xl font-extrabold leading-[1.25] tracking-tight">
              {t.hero.title1}
              <span className="block mt-1 bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-500 bg-clip-text text-transparent">
                {t.hero.title2}
              </span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-zinc-600 leading-8 max-w-xl mx-auto md:mx-0">
              {t.hero.sub}
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center md:justify-start gap-3">
              <Button asChild className="h-12 px-7 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-base shadow-lg shadow-emerald-200">
                <Link href="/dashboard">
                  <ForwardIcon className="w-5 h-5 me-2" />
                  {authed ? t.nav.dashboard : t.hero.ctaRegister}
                </Link>
              </Button>
              {!authed && (
                <Button asChild variant="outline" className="h-12 px-6 rounded-2xl border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                  <Link href="/dashboard">{t.hero.ctaLogin}</Link>
                </Button>
              )}
              <a
                href={YOUTUBE_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl text-sm font-bold text-rose-600 hover:bg-rose-50 transition"
              >
                <PlayCircle className="w-5 h-5" />
                {t.hero.ctaYoutube}
              </a>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-2.5 max-w-lg mx-auto md:mx-0">
              {t.hero.badges.map((b) => (
                <div key={b.text} className="flex items-center gap-2 bg-white/70 backdrop-blur border border-emerald-100 rounded-xl px-3 py-2.5 text-[12px] font-semibold text-zinc-600">
                  <b.icon className="w-4 h-4 text-emerald-600 shrink-0" />
                  {b.text}
                </div>
              ))}
            </div>
          </div>
          <div className="pt-6 md:pt-0">{phoneMock}</div>
        </section>

        {/* ================= features ================= */}
        <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 scroll-mt-16">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-emerald-900">{t.features.title}</h2>
            <p className="mt-3 text-zinc-600 leading-7">{t.features.sub}</p>
          </div>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {t.features.items.map((f) => (
              <Card
                key={f.title}
                className="bg-white/80 backdrop-blur border-emerald-100 rounded-3xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
              >
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-50 border border-emerald-100 flex items-center justify-center mb-4">
                    <f.icon className="w-6 h-6 text-emerald-700" />
                  </div>
                  <h3 className="text-lg font-extrabold text-zinc-800">{f.title}</h3>
                  <p className="mt-2 text-sm text-zinc-600 leading-7">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-6 grid sm:grid-cols-3 gap-3">
            {t.features.extra.map((e) => (
              <div key={e.text} className="flex items-center gap-3 bg-white/60 backdrop-blur border border-emerald-100 rounded-2xl px-4 py-3.5 text-sm font-semibold text-zinc-700">
                <e.icon className="w-5 h-5 text-emerald-600 shrink-0" />
                {e.text}
              </div>
            ))}
          </div>
        </section>

        {/* ================= benefits ================= */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-emerald-900">{t.benefits.title}</h2>
            <p className="mt-3 text-zinc-600 leading-7">{t.benefits.sub}</p>
          </div>
          <div className="mt-10 grid sm:grid-cols-2 gap-5">
            {t.benefits.items.map((b) => (
              <Card key={b.title} className="bg-white/80 backdrop-blur border-emerald-100 rounded-3xl shadow-sm hover:shadow-md transition">
                <CardContent className="p-6 flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 flex items-center justify-center shrink-0 shadow-md shadow-emerald-200">
                    <b.icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-zinc-800">{b.title}</h3>
                    <p className="mt-1.5 text-sm text-zinc-600 leading-7">{b.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ================= how it works ================= */}
        <section id="how" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 scroll-mt-16">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-emerald-900">{t.how.title}</h2>
          </div>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {t.how.steps.map((s, i) => (
              <div key={s.title} className="relative bg-white/80 backdrop-blur border border-emerald-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition">
                <div className={`absolute -top-4 ${t.dir === 'rtl' ? '-right-3' : '-left-3'} w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white font-extrabold text-lg flex items-center justify-center shadow-md shadow-emerald-200`}>
                  {i + 1}
                </div>
                <h3 className="mt-4 text-base font-extrabold text-zinc-800">{s.title}</h3>
                <p className="mt-2 text-sm text-zinc-600 leading-7">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ================= owner ================= */}
        <section id="owner" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 scroll-mt-16">
          <Card className="bg-white/80 backdrop-blur border-emerald-100 rounded-3xl shadow-sm overflow-hidden">
            <div className="h-24 bg-gradient-to-l from-emerald-600 via-emerald-500 to-teal-400" />
            <CardContent className="p-6 sm:p-8 -mt-14">
              <div className="flex flex-col sm:flex-row sm:items-end gap-5">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-400 shadow-xl shadow-emerald-200 border-4 border-white">
                  <Image
                    src="/hussein-avatar.png"
                    alt={t.owner.name}
                    width={360}
                    height={360}
                    className="w-full h-full object-cover"
                    priority
                  />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-emerald-600 uppercase tracking-wide">{t.owner.title}</div>
                  <h2 className="text-2xl font-extrabold text-zinc-800 mt-1">{t.owner.name}</h2>
                  <div className="text-sm text-zinc-500" dir="ltr">{t.owner.nameEn} — {t.owner.role}</div>
                </div>
              </div>
              <div className="mt-5 flex flex-col sm:flex-row items-center sm:items-start gap-6">
                <p className="flex-1 text-sm sm:text-base text-zinc-600 leading-8">{t.owner.bio}</p>
                <Image
                  src="/hussein-casual.jpg"
                  alt={t.owner.name}
                  width={761}
                  height={941}
                  className="w-36 sm:w-44 shrink-0 rounded-2xl border-4 border-white shadow-lg shadow-emerald-200/70 rotate-1"
                />
              </div>
              <div className="mt-6 flex flex-wrap gap-4">
                <a
                  href={YOUTUBE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-3 bg-white border border-rose-200 hover:bg-rose-50 transition rounded-2xl px-5 py-3.5 group"
                >
                  <div className="w-11 h-11 rounded-xl bg-rose-600 flex items-center justify-center shadow-md shadow-rose-200">
                    <Youtube className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="font-extrabold text-zinc-800 text-sm group-hover:text-rose-700 transition">{t.owner.youtube}</div>
                    <div className="text-xs text-zinc-500">{t.owner.youtubeSub}</div>
                    <div className="text-[11px] text-zinc-400 font-mono" dir="ltr">youtube.com/@NextGen_AI2023</div>
                  </div>
                </a>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-3 bg-white border border-zinc-200 hover:bg-zinc-50 transition rounded-2xl px-5 py-3.5 group"
                >
                  <div className="w-11 h-11 rounded-xl bg-zinc-900 flex items-center justify-center shadow-md shadow-zinc-300">
                    <Github className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="font-extrabold text-zinc-800 text-sm group-hover:text-zinc-950 transition">{t.owner.github}</div>
                    <div className="text-xs text-zinc-500">{t.owner.githubSub}</div>
                    <div className="text-[11px] text-zinc-400 font-mono" dir="ltr">{GITHUB_REPO}</div>
                  </div>
                </a>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ================= support / PayPal ================= */}
        <section id="support" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 scroll-mt-16">
          <div className="relative rounded-3xl bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-600 text-white p-8 sm:p-12 overflow-hidden shadow-xl shadow-emerald-200">
            <div className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 w-72 h-72 rounded-full bg-teal-300/20 blur-3xl" aria-hidden="true" />
            <div className="relative flex flex-col md:flex-row md:items-center gap-8">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur rounded-full px-4 py-1.5 text-xs font-bold">
                  <Heart className="w-3.5 h-3.5 text-rose-300 fill-rose-300" />
                  {t.brand} — {T.en.brand}
                </div>
                <h2 className="mt-4 text-2xl sm:text-3xl font-extrabold leading-relaxed">{t.support.title}</h2>
                <p className="mt-3 text-emerald-50/90 leading-8 max-w-2xl text-sm sm:text-base">{t.support.sub}</p>
                <p className="mt-2 text-emerald-100/70 text-sm">{t.support.note}</p>
                <div className="mt-4 flex items-center gap-2 text-sm text-emerald-100/80">
                  <Mail className="w-4 h-4" />
                  <span>{t.support.emailLabel}</span>
                  <code dir="ltr" className="font-mono bg-white/10 rounded-lg px-2.5 py-1 text-xs">{PAYPAL_EMAIL}</code>
                </div>
              </div>
              <div className="flex flex-col items-stretch sm:items-center gap-3">
                <a
                  href={PAYPAL_DONATE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2.5 h-14 px-8 rounded-2xl bg-amber-400 hover:bg-amber-300 text-zinc-900 font-extrabold text-base shadow-lg shadow-amber-900/20 transition"
                >
                  <Heart className="w-5 h-5 fill-zinc-900" />
                  {t.support.button}
                </a>
                <span className="text-[11px] text-emerald-100/60 text-center" dir="ltr">PayPal — hussainandshabaan@gmail.com</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ================= footer (sticks to bottom, safe-area aware) ================= */}
      <footer className="relative z-10 mt-auto bg-white/70 backdrop-blur border-t border-emerald-100" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 flex items-center justify-center">
              <Phone className="w-4 h-4 text-white" />
            </div>
            <span>
              © {new Date().getFullYear()} <span className="font-bold text-zinc-700">{t.owner.name}</span> — {t.footer.rights} · {t.brand}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-400">
            <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
            {t.footer.made}
          </div>
          <nav className="flex items-center gap-4 font-semibold" aria-label="footer">
            <Link href="/dashboard" className="text-emerald-700 hover:underline">{t.footer.links.dashboard}</Link>
            <a href={YOUTUBE_URL} target="_blank" rel="noreferrer" className="text-rose-600 hover:underline">{t.footer.links.youtube}</a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="text-zinc-700 hover:underline inline-flex items-center gap-1">
              <Github className="w-3.5 h-3.5" />
              {t.footer.links.github}
            </a>
            <a href="#support" className="text-amber-600 hover:underline">{t.footer.links.support}</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
