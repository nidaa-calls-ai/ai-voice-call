'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { LogIn, UserPlus, Phone, Loader2 } from 'lucide-react'
import { setAuth, type AuthSession } from '@/lib/client-auth'

type AuthResponse = { ok?: boolean; error?: string; user?: { accessToken: string; id: string; username: string; displayName: string } }

/**
 * Shared login/register gate used by both the dashboard (/) and the phone app (/phone).
 * Every account is fully isolated: own token, own fish.audio voice, own calls & push.
 */
export function LoginForm({ onLogin, app }: { onLogin: (s: AuthSession) => void; app: 'dashboard' | 'phone' }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [regUser, setRegUser] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regName, setRegName] = useState('')

  async function submit(mode: 'login' | 'register') {
    setBusy(true)
    try {
      const payload =
        mode === 'login'
          ? { username: loginUser.trim(), password: loginPass }
          : { username: regUser.trim(), password: regPass, display_name: regName.trim() }
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as AuthResponse
      if (data?.ok && data.user) {
        const session: AuthSession = {
          token: data.user.accessToken,
          userId: data.user.id,
          username: data.user.username,
          displayName: data.user.displayName || data.user.username,
        }
        setAuth(session)
        toast({ title: mode === 'login' ? 'أهلاً بعودتك!' : 'اتعمل حسابك وخلاص!', description: `الحساب: ${session.username}` })
        onLogin(session)
      } else {
        toast({ title: mode === 'login' ? 'فشل الدخول' : 'فشل إنشاء الحساب', description: data?.error || 'حاول تاني', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'فشل الاتصال بالسيرفر', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-emerald-50/80 via-white to-white px-4">
      <Card className="w-full max-w-md border-emerald-100 shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mb-2">
            <Phone className="w-7 h-7 text-emerald-700" />
          </div>
          <CardTitle className="text-xl font-extrabold">نداء — {app === 'dashboard' ? 'لوحة التحكم' : 'تطبيق الموبايل'}</CardTitle>
          <CardDescription className="leading-6">
            ادخل بحسابك — كل حساب له توكنه وصوته ومكالماته المنفصلة تماماً
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" dir="rtl">
            <TabsList className="grid grid-cols-2 w-full h-auto p-1">
              <TabsTrigger value="login" className="text-sm px-2">دخول</TabsTrigger>
              <TabsTrigger value="register" className="text-sm px-2">حساب جديد</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="login-username">اسم المستخدم</Label>
                <Input
                  id="login-username"
                  dir="ltr"
                  autoCapitalize="none"
                  placeholder="username"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loginUser && loginPass && submit('login')}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password">كلمة السر</Label>
                <Input
                  id="login-password"
                  dir="ltr"
                  type="password"
                  placeholder="••••••••"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loginUser && loginPass && submit('login')}
                  className="h-11 rounded-xl"
                />
              </div>
              <Button onClick={() => submit('login')} disabled={busy || !loginUser.trim() || !loginPass} className="w-full h-12 rounded-xl bg-emerald-700 hover:bg-emerald-800">
                {busy ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <LogIn className="w-4 h-4 ml-2" />}
                دخول
              </Button>
            </TabsContent>

            <TabsContent value="register" className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="reg-username">اسم المستخدم (إنجليزي)</Label>
                <Input
                  id="reg-username"
                  dir="ltr"
                  autoCapitalize="none"
                  placeholder="username"
                  value={regUser}
                  onChange={(e) => setRegUser(e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-name">الاسم الظاهر (اختياري)</Label>
                <Input
                  id="reg-name"
                  placeholder="مثال: أحمد"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-password">كلمة السر (6 حروف على الأقل)</Label>
                <Input
                  id="reg-password"
                  dir="ltr"
                  type="password"
                  placeholder="••••••••"
                  value={regPass}
                  onChange={(e) => setRegPass(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && regUser && regPass.length >= 6 && submit('register')}
                  className="h-11 rounded-xl"
                />
              </div>
              <Button onClick={() => submit('register')} disabled={busy || !regUser.trim() || regPass.length < 6} className="w-full h-12 rounded-xl bg-emerald-700 hover:bg-emerald-800">
                {busy ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <UserPlus className="w-4 h-4 ml-2" />}
                إنشاء الحساب
              </Button>
              <p className="text-[11px] leading-5 text-zinc-500 bg-zinc-50 rounded-xl p-3">
                أول حساب يتسجل في السيرفر بيورث إعدادات الصوت والمكالمات القديمة تلقائياً. أي حساب جديد بيشتغل بعزل كامل: توكن خاص وصوت خاص وسجل خاص.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
