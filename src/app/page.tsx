import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing-page'

/**
 * Public landing page (the site root) — bilingual Arabic/English with a
 * language toggle. The signed-in dashboard now lives at /dashboard and the
 * phone PWA at /phone.
 */
export const metadata: Metadata = {
  title: 'نداء — أول ما مهمتك تخلص، المساعد بيناديك بنفسه',
  description:
    'نداء: مساعد ذكاء اصطناعي بيتصل بيك بمكالمة صوتية حقيقية أول ما أي مهمة أو إيجنت يخلص شغله، ويتكلم معك بالعربي المصري. يشتغل مع Claude وChatGPT وأي إيجنت — مجاني بالكامل. From Hussain Shaaban.',
  keywords: [
    'نداء', 'Nidaa', 'MCP', 'Voice Call', 'AI Agent', 'مكالمة صوتية',
    'ذكاء اصطناعي', 'ChatGPT', 'Claude', 'حسين شعبان', 'NextGen AI',
  ],
  authors: [{ name: 'Hussain Shaaban', url: 'https://www.youtube.com/@NextGen_AI2023' }],
  openGraph: {
    title: 'نداء — أول ما مهمتك تخلص، المساعد بيناديك بنفسه',
    description:
      'مساعد ذكاء اصطناعي بيتصل بيك بمكالمة صوتية حقيقية ويتكلم معك بالعربي — مجاني بالكامل.',
    type: 'website',
    locale: 'ar_EG',
    alternateLocale: 'en_US',
  },
}

export default function Home() {
  return <LandingPage />
}
