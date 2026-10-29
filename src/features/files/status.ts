import type { FileStatus, PayoutStatus } from '@/db/schema';

export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info';

export const FILE_STATUS: Record<FileStatus, { label: string; tone: Tone }> = {
  AWAITING_APPROVAL: { label: 'Waiting for confirmation', tone: 'warn' },
  ACCEPTED: { label: 'Confirmed', tone: 'info' },
  PROCESSING: { label: 'Paying', tone: 'info' },
  COMPLETED: { label: 'Completed', tone: 'ok' },
  COMPLETED_WITH_FAILURES: { label: 'Completed with failures', tone: 'warn' },
  FAILED: { label: 'Failed', tone: 'bad' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  REJECTED: { label: 'Rejected by admin', tone: 'bad' },
};

export const PAYOUT_STATUS: Record<PayoutStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Queued', tone: 'info' },
  DISPATCHING: { label: 'Sending', tone: 'info' },
  PROCESSING: { label: 'Processing', tone: 'info' },
  UNKNOWN: { label: 'Checking with gateway', tone: 'warn' },
  SUCCEEDED: { label: 'Paid', tone: 'ok' },
  FAILED: { label: 'Failed', tone: 'bad' },
  REFUNDED: { label: 'Refunded', tone: 'warn' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

// A PENDING payout of a file nobody has confirmed isn't queued for anything yet.
export function payoutStatus(status: PayoutStatus, fileStatus: FileStatus) {
  if (status === 'PENDING' && fileStatus === 'AWAITING_APPROVAL') return { label: 'Not confirmed', tone: 'neutral' as Tone };
  return PAYOUT_STATUS[status];
}

export const FILE_IN_FLIGHT: FileStatus[] = ['ACCEPTED', 'PROCESSING'];
