import { DateTime } from 'luxon';
import { formatInr } from './money';
import { abbrOf, DEFAULT_ZONE, type ZoneId } from './timezones';

export type DateInput = Date | string | number | null | undefined;

export function toDateTime(d: DateInput): DateTime | null {
  if (d === null || d === undefined || d === '') return null;
  const dt = d instanceof Date ? DateTime.fromJSDate(d) : typeof d === 'number' ? DateTime.fromMillis(d) : DateTime.fromISO(d);
  return dt.isValid ? dt : null;
}

export function formatDateTime(d: DateInput, zone: ZoneId = DEFAULT_ZONE): string {
  const dt = toDateTime(d);
  return dt ? `${dt.setZone(zone).toFormat('d LLL yyyy, HH:mm')} ${abbrOf(zone)}` : '—';
}

export function formatRelative(d: DateInput): string {
  return toDateTime(d)?.toRelative() ?? '—';
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-IN');
}

export function formatRupees(paise: string | bigint | null | undefined): string {
  return paise === null || paise === undefined ? '—' : `₹${formatInr(paise)}`;
}
