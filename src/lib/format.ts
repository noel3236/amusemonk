import { DateTime } from 'luxon';
import { formatInr } from './money';

export const DISPLAY_ZONE = 'Asia/Kolkata';

export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return '—';
  return DateTime.fromJSDate(d).setZone(DISPLAY_ZONE).toFormat("d LLL yyyy, HH:mm 'IST'");
}

export function formatRupees(paise: string | bigint | null | undefined): string {
  return paise === null || paise === undefined ? '—' : `₹${formatInr(paise)}`;
}
