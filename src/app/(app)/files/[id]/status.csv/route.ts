import { DateTime } from 'luxon';
import { canSee, notFound, viewer } from '@/features/files/access';
import { filePayoutsForExport } from '@/features/files/lists';
import { getFile } from '@/features/files/server';
import { COLUMNS } from '@/features/rules/catalog';
import { csvResponse, toCsv } from '@/lib/csv';
import { BUSINESS_ZONE } from '@/lib/timezones';
import { paiseToInr } from '@/lib/money';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return new Response('Sign in first', { status: 401 });
  const file = await getFile((await params).id);
  if (!file || !canSee(v, file.user_id)) return notFound();

  const rows = await filePayoutsForExport(file.id);
  const body = toCsv(
    [
      ...COLUMNS,
      'status',
      'utr',
      'gateway_payout_id',
      'gateway_status',
      'status_code',
      'status_message',
      'attempts',
      'last_updated',
    ],
    rows.map((p) => [
      p.client_reference_id,
      p.bank_account,
      p.ifsc_code,
      paiseToInr(p.amount_paise),
      p.transaction_date,
      p.beneficiary_name,
      p.status,
      p.bank_transaction_id,
      p.gateway_payout_id,
      p.gateway_status,
      p.gateway_status_code,
      p.gateway_status_message ?? p.failure_reason,
      p.attempt_count,
      DateTime.fromJSDate(p.updated_at).setZone(BUSINESS_ZONE).toISO({ suppressMilliseconds: true }),
    ])
  );
  const stem = file.original_filename.replace(/\.(csv|xlsx)$/i, '');
  return csvResponse(body, `${stem}-status.csv`);
}
