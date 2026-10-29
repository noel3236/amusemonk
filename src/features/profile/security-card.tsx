import { Badge, Card } from '@/ui';
import { PasswordDialog } from './password-dialog';
import { TwoFactorDialog } from './two-factor-dialog';

export function SecurityCard({ twoFactor }: { twoFactor: boolean | null }) {
  return (
    <Card className="flex flex-col p-5">
      <span className="text-muted-foreground text-[11px] font-bold tracking-[0.12em] uppercase">Security</span>
      <div id="two-factor" className="flex scroll-mt-20 items-center gap-3 border-b py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-sm font-semibold">
            Two-factor authentication
            {twoFactor !== null && <Badge tone={twoFactor ? 'ok' : 'warn'}>{twoFactor ? 'On' : 'Off'}</Badge>}
          </span>
          <span className="text-muted-foreground text-xs">
            {twoFactor ? 'Asked at sign-in and for key changes.' : 'Needed to generate or delete keys.'}
          </span>
        </div>
        {twoFactor !== null && <TwoFactorDialog enable={!twoFactor} />}
      </div>
      <div className="flex items-center gap-3 pt-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold">Password</span>
          <span className="text-muted-foreground text-xs">Changing it signs out your other sessions.</span>
        </div>
        <PasswordDialog />
      </div>
    </Card>
  );
}
