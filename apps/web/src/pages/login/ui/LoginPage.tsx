import { LOGIN_CODE_LENGTH, LOGIN_CODE_TTL_MINUTES, toAppError } from '@reform/shared';
import { LogIn, Mail } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ThemeToggleButton } from '@/features/toggle-theme';
import { VersionBadge } from '@/widgets/version-changelog';
import { api } from '@/shared/api';
import { notify } from '@/shared/lib/notify';
import { useAuthStore } from '@/shared/auth';
import { Alert, Button, Card, CardContent, Input, Label } from '@/shared/ui';

const CODE_PATTERN = new RegExp(`^\\d{${LOGIN_CODE_LENGTH}}$`);

const errorMessage = (err: unknown) => toAppError(err).message;

/** Demó módban, szerver nélkül nincs levél: a mock a belépőkódot is visszaadja. */
const DemoCodeHint: React.FC<{ code: string }> = ({ code }) => (
  <Alert>
    Demó mód, szerver nélkül nem megy ki levél. A belépőkód: <strong>{code}</strong>
  </Alert>
);

interface EmailStepProps {
  initialEmail: string;
  onSent: (email: string, demoCode?: string) => void;
}

const EmailStep: React.FC<EmailStepProps> = ({ initialEmail, onSent }) => {
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    setSending(true);
    setError(null);
    try {
      const res = await api.requestLoginCode(address);
      onSent(address, res.demoCode);
    } catch (err) {
      setError(errorMessage(err));
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-email">E-mail cím</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <Button type="submit" variant="primary" disabled={sending} className="w-full">
        <Mail aria-hidden strokeWidth={1.75} />
        {sending ? 'Küldés...' : 'Kód küldése'}
      </Button>
    </form>
  );
};

interface CodeStepProps {
  email: string;
  demoCode: string | null;
  onResent: (demoCode?: string) => void;
  onChangeEmail: () => void;
}

const CodeStep: React.FC<CodeStepProps> = ({ email, demoCode, onResent, onChangeEmail }) => {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResent(false);
    setError(null);
    if (!CODE_PATTERN.test(code)) {
      setFieldError(`A belépőkód ${LOGIN_CODE_LENGTH} számjegyből áll.`);
      codeInputRef.current?.focus();
      return;
    }
    setFieldError(null);
    setVerifying(true);
    try {
      const res = await api.verifyLoginCode(email, code);
      setAuth(res.accessToken, res.user);
      notify.success(
        `Üdvözlünk, ${res.user.name}!`,
        'Sikeres bejelentkezés a recepciós rendszerbe.',
      );
      navigate('/reception');
    } catch (err) {
      setError(errorMessage(err));
      setVerifying(false);
      codeInputRef.current?.select();
    }
  };

  const handleResend = async () => {
    setResent(false);
    setError(null);
    setFieldError(null);
    setResending(true);
    try {
      const res = await api.requestLoginCode(email);
      setCode('');
      setResent(true);
      onResent(res.demoCode);
      codeInputRef.current?.focus();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
      {demoCode && <DemoCodeHint code={demoCode} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-code">Belépőkód</Label>
        <Input
          ref={codeInputRef}
          id="login-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/\D/g, '').slice(0, LOGIN_CODE_LENGTH))
          }
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? 'login-code-error' : undefined}
          className="h-11 text-center text-lg font-semibold tabular-nums tracking-[0.4em] coarse:text-lg"
        />
        {fieldError && (
          <p id="login-code-error" className="text-xs text-destructive">
            {fieldError}
          </p>
        )}
      </div>

      {error ? (
        <Alert variant="destructive">{error}</Alert>
      ) : (
        resent && (
          <p role="status" className="text-[13px] text-muted-foreground">
            Új kódot küldtünk. A korábbi kód már nem érvényes.
          </p>
        )
      )}

      <Button type="submit" variant="primary" disabled={verifying} className="w-full">
        <LogIn aria-hidden strokeWidth={1.75} />
        {verifying ? 'Ellenőrzés...' : 'Belépés'}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" disabled={resending} onClick={handleResend}>
          {resending ? 'Küldés...' : 'Új kód kérése'}
        </Button>
        <Button variant="link" onClick={onChangeEmail}>
          Másik e-mail cím
        </Button>
      </div>
    </form>
  );
};

/**
 * Belépés e-mailben küldött, egyszer használatos kóddal (TICKET-35): e-mail cím → kód.
 * Helyes kódra a munkamenet (JWT) a `reform-studio-auth` tárba kerül.
 */
export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [demoCode, setDemoCode] = useState<string | null>(null);

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

          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">Belépés</h2>
              <p aria-live="polite" className="text-[13px] text-muted-foreground">
                {step === 'code' ? (
                  <>
                    Elküldtük a belépőkódot ide:{' '}
                    <strong className="break-all text-foreground">{email}</strong>. A kód{' '}
                    {LOGIN_CODE_TTL_MINUTES} percig érvényes.
                  </>
                ) : (
                  'Add meg az e-mail címed, és küldünk egy egyszer használatos belépőkódot.'
                )}
              </p>
            </div>

            {step === 'code' ? (
              <CodeStep
                email={email}
                demoCode={demoCode}
                onResent={(code) => setDemoCode(code ?? null)}
                onChangeEmail={() => setStep('email')}
              />
            ) : (
              <EmailStep
                initialEmail={email}
                onSent={(address, code) => {
                  setEmail(address);
                  setDemoCode(code ?? null);
                  setStep('code');
                }}
              />
            )}
          </div>

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
