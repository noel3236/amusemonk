import Link from 'next/link';
import { lastBalance } from '@/features/balance/server';
import { RejectFileButton } from '@/features/files/reject-button';
import { formatDateTime, formatRupees } from '@/lib/format';
import {
  ArrowLeft,
  AutoRefresh,
  Badge,
  Button,
  Card,
  CircleAlert,
  CircleX,
  Clock,
  Download,
  ListFilters,
  Pager,
  cn,
} from '@/ui';
import { CancelFileButton, ConfirmPaymentButton } from './file-actions';
import { pageHref, parseListQuery } from '@/lib/list-params';
import type { ListSpec } from '@/lib/list-spec';
import { listPayouts } from './lists';
import { PayoutsTable } from './payouts-table';
import { fileSummary, type FileRow } from './server';
import { FILE_PAYOUTS_SPEC } from './specs';
import { FILE_IN_FLIGHT, FILE_STATUS } from './status';

function Tile({ label, n, paise, tone }: { label: string; n: number; paise: bigint | string; tone: 'ok' | 'info' | 'bad' | 'neutral' }) {
  const color = { ok: 'text-ok', info: 'text-info', bad: 'text-bad', neutral: 'text-foreground' }[tone];
  return (
    <Card className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">{label}</span>
      <span className={cn('tabular text-lg font-extrabold tracking-tight', color)}>{formatRupees(paise)}</span>
      <span className="text-muted-foreground tabular text-xs">
        {n} {n === 1 ? 'payout' : 'payouts'}
      </span>
    </Card>
  );
}

