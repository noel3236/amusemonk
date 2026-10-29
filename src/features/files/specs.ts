import type { FileStatus, PayoutStatus } from '@/db/schema';
import type { ListSpec } from '@/lib/list-spec';

// Client-safe: what each list can be filtered and sorted by, and which statuses a quick chip stands for.
export const PAYOUT_GROUPS: Record<string, PayoutStatus[]> = {
  in_progress: ['PENDING', 'DISPATCHING', 'PROCESSING', 'UNKNOWN'],
  paid: ['SUCCEEDED'],
  failed: ['FAILED', 'REFUNDED'],
  cancelled: ['CANCELLED'],
};

const PAYOUT_QUICK: ListSpec['quick'] = {
  label: 'Payout status',
  options: [
    { value: 'in_progress', label: 'In progress', tone: 'info' },
    { value: 'paid', label: 'Paid', tone: 'ok' },
    { value: 'failed', label: 'Failed', tone: 'bad' },
    { value: 'cancelled', label: 'Cancelled', tone: 'neutral' },
  ],
};

export const PAYOUTS_SPEC: ListSpec = {
  quick: PAYOUT_QUICK,
  search: [
    { value: 'reference', label: 'Reference' },
    { value: 'account', label: 'Account' },
    { value: 'name', label: 'Beneficiary' },
    { value: 'utr', label: 'UTR' },
    { value: 'gateway', label: 'Gateway ID' },
  ],
  dates: [
    { value: 'updated', label: 'Updated' },
    { value: 'created', label: 'Uploaded' },
    { value: 'completed', label: 'Settled' },
  ],
  amount: true,
  sort: [
    { value: 'updated_desc', label: 'Latest activity' },
    { value: 'amount_desc', label: 'Amount, high to low' },
    { value: 'amount_asc', label: 'Amount, low to high' },
    { value: 'created_desc', label: 'Newest uploads' },
  ],
};

export const FILE_PAYOUTS_SPEC: ListSpec = {
  quick: PAYOUT_QUICK,
  search: PAYOUTS_SPEC.search!.slice(0, 4),
  amount: true,
  sort: [
    { value: 'row_asc', label: 'File order' },
    { value: 'amount_desc', label: 'Amount, high to low' },
    { value: 'amount_asc', label: 'Amount, low to high' },
    { value: 'updated_desc', label: 'Latest activity' },
  ],
};

export const FILE_GROUPS: Record<string, FileStatus[]> = {
  waiting: ['AWAITING_APPROVAL'],
  paying: ['ACCEPTED', 'PROCESSING'],
  completed: ['COMPLETED'],
  failures: ['COMPLETED_WITH_FAILURES', 'FAILED'],
  closed: ['CANCELLED', 'REJECTED'],
};

const FILE_QUICK: ListSpec['quick'] = {
  label: 'File status',
  options: [
    { value: 'waiting', label: 'Waiting', tone: 'warn' },
    { value: 'paying', label: 'Paying', tone: 'info' },
    { value: 'completed', label: 'Completed', tone: 'ok' },
    { value: 'failures', label: 'With failures', tone: 'bad' },
    { value: 'closed', label: 'Cancelled / rejected', tone: 'neutral' },
  ],
};

const FILE_SORT: ListSpec['sort'] = [
  { value: 'created_desc', label: 'Newest first' },
  { value: 'created_asc', label: 'Oldest first' },
  { value: 'total_desc', label: 'Total, high to low' },
];

export const FILES_SPEC: ListSpec = {
  quick: FILE_QUICK,
  search: [{ value: 'filename', label: 'File name' }],
  dates: [
    { value: 'created', label: 'Uploaded' },
    { value: 'approved', label: 'Confirmed' },
  ],
  amount: true,
  sort: FILE_SORT,
};

export const ADMIN_FILES_SPEC: ListSpec = {
  ...FILES_SPEC,
  search: [
    { value: 'filename', label: 'File name' },
    { value: 'user', label: 'User email' },
  ],
};

export const USERS_SPEC: ListSpec = {
  quick: {
    label: 'API key',
    options: [
      { value: 'with_key', label: 'With API key', tone: 'ok' },
      { value: 'no_key', label: 'No API key', tone: 'neutral' },
    ],
  },
  search: [
    { value: 'email', label: 'Email' },
    { value: 'uid', label: 'Gatekeeper UID' },
  ],
  sort: [
    { value: 'login_desc', label: 'Last sign-in' },
    { value: 'files_desc', label: 'Most files' },
  ],
};
