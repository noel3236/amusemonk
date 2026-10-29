import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { GatewayKeys } from '@/features/api-keys/gateway-keys';
import { activeKeySummary, generatedKids } from '@/features/api-keys/server';
import { SecurityCard } from '@/features/profile/security-card';
import { gatewayAccount, listGatewayKeys, type GatewayAccount } from '@/features/profile/server';
import { formatDateTime } from '@/lib/format';
import { Badge, Card, Copyable, ErrorBanner } from '@/ui';

export const metadata: Metadata = { title: 'Profile' };

function IdentityStrip({ account }: { account: GatewayAccount }) {
  return (
    <Card className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
      <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold uppercase">
        {account.email.slice(0, 1) || '?'}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-semibold">{account.email || '—'}</span>
        {account.role && <Badge>{account.role.replace(/_/g, ' ')}</Badge>}
      </span>
      {account.uid && (
        <span className="text-muted-foreground flex items-center gap-2 text-xs">
          User ID <Copyable value={account.uid} label="User ID" mono />
        </span>
      )}
      <span className="text-muted-foreground ml-auto text-xs">Your gateway account: changes here apply there too.</span>
    </Card>
  );
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const [account, key, gatewayKeys, madeHere] = await Promise.all([
    gatewayAccount(),
    activeKeySummary(session.user.id),
    listGatewayKeys(),
    generatedKids(session.user.id),
  ]);
  const twoFactor = account.ok ? account.value.twoFactor : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Profile</h1>
      {account.ok ? <IdentityStrip account={account.value} /> : <ErrorBanner>Couldn’t load your gateway account: {account.error}</ErrorBanner>}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <GatewayKeys
          keys={
            gatewayKeys.ok
              ? gatewayKeys.value.map((k) => ({
                  kid: k.kid,
                  scope: k.scope,
                  ips: k.ips,
                  active: k.status === 'active' || k.status === 'enable',
                  created: formatDateTime(k.createdAt),
                }))
              : []
          }
          error={gatewayKeys.ok ? null : gatewayKeys.error}
          connected={key ? { kid: key.kid, origin: key.origin } : null}
          madeHere={madeHere}
          twoFactor={twoFactor}
        />
        <SecurityCard twoFactor={twoFactor} />
      </div>
    </div>
  );
}
