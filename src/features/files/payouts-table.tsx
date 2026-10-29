'use client';

import { formatCount, formatDateTime } from '@/lib/format';
import { Badge, Copyable, CopyableAmount, DataTable, type Column } from '@/ui';
import { FetchStatusButton, RawDataButton } from './file-actions';
import { FileLink } from './file-link';
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
              <FileLink href={`/files/${p.file_id}`} name={p.original_filename} />
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
          <div className="font-semibold">
            <Copyable value={p.beneficiary_name} label="beneficiary name" mono={false} />
          </div>
          <div className="text-muted-foreground flex items-center gap-1 text-xs">
            <Copyable value={p.bank_account} label="account number" /> · <Copyable value={p.ifsc_code} label="IFSC" />
          </div>
        </>
      ),
    },
    { key: 'amount', header: 'Amount', align: 'right', className: 'tabular font-semibold', render: (p) => <CopyableAmount paise={p.amount_paise} /> },
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
  columns.push({
    key: 'actions',
    header: '',
    align: 'right',
    render: (p) => (
      <div className="flex justify-end">
        {(p.attempt_count > 0 || p.gateway_status) && <RawDataButton payoutId={p.id} reference={p.client_reference_id} />}
        {canFetch && p.status !== 'PENDING' && p.status !== 'CANCELLED' && <FetchStatusButton payoutId={p.id} reference={p.client_reference_id} />}
      </div>
    ),
  });

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
        amount: <CopyableAmount paise={totalPaise} className="tabular" />,
      }}
    />
  );
}
