import type { Metadata } from 'next';
import { FilesTable } from '@/features/files/files-table';
import { listFiles } from '@/features/files/lists';
import { ADMIN_FILES_SPEC } from '@/features/files/specs';
import { pageHref, parseListQuery } from '@/lib/list-params';
import { EmptyState, FileSpreadsheet, ListFilters, Pager } from '@/ui';

export const metadata: Metadata = { title: 'All files' };

type SP = Record<string, string | string[] | undefined>;

export default async function AdminFilesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = parseListQuery(sp, ADMIN_FILES_SPEC);
  const list = await listFiles({}, q);
  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">All files</h1>
      <ListFilters spec={ADMIN_FILES_SPEC} counts={list.counts} />
      <FilesTable
        mode="admin"
        rows={list.rows}
        total={list.total}
        totalPaise={list.totalPaise}
        empty={
          <EmptyState
            icon={<FileSpreadsheet />}
            title={list.counts[''] ? 'No files match' : 'No files uploaded yet'}
            description={list.counts[''] ? 'Try another search or clear the filters.' : "Files appear here as soon as a user's upload passes the rules."}
          />
        }
      />
      <Pager page={q.page} pages={list.pages} total={list.total} noun="files" hrefFor={(n) => pageHref('/admin/files', sp, n)} />
    </div>
  );
}
