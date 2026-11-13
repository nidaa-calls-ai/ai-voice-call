import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Cairo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "نداء — MCP Voice Caller",
  description:
    "اربط الـ MCP بـ ChatGPT أو Claude أو أي إيجنت — أول ما مهمة تخلص هيوصلك مكالمة صوتية حية على تطبيق الموبايل والمساعد يتكلم معك بالعربي.",
  keywords: ["MCP", "Voice Call", "ChatGPT", "Claude", "AI Agent", "مكالمة صوتية", "إشعارات"],
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "نداء",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d7358",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cairo.variable} antialiased bg-background text-foreground`}
        style={{ fontFamily: "var(--font-cairo), 'Segoe UI', Tahoma, sans-serif" }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
