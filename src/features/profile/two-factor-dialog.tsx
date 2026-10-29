'use client';

import { useActionState, useState } from 'react';
import { startTwoFactorAction, twoFactorAction, type FormState } from './actions';
import {
  Button,
  Copyable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  ErrorBanner,
  OtpField,
  Skeleton,
  toast,
} from '@/ui';

type Setup = { qr: string | null; secret: string };

export function TwoFactorDialog({ enable }: { enable: boolean }) {
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const r = await twoFactorAction(prev, formData);
    if (r.done) {
      setOpen(false);
      toast.success(enable ? 'Two-factor authentication is on' : 'Two-factor authentication is off');
    }
    return r;
  }, {});

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next || !enable || setup) return;
    setSetupError(null);
    const r = await startTwoFactorAction();
    if (r.secret) setSetup({ qr: r.qr ?? null, secret: r.secret });
    else setSetupError(r.error ?? 'Couldn’t start the setup. Try again.');
  }

  return (
    <Dialog open={open} onOpenChange={(next) => void onOpenChange(next)}>
      <DialogTrigger asChild>
        <Button variant={enable ? 'primary' : 'outline'} size="sm">
          {enable ? 'Turn On' : 'Turn Off'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-1.5">
          <DialogTitle>{enable ? 'Turn on two-factor authentication' : 'Turn off two-factor authentication?'}</DialogTitle>
          <DialogDescription>
            {enable
              ? 'Scan the code with an authenticator app (Google Authenticator, 1Password, Authy…), then enter the 6-digit code it shows.'
              : 'Sign-ins will no longer ask for a code, and you won’t be able to generate a payout key here until you turn it back on.'}
          </DialogDescription>
        </div>
        <form action={action} className="flex flex-col gap-4">
          {enable &&
            (setupError ? (
              <ErrorBanner>{setupError}</ErrorBanner>
            ) : (
              <div className="bg-sunken/60 flex items-center gap-4 rounded-lg border p-3">
                {setup?.qr ? (
                  // A base64 PNG from the gateway: next/image can't optimise a data URL.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={setup.qr} alt="QR code for your authenticator app" className="size-32 rounded-md bg-white p-1.5" />
                ) : (
                  <Skeleton className="size-32 shrink-0 rounded-md" />
                )}
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-muted-foreground text-xs">Can’t scan it? Enter this setup key instead:</span>
                  {setup ? (
                    <Copyable value={setup.secret} display={setup.secret.match(/.{1,4}/g)?.join(' ')} label="Setup key" mono />
                  ) : (
                    <Skeleton className="h-5 w-48" />
                  )}
                </div>
              </div>
            ))}
          <OtpField value={code} onChange={setCode} autoFocus={!enable} />
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="mode" value={enable ? 'enable' : 'disable'} />
          {state.error && <ErrorBanner>{state.error}</ErrorBanner>}
          <Button type="submit" variant={enable ? 'primary' : 'danger'} disabled={pending || (enable && !setup)}>
            {pending ? (enable ? 'Turning on…' : 'Turning off…') : enable ? 'Turn On' : 'Turn Off Two-Factor Authentication'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
