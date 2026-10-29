import { todayIst } from '@/features/ingest/validate';
import { acct } from './db';

export const HEADER = 'client_reference_id,bank_account,ifsc_code,inr_amount,transaction_date,beneficiary_name';
export const today = todayIst();
export const daysAgo = (n: number) => new Date(Date.parse(today + 'T00:00:00Z') - n * 86_400_000).toISOString().slice(0, 10);

export function csv(rows: string[]): Buffer {
  return Buffer.from([HEADER, ...rows].join('\n') + '\n');
}

export function row(ref: string, account: string, amount: string, date = today, ifsc = 'HDFC0000044', name = 'Asha Rao') {
  return [ref, acct(account), ifsc, amount, date, name].join(',');
}
