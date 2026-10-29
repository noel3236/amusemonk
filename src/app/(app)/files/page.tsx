import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { activeKeySummary } from '@/features/api-keys/server';
import { FilesTable } from '@/features/files/files-table';
import { listFiles } from '@/features/files/lists';
import { FILES_SPEC } from '@/features/files/specs';
import { RejectedTable } from '@/features/ingest/rejected-table';
import { listRejectedUploads } from '@/features/ingest/server';
import { UploadCard } from '@/features/ingest/upload-card';
import { listRules } from '@/features/rules/server';
import { pageHref, parseListQuery } from '@/lib/list-params';
import { Button, EmptyState, FileSpreadsheet, FilterChips, Link2, ListFilters, Pager } from '@/ui';

export const metadata: Metadata = { title: 'Files' };

type SP = Record<string, string | string[] | undefined>;

export default async function FilesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const sp = await searchParams;
  const rejectedView = sp.view === 'rejected';
  const q = parseListQuery(sp, FILES_SPEC);

  const [key, list, rejected, rules] = await Promise.all([
    activeKeySummary(session.user.id),
    listFiles({ userId: session.user.id }, q),
    listRejectedUploads(session.user.id),
    listRules(),
  ]);
  const ruleNames = Object.fromEntries(rules.map((r) => [r.rule_key, r.name]));
  const views = (
    <FilterChips
      label="Files view"
      items={[
        { label: 'Files', href: '/files', active: !rejectedView, count: list.counts[''] },
        { label: 'Rejected uploads', href: '/files?view=rejected', active: rejectedView, count: rejected.length },
      ]}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Payout files</h1>
      {key ? (
        <UploadCard ruleNames={ruleNames} />
      ) : (
        <EmptyState
          icon={<Link2 />}
          title="Connect your API key first"
          description="Payouts are sent from your own gateway account, so uploads open once your API key is connected."
          action={
            <Button asChild>
              <Link href="/dashboard">
                <Link2 />
                Connect API Key
              </Link>
            </Button>
          }
        />
      )}

      {rejectedView ? (
        <section className="flex flex-col gap-3">
          <div className="flex justify-end">{views}</div>
          <RejectedTable
            rows={rejected}
            empty={<EmptyState icon={<FileSpreadsheet />} title="No rejected uploads" description="When an upload breaks a rule, it appears here with a downloadable error report." />}
          />
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <ListFilters spec={FILES_SPEC} counts={list.counts} actions={views} />
          <FilesTable
            mode="owner"
            rows={list.rows}
            total={list.total}
            totalPaise={list.totalPaise}
            empty={
              <EmptyState
                icon={<FileSpreadsheet />}
                title={list.counts[''] ? 'No files match' : 'No files yet'}
                description={list.counts[''] ? 'Try another search or clear the filters.' : 'Accepted files appear here. Open one to review its rows and confirm payment.'}
              />
            }
          />
          <Pager page={q.page} pages={list.pages} total={list.total} noun="files" hrefFor={(n) => pageHref('/files', sp, n)} />
        </section>
      )}
    </div>
  );
}
