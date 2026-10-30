export const ZONES = [
  { zone: 'Asia/Kolkata', label: 'India', abbr: 'IST' },
  { zone: 'UTC', label: 'UTC', abbr: 'UTC' },
  { zone: 'Asia/Singapore', label: 'Singapore', abbr: 'SGT' },
  { zone: 'Asia/Dubai', label: 'Dubai', abbr: 'GST' },
] as const;

export type ZoneId = (typeof ZONES)[number]['zone'];

// Business days (the date window rule, "today" for uploads, the status CSV) are IST whatever the viewer picks.
export const BUSINESS_ZONE: ZoneId = 'Asia/Kolkata';
export const DEFAULT_ZONE: ZoneId = BUSINESS_ZONE;
export const ZONE_COOKIE = 'amusemonk-tz';

// Luxon would print India as GMT+5:30.
export const abbrOf = (zone: ZoneId): string => ZONES.find((z) => z.zone === zone)?.abbr ?? zone;

export const isZone = (value: string | undefined): value is ZoneId => ZONES.some((z) => z.zone === value);
