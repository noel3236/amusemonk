'use client';

import type { UploadError } from '@/db/schema';
import { formatDateTime } from '@/lib/format';
import { Button, Copyable, DataTable, Download, type Column } from '@/ui';

type Row = { id: string; original_filename: string; created_at: Date; errors_json: UploadError[] };

export function RejectedTable({ rows, empty }: { rows: Row[]; empty: React.ReactNode }) {
  const columns: Column<Row>[] = [
    { key: 'uploaded', header: 'Uploaded', className: 'tabular', render: (u) => formatDateTime(u.created_at) },
    { key: 'file', header: 'File', className: 'max-w-72 font-semibold', render: (u) => <Copyable value={u.original_filename} label="file name" mono={false} /> },
    { key: 'problems', header: 'Problems', align: 'right', className: 'tabular', render: (u) => u.errors_json.length },
    {
      key: 'first',
      header: 'First problem',
      className: 'text-muted-foreground max-w-[28rem] truncate',
      render: (u) => <span title={u.errors_json[0]?.message}>{u.errors_json[0]?.message ?? '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <Button asChild size="sm" variant="ghost">
          <a href={`/uploads/${u.id}/errors.csv`}>
            <Download />
            Error Report
          </a>
        </Button>
      ),
    },
  ];
  return <DataTable tableId="rejected-uploads" columns={columns} rows={rows} rowKey={(u) => u.id} empty={empty} />;
}