function Banner({ tone, icon, children }: { tone: 'warn' | 'bad' | 'info' | 'neutral'; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = { warn: 'bg-warn-soft', bad: 'bg-bad-soft', info: 'bg-info-soft', neutral: 'bg-sunken' }[tone];
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg px-4 py-2.5 text-sm', cls)}>
      <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

export async function FileDetail({
  file,
  sp,
  mode,
}: {
  file: FileRow;
  sp: Record<string, string | string[] | undefined>;
  mode: 'owner' | 'admin';
}) {
  const base = mode === 'owner' ? `/files/${file.id}` : `/admin/files/${file.id}`;
  const q = parseListQuery(sp, FILE_PAYOUTS_SPEC);
  const [summary, list, balance] = await Promise.all([
    fileSummary(file.id),
    listPayouts({ fileId: file.id }, q, 100),
    mode === 'owner' ? lastBalance(file.user_id) : Promise.resolve(undefined),
  ]);
  const st = FILE_STATUS[file.status];
  const awaiting = file.status === 'AWAITING_APPROVAL';
  const moving = FILE_IN_FLIGHT.includes(file.status) || (summary.inFlight.n > 0 && !!file.approved_at);
  const finished = ['COMPLETED', 'COMPLETED_WITH_FAILURES', 'FAILED'].includes(file.status);
  const total = formatRupees(file.total_amount_paise);
  // Before confirmation nothing is in progress yet: the same chip reads "Not confirmed".
  const spec: ListSpec = awaiting
    ? { ...FILE_PAYOUTS_SPEC, quick: { ...FILE_PAYOUTS_SPEC.quick!, options: FILE_PAYOUTS_SPEC.quick!.options.map((o) => (o.value === 'in_progress' ? { ...o, label: 'Not confirmed', tone: 'neutral' as const } : o)) } }
    : FILE_PAYOUTS_SPEC;

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={3} active={moving} />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={mode === 'owner' ? '/files' : '/admin/files'}
            aria-label={mode === 'owner' ? 'Back to files' : 'Back to all users’ files'}
            className="text-muted-foreground hover:text-foreground hover:bg-hover flex size-8 shrink-0 items-center justify-center rounded-md"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex min-w-0 flex-col">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-lg font-bold tracking-tight">{file.original_filename}</h1>
              <Badge tone={st.tone}>{st.label}</Badge>
            </div>
            <p className="text-muted-foreground tabular truncate text-xs">
              {mode === 'admin' && <>{file.owner_email} · </>}
              Uploaded {formatDateTime(file.created_at)} · {file.row_count} payouts · {total}
              {file.approved_at && <> · Confirmed {formatDateTime(file.approved_at)}</>}
              {finished && file.completed_at && <> · Finished {formatDateTime(file.completed_at)}</>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost">
            <a href={`/files/${file.id}/original`}>
              <Download />
              Original File
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/files/${file.id}/status.csv`}>
              <Download />
              Download Status CSV
            </a>
          </Button>
          {mode === 'admin' && awaiting && (
            <RejectFileButton fileId={file.id} filename={file.original_filename} owner={file.owner_email} />
          )}
        </div>
      </header>

      {awaiting && mode === 'owner' && (
        <Card className="border-primary/30 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-primary text-[11px] font-bold tracking-[0.12em] uppercase">Review, then confirm</span>
            <p className="max-w-2xl text-sm">
              Check every row below. <span className="font-semibold">Confirm Payment</span> sends{' '}
              <span className="tabular font-semibold">{file.row_count}</span> payouts totalling{' '}
              <span className="tabular font-semibold">{total}</span> from your gateway account. Nothing has been sent
              yet.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CancelFileButton fileId={file.id} filename={file.original_filename} />
            <ConfirmPaymentButton
              fileId={file.id}
              count={file.row_count}
              total={total}
              balance={
                balance?.balance_paise
                  ? { amount: formatRupees(balance.balance_paise), asOf: formatDateTime(balance.fetched_at) }
                  : null
              }
            />
          </div>
        </Card>
      )}
      {awaiting && mode === 'admin' && (
        <Banner tone="warn" icon={<Clock />}>
          <span className="font-bold">Waiting for {file.owner_email ?? 'the owner'} to confirm payment</span>
          <span>You can reject it until they do.</span>
        </Banner>
      )}
      {file.status === 'REJECTED' && (
        <Banner tone="bad" icon={<CircleX />}>
          <span className="font-bold">Rejected by an admin {formatDateTime(file.cancelled_at)}</span>
          <span>{file.cancel_reason}</span>
        </Banner>
      )}
      {file.status === 'CANCELLED' && (
        <Banner tone="neutral" icon={<CircleAlert />}>
          <span className="font-bold">Cancelled {formatDateTime(file.cancelled_at)}</span>
          <span>{file.cancel_reason || 'No reason given.'} Nothing from this file was sent.</span>
        </Banner>
      )}
      {moving && (
        <Banner tone="info" icon={<Clock />}>
          <span className="font-bold">Paying</span>
          <span>Payouts are sent one by one and checked with the gateway. This page updates by itself.</span>
        </Banner>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Paid" n={summary.paid.n} paise={summary.paid.paise} tone="ok" />
        <Tile label={awaiting ? 'Not confirmed' : 'In progress'} n={summary.inFlight.n} paise={summary.inFlight.paise} tone={awaiting ? 'neutral' : 'info'} />
        <Tile label="Failed" n={summary.failed.n} paise={summary.failed.paise} tone="bad" />
        <Tile label="File total" n={file.row_count} paise={file.total_amount_paise} tone="neutral" />
      </div>

      <section className="flex flex-col gap-3">
        <ListFilters spec={spec} counts={list.counts} />
        <PayoutsTable
          tableId="file-payouts"
          rows={list.rows}
          canFetch={mode === 'owner'}
          total={list.total}
          totalPaise={list.totalPaise}
          empty={
            <p className="text-muted-foreground bg-sunken/60 rounded-lg border border-dashed px-4 py-6 text-center text-xs">
              No payouts match. Try another search or clear the filters.
            </p>
          }
        />
        <Pager page={q.page} pages={list.pages} total={list.total} noun="payouts" hrefFor={(n) => pageHref(base, sp, n)} />
      </section>
    </div>
  );
}
