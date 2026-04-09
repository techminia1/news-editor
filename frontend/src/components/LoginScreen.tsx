import type { FormEvent } from 'react';
import { AlertCircle, Film } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { LoginFormState } from '@/lib/app-models';

interface LoginScreenProps {
  authError: string;
  loginForm: LoginFormState;
  onChange: (field: keyof LoginFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function LoginScreen({ authError, loginForm, onChange, onSubmit }: LoginScreenProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(30,64,175,0.16),_transparent_35%),linear-gradient(135deg,#020617,#0f172a_55%,#1e293b)] px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl grid gap-8 lg:grid-cols-[1.15fr_0.85fr] items-center min-h-[80vh]">
        <div>
          <Badge className="mb-4 border-white/20 bg-white/10 text-white">एडमिन नियंत्रित एक्सेस</Badge>
          <h1 className="text-4xl md:text-6xl font-black leading-tight">NewsOverlay Pro</h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-300">
            यहां कोई public signup नहीं है। सिर्फ एडमिन यूज़र अकाउंट बनाएगा, लोगो असाइन करेगा, इंट्रो और आउट्रो
            वीडियो सेट करेगा, और वही सब लॉगिन के बाद अपने आप इस्तेमाल होगा।
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <InfoCard title="एडमिन यूज़र बनाता है" body="यूज़रनेम, पासवर्ड, लोगो, इंट्रो और आउट्रो एडमिन ही सेट करता है।" />
            <InfoCard title="ब्रांडिंग जुड़ी रहती है" body="जो लोगो एडमिन असाइन करेगा, वही हर वीडियो पर दिखेगा।" />
            <InfoCard title="सिर्फ लॉगिन करें" body="यूज़र को बस अपनी दी गई credentials से लॉगिन करना है।" />
          </div>
        </div>

        <Card className="border-white/10 bg-white text-slate-900 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Film className="w-5 h-5 text-red-500" />
              लॉगिन
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={onSubmit}>
              <div>
                <Label htmlFor="username">यूज़रनेम</Label>
                <Input
                  id="username"
                  value={loginForm.username}
                  onChange={(event) => onChange('username', event.target.value)}
                  placeholder="यूज़रनेम लिखें"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="password">पासवर्ड</Label>
                <Input
                  id="password"
                  type="password"
                  value={loginForm.password}
                  onChange={(event) => onChange('password', event.target.value)}
                  placeholder="पासवर्ड लिखें"
                  className="mt-1"
                />
              </div>

              {authError && (
                <Alert variant="destructive">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>{authError}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full h-11">
                लॉगिन
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 text-sm text-slate-300">{body}</p>
    </div>
  );
}
