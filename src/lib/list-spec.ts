// Client-safe: what one list can be filtered by. The server query and the filter controls both read it,
// so a filter the UI offers is always one the query understands.
export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info';

export interface ListSpec {
  quick?: { label: string; options: { value: string; label: string; tone: Tone }[] };
  search?: { value: string; label: string }[];
  dates?: { value: string; label: string }[];
  amount?: boolean;
  sort?: { value: string; label: string }[];
}

export const DATE_RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
] as const;

// Every URL param a list spec can set, so "Clear all" and pagination resets know what to touch.
export const LIST_PARAMS = ['status', 'q', 'by', 'date_on', 'range', 'from', 'to', 'min', 'max', 'sort'] as const;
