'use client';

import Link from 'next/link';
import { formatCount, formatDateTime } from '@/lib/format';
import { ArrowRight, Badge, Button, Copyable, CopyableAmount, DataTable, cn, type Column } from '@/ui';
import { FileLink } from './file-link';
import type { FileListRow } from './lists';
import { RejectFileButton } from './reject-button';
import { FILE_STATUS } from './status';

export function FilesTable({
  mode,
  rows,
  total,
  totalPaise,
  empty,
}: {
  mode: 'owner' | 'admin';
  rows: FileListRow[];
  total: number;
  totalPaise: string;
  empty: React.ReactNode;
}) {
  const href = (f: FileListRow) => (mode === 'owner' ? `/files/${f.id}` : `/admin/files/${f.id}`);
  const columns: Column<FileListRow>[] = [
    { key: 'uploaded', header: 'Uploaded', className: 'tabular', render: (f) => formatDateTime(f.created_at) },
    ...(mode === 'admin'
      ? [
          {
            key: 'user',
            header: 'User',
            render: (f: FileListRow) => (
              <>
                <div className="font-semibold">{f.email ? <Copyable value={f.email} label="email" mono={false} /> : '—'}</div>
                <Copyable value={f.gatekeeper_uid} label="gatekeeper UID" className="text-muted-foreground" />
              </>
            ),
          },
        ]
      : []),
    {
      key: 'file',
      header: 'File',
      className: 'max-w-80',
      render: (f) => (
        <FileLink href={href(f)} name={f.original_filename} />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (f) => (
        <>
          <Badge tone={FILE_STATUS[f.status].tone}>{FILE_STATUS[f.status].label}</Badge>
          {f.status === 'REJECTED' && f.cancel_reason && (
            <div className="text-muted-foreground mt-1 max-w-64 truncate text-xs" title={f.cancel_reason}>
              {f.cancel_reason}
            </div>
          )}
        </>
      ),
    },
    { key: 'payouts', header: 'Payouts', align: 'right', className: 'tabular', render: (f) => f.row_count },
    {
      key: 'outcome',
      header: 'Paid / failed',
      align: 'right',
      className: 'tabular',
      render: (f) => (
        <>
          <span className="text-ok font-semibold">{f.paid}</span>
          <span className="text-muted-foreground"> / </span>
          <span className={cn(Number(f.failed) > 0 ? 'text-bad font-semibold' : 'text-muted-foreground')}>{f.failed}</span>
        </>
      ),
    },
    { key: 'total', header: 'Total', align: 'right', className: 'tabular font-semibold', render: (f) => <CopyableAmount paise={f.total_amount_paise} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (f) =>
        mode === 'admin' ? (
          f.status === 'AWAITING_APPROVAL' ? <RejectFileButton fileId={f.id} filename={f.original_filename} owner={f.email} /> : null
        ) : f.status === 'AWAITING_APPROVAL' ? (
          <Button asChild size="sm">
            <Link href={href(f)}>
              Review &amp; Confirm
              <ArrowRight />
            </Link>
          </Button>
        ) : (
          <Button asChild size="sm" variant="ghost">
            <Link href={href(f)}>Open</Link>
          </Button>
        ),
    },
  ];

  return (
    <DataTable
      tableId={mode === 'owner' ? 'files' : 'admin-files'}
      columns={columns}
      rows={rows}
      rowKey={(f) => f.id}
      defaultPinned={['file']}
      empty={empty}
      footer={{
        uploaded: <span className="text-muted-foreground text-xs font-semibold">Total · {formatCount(total)} files</span>,
        total: <CopyableAmount paise={totalPaise} className="tabular" />,
      }}
    />
  );
}
