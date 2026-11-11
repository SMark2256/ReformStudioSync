import { Lock } from 'lucide-react';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ThemeToggleButton } from '@/features/toggle-theme';
import { VersionBadge } from '@/widgets/version-changelog';
import { api } from '@/shared/api';
import { handleAppError } from '@/shared/lib/errors';
import { notify } from '@/shared/lib/notify';
import { useAuthStore } from '@/shared/auth';
import { Button, Card, CardContent, Input, Label } from '@/shared/ui';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('admin@reformstudio.hu');
  const [password, setPassword] = useState('Admin123!');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setAuth(res.accessToken, res.user);
      notify.success(
        `Üdvözlünk, ${res.user.name}!`,
        'Sikeres bejelentkezés a recepciós rendszerbe.',
      );
      navigate('/reception');
    } catch (err) {
      handleAppError(err, { title: 'Sikertelen bejelentkezés' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-6 p-6 md:p-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground"
              >
                RS
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-foreground">
                    ReformStudioSync
                  </h1>
                  <VersionBadge />
                </div>
                <p className="text-[13px] text-muted-foreground">
                  Recepció és valós idejű vendégmonitor
                </p>
              </div>
            </div>
            <ThemeToggleButton />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-email">E-mail cím</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-password">Jelszó</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setEmail('admin@reformstudio.hu');
                  setPassword('Admin123!');
                }}
              >
                Admin kitöltés
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEmail('recepcio@reformstudio.hu');
                  setPassword('Recepcio123!');
                }}
              >
                Recepciós kitöltés
              </Button>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              className="w-full"
            >
              <Lock aria-hidden strokeWidth={1.75} />
              {loading ? 'Bejelentkezés...' : 'Belépés a Recepciós Pultra'}
            </Button>
          </form>

          <div className="flex flex-col items-center gap-2 border-t border-border pt-5">
            <Button variant="link" asChild>
              <Link to="/demo">Interaktív Demo és tesztelői oldal (/demo)</Link>
            </Button>
            <Button variant="link" asChild>
              <Link to="/monitor">Vendégmonitor megnyitása (/monitor)</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
