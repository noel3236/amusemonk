import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { activeKeySummary } from '@/features/api-keys/server';
import { ApiKeyCard } from '@/features/api-keys/key-card';
import { PasswordCard } from '@/features/profile/password-card';
import { gatewayAccount, type GatewayAccount } from '@/features/profile/server';
import { TwoFactorCard } from '@/features/profile/two-factor-card';
import { formatDateTime } from '@/lib/format';
import { Badge, Card, Copyable, ErrorBanner, UserRound } from '@/ui';

export const metadata: Metadata = { title: 'Profile' };

function AccountCard({ account }: { account: GatewayAccount }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-md">
          <UserRound className="size-4" />
        </span>
        <h2 className="text-sm font-bold tracking-tight">Gateway account</h2>
        {account.role && (
          <Badge tone="neutral" className="ml-auto">
            {account.role.replace(/_/g, ' ')}
          </Badge>
        )}
      </div>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2.5 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd className="truncate font-semibold">{account.email || '—'}</dd>
        <dt className="text-muted-foreground">User ID</dt>
        <dd>{account.uid ? <Copyable value={account.uid} label="User ID" mono /> : '—'}</dd>
      </dl>
      <p className="text-muted-foreground border-t pt-4 text-xs">
        You sign in with your gateway account, so its password and two-factor authentication are managed here and
        apply there too.
      </p>
    </Card>
  );
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const [account, key] = await Promise.all([gatewayAccount(), activeKeySummary(session.user.id)]);
  const twoFactor = account.ok ? account.value.twoFactor : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Profile</h1>
      {!account.ok && <ErrorBanner>Couldn’t load your gateway account: {account.error}</ErrorBanner>}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <ApiKeyCard
            apiKey={key ? { kid: key.kid, origin: key.origin, connectedAt: formatDateTime(key.created_at) } : null}
            twoFactor={twoFactor}
          />
          {account.ok && <TwoFactorCard enabled={account.value.twoFactor} />}
        </div>
        <div className="flex flex-col gap-4">
          {account.ok && <AccountCard account={account.value} />}
          <PasswordCard />
        </div>
      </div>
    </div>
  );
}
