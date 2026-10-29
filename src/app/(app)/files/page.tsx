import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { activeKeySummary } from '@/features/api-keys/server';
import { FilesTable } from '@/features/files/files-table';
import { listFiles } from '@/features/files/lists';
import { FILES_SPEC } from '@/features/files/specs';
import { RejectedTable } from '@/features/ingest/rejected-table';
import { listRejectedUploads } from '@/features/ingest/server';
import { UploadDialog } from '@/features/ingest/upload-dialog';
import { listRules } from '@/features/rules/server';
import { pageHref, parseListQuery } from '@/lib/list-params';
import { EmptyState, FileSpreadsheet, FilterChips, ListFilters, Pager } from '@/ui';

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
  const actions = (
    <>
      <FilterChips
        label="Files view"
        items={[
          { label: 'Files', href: '/files', active: !rejectedView, count: list.counts[''] },
          { label: 'Rejected uploads', href: '/files?view=rejected', active: rejectedView, count: rejected.length },
        ]}
      />
      <UploadDialog ruleNames={ruleNames} hasKey={!!key} />
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Payout files</h1>
      {rejectedView ? (
        <section className="flex flex-col gap-3">
          <div className="flex justify-end gap-2">{actions}</div>
          <RejectedTable
            rows={rejected}
            empty={<EmptyState icon={<FileSpreadsheet />} title="No rejected uploads" description="When an upload breaks a rule, it appears here with a downloadable error report." />}
          />
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <ListFilters spec={FILES_SPEC} counts={list.counts} actions={actions} />
          <FilesTable
            mode="owner"
            rows={list.rows}
            total={list.total}
            totalPaise={list.totalPaise}
            empty={
              <EmptyState
                icon={<FileSpreadsheet />}
                title={list.counts[''] ? 'No files match' : 'No files yet'}
                description={list.counts[''] ? 'Try another search or clear the filters.' : 'Upload a payout file to review its rows and confirm payment.'}
              />
            }
          />
          <Pager page={q.page} pages={list.pages} total={list.total} noun="files" hrefFor={(n) => pageHref('/files', sp, n)} />
        </section>
      )}
    </div>
  );
}
