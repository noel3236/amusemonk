'use client';

import Link from 'next/link';
import { formatCount, formatDateTime, formatRupees } from '@/lib/format';
import { Badge, Copyable, DataTable, type Column } from '@/ui';
import { FetchStatusButton } from './file-actions';
import type { PayoutRow } from './lists';
import { payoutStatus } from './status';

export function PayoutsTable({
  tableId,
  rows,
  showFile = false,
  canFetch = false,
  total,
  totalPaise,
  empty,
}: {
  tableId: string;
  rows: PayoutRow[];
  showFile?: boolean;
  canFetch?: boolean;
  total: number;
  totalPaise: string;
  empty: React.ReactNode;
}) {
  const columns: Column<PayoutRow>[] = [
    showFile
      ? {
          key: 'file',
          header: 'File',
          className: 'max-w-56',
          render: (p) => (
            <div className="min-w-0">
              <Link href={`/files/${p.file_id}`} className="text-primary block truncate font-semibold hover:underline">
                {p.original_filename}
              </Link>
              <div className="text-muted-foreground text-xs">row {p.file_row}</div>
            </div>
          ),
        }
      : { key: 'row', header: 'Row', align: 'right', className: 'w-14 text-muted-foreground tabular', render: (p) => p.file_row },
    { key: 'reference', header: 'Reference', render: (p) => <Copyable value={p.client_reference_id} label="reference" /> },
    {
      key: 'beneficiary',
      header: 'Beneficiary',
      render: (p) => (
        <>
          <div className="font-semibold">{p.beneficiary_name}</div>
          <div className="text-muted-foreground font-mono text-xs">
            {p.bank_account} · {p.ifsc_code}
          </div>
        </>
      ),
    },
    { key: 'amount', header: 'Amount', align: 'right', className: 'tabular font-semibold', render: (p) => formatRupees(p.amount_paise) },
    {
      key: 'status',
      header: 'Status',
      className: 'max-w-64 whitespace-normal',
      render: (p) => {
        const st = payoutStatus(p.status, p.file_status);
        const problem = p.status === 'FAILED' || p.status === 'REFUNDED' ? p.gateway_status_message || p.failure_reason : null;
        return (
          <>
            <Badge tone={st.tone}>{st.label}</Badge>
            {problem && <div className="text-bad mt-1 text-xs">{problem}</div>}
          </>
        );
      },
    },
    { key: 'utr', header: 'UTR', render: (p) => (p.bank_transaction_id ? <Copyable value={p.bank_transaction_id} label="UTR" /> : <span className="text-muted-foreground">—</span>) },
    {
      key: 'gateway',
      header: 'Gateway ID',
      render: (p) => (p.gateway_payout_id ? <Copyable value={p.gateway_payout_id} label="gateway payout ID" /> : <span className="text-muted-foreground">—</span>),
    },
    { key: 'updated', header: 'Updated', className: 'tabular text-muted-foreground text-xs', render: (p) => formatDateTime(p.updated_at) },
  ];
  if (canFetch) {
    columns.push({
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (p.status !== 'PENDING' && p.status !== 'CANCELLED' ? <FetchStatusButton payoutId={p.id} reference={p.client_reference_id} /> : null),
    });
  }

  return (
    <DataTable
      tableId={tableId}
      columns={columns}
      rows={rows}
      rowKey={(p) => p.id}
      defaultPinned={['reference']}
      empty={empty}
      footer={{
        reference: <span className="tabular text-xs">Total · {formatCount(total)} payouts</span>,
        amount: <span className="tabular">{formatRupees(totalPaise)}</span>,
      }}
    />
  );
}
