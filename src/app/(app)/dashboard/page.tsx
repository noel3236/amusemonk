import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { activeKeySummary } from '@/features/api-keys/server';
import { ConnectGatewayCard, ReplaceKeyButton } from '@/features/api-keys/connect-card';
import { lastBalance } from '@/features/balance/server';
import { dashboardStats, listFilesForUser } from '@/features/files/server';
import { FILE_STATUS } from '@/features/files/status';
import { formatDateTime, formatRupees } from '@/lib/format';
import {
  ArrowRight,
  AutoRefresh,
  Badge,
  Button,
  Card,
  Clock,
  EmptyState,
  KeyRound,
  Send,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Upload,
  Wallet,
  CircleCheck,
  cn,
} from '@/ui';

export const metadata: Metadata = { title: 'Overview' };

function Tile({
  icon,
  label,
  value,
  sub,
  tone = 'primary',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: React.ReactNode;
  tone?: 'primary' | 'warn' | 'info' | 'ok';
}) {
  const chip = { primary: 'bg-primary/10 text-primary', warn: 'bg-warn-soft text-warn', info: 'bg-info-soft text-info', ok: 'bg-ok-soft text-ok' }[tone];
  return (
    <Card className="flex items-start gap-3 p-4">
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4', chip)}>{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">{label}</span>
        <span className="tabular truncate text-xl font-extrabold tracking-tight">{value}</span>
        <span className="text-muted-foreground text-xs">{sub}</span>
      </div>
    </Card>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const WAITING_SHOWN = 6;

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const userId = session.user.id;

  const key = await activeKeySummary(userId);
  if (!key) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="sr-only">Get started</h1>
        <ConnectGatewayCard />
        <EmptyState
          icon={<Upload />}
          title="Step 2 · Upload a payout file"
          description="Once your API key is connected, upload a CSV or XLSX of payouts, review it, and confirm payment."
        />
      </div>
    );
  }

  const [balance, stats, files, waiting] = await Promise.all([
    lastBalance(userId),
    dashboardStats(userId),
    listFilesForUser(userId, { limit: 7 }),
    listFilesForUser(userId, { status: 'AWAITING_APPROVAL' }),
  ]);
  const recent = files.slice(0, 6);
  const balanceStale = balance?.error_at && (!balance.fetched_at || balance.error_at > balance.fetched_at);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="sr-only">Overview</h1>
      <AutoRefresh active={stats.inFlight.n > 0} seconds={20} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Tile
          icon={<Wallet />}
          label="Available balance"
          value={formatRupees(balance?.balance_paise)}
          sub={
            <>
              {balanceStale ? `Couldn’t refresh at ${formatDateTime(balance!.error_at)}` : `As of ${formatDateTime(balance?.fetched_at)}`}
              <span className="mt-1 flex items-center gap-1.5">
                <KeyRound className="size-3" />
                <span className="text-foreground font-mono">{key.kid}</span>
                <span aria-hidden>·</span>
                <ReplaceKeyButton />
              </span>
            </>
          }
        />
        <Tile
          icon={<Clock />}
          tone="warn"
          label="Waiting for you"
          value={formatRupees(stats.toConfirm.paise)}
          sub={`${plural(stats.toConfirm.n, 'payout', 'payouts')} in ${plural(waiting.length, 'file', 'files')} to confirm`}
        />
        <Tile
          icon={<Send />}
          tone="info"
          label="In progress"
          value={formatRupees(stats.inFlight.paise)}
          sub={`${plural(stats.inFlight.n, 'payout', 'payouts')} being sent or settled`}
        />
        <Tile
          icon={<CircleCheck />}
          tone="ok"
          label="Paid today"
          value={formatRupees(stats.paidToday.paise)}
          sub={
            <>
              {plural(stats.paidToday.n, 'payout', 'payouts')}
              {stats.failedToday.n > 0 && (
                <span className="text-bad font-semibold"> · {stats.failedToday.n} failed ({formatRupees(stats.failedToday.paise)})</span>
              )}
            </>
          }
        />
      </div>

      {waiting.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-muted-foreground text-[11px] font-bold tracking-[0.12em] uppercase">Needs your confirmation</h2>
            {waiting.length > WAITING_SHOWN && (
              <Link href="/files" className="text-primary text-xs font-semibold hover:underline">
                All {waiting.length} waiting
              </Link>
            )}
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {waiting.slice(0, WAITING_SHOWN).map((f) => (
              <Card key={f.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-bold" title={f.original_filename}>{f.original_filename}</span>
                  <span className="text-muted-foreground tabular text-xs">
                    {plural(f.row_count, 'payout', 'payouts')} · uploaded {formatDateTime(f.created_at)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tabular font-extrabold">{formatRupees(f.total_amount_paise)}</span>
                  <Button asChild size="sm">
                    <Link href={`/files/${f.id}`}>
                      Review &amp; Confirm
                      <ArrowRight />
                    </Link>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-muted-foreground text-[11px] font-bold tracking-[0.12em] uppercase">Recent files</h2>
          <div className="flex items-center gap-3">
            {files.length > recent.length && (
              <Link href="/files" className="text-primary text-xs font-semibold hover:underline">
                All files
              </Link>
            )}
            <Button asChild size="sm">
              <Link href="/files">
                <Upload />
                Upload Payout File
              </Link>
            </Button>
          </div>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={<Upload />}
            title="No payout files yet"
            description="Upload a CSV or XLSX of payouts. Every row is checked before anything is sent."
            action={
              <Button asChild>
                <Link href="/files">
                  <Upload />
                  Upload Payout File
                </Link>
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Uploaded</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Paid / failed / total</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="tabular">{formatDateTime(f.created_at)}</TableCell>
                  <TableCell className="max-w-80 truncate" title={f.original_filename}>
                    <Link href={`/files/${f.id}`} className="text-primary font-semibold hover:underline">
                      {f.original_filename}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge tone={FILE_STATUS[f.status].tone}>{FILE_STATUS[f.status].label}</Badge>
                  </TableCell>
                  <TableCell className="tabular text-right">
                    <span className="text-ok font-semibold">{f.paid}</span>
                    <span className="text-muted-foreground"> / </span>
                    <span className={cn(Number(f.failed) > 0 ? 'text-bad font-semibold' : 'text-muted-foreground')}>{f.failed}</span>
                    <span className="text-muted-foreground"> / {f.row_count}</span>
                  </TableCell>
                  <TableCell className="tabular text-right font-semibold">{formatRupees(f.total_amount_paise)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
