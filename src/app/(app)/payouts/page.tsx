import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { listPayouts, payoutFilterOptions } from '@/features/files/lists';
import { PayoutsTable } from '@/features/files/payouts-table';
import { PAYOUTS_SPEC } from '@/features/files/specs';
import { pageHref, parseListQuery } from '@/lib/list-params';
import { EmptyState, ListFilters, Pager, ScrollText } from '@/ui';

export const metadata: Metadata = { title: 'Payouts' };

type SP = Record<string, string | string[] | undefined>;

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const sp = await searchParams;
  const q = parseListQuery(sp, PAYOUTS_SPEC);
  const [list, options] = await Promise.all([listPayouts({ userId: session.user.id }, q), payoutFilterOptions(session.user.id)]);

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">Payouts</h1>
      <ListFilters spec={PAYOUTS_SPEC} counts={list.counts} options={options} />
      <PayoutsTable
        tableId="payouts"
        rows={list.rows}
        showFile
        canFetch
        total={list.total}
        totalPaise={list.totalPaise}
        empty={
          <EmptyState
            icon={<ScrollText />}
            title={list.counts[''] ? 'No payouts match' : 'No payouts yet'}
            description={list.counts[''] ? 'Try another search or clear the filters.' : 'Payouts appear here once a file is accepted.'}
          />
        }
      />
      <Pager page={q.page} pages={list.pages} total={list.total} noun="payouts" hrefFor={(n) => pageHref('/payouts', sp, n)} />
    </div>
  );
}
