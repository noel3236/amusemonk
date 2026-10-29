import { z } from 'zod';
import { UPLOAD_HARD_LIMIT_MB } from '@/lib/limits';
import { formatInr, parseInrToPaise } from '@/lib/money';

// Client-safe: the rule kinds, their parameters, and how the Rules screen edits them.

export const COLUMNS = [
  'client_reference_id',
  'bank_account',
  'ifsc_code',
  'inr_amount',
  'transaction_date',
  'beneficiary_name',
] as const;
export type Column = (typeof COLUMNS)[number];


const inr = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'Use a plain amount such as 1500 or 1500.50');
const none = z.object({}).strip();
const label = z.string().trim().max(200).optional();

const regex = z
  .string()
  .trim()
  .min(1, 'Enter a pattern')
  .max(200)
  .refine((p) => {
    try {
      new RegExp(p);
      return true;
    } catch {
      return false;
    }
  }, 'Not a valid regular expression');

export const RULE_PARAMS = {
  columns: none,
  row_format: none,
  duplicate_reference: none,
  duplicate_payment: none,
  max_file_size: z.object({ max_mb: z.coerce.number().positive().max(UPLOAD_HARD_LIMIT_MB) }),
  max_rows: z.object({ max_rows: z.coerce.number().int().min(1).max(50_000) }),
  duplicate_filename: none,
  duplicate_file: none,
  duplicate_content: none,
  amount_range: z
    .object({ min_inr: inr, max_inr: inr })
    .refine((p) => Number(p.min_inr) <= Number(p.max_inr), { message: 'Minimum must not exceed maximum', path: ['max_inr'] }),
  file_total_max: z.object({ max_inr: inr }),
  balance_check: none,
  date_window: z.object({ max_age_days: z.coerce.number().int().min(0).max(3650) }),
  max_rows_per_account: z.object({ max: z.coerce.number().int().min(1).max(50_000) }),
  column_pattern: z.object({
    column: z.enum(COLUMNS),
    pattern: regex,
    mode: z.enum(['must_match', 'must_not_match']),
    message: label,
  }),
  value_list: z.object({
    column: z.enum(COLUMNS),
    values: z.array(z.string().trim().min(1).max(100)).min(1).max(1000),
    mode: z.enum(['allow', 'block']),
    message: label,
  }),
} as const;

export type RuleKind = keyof typeof RULE_PARAMS;
export type RuleParams<K extends RuleKind> = z.infer<(typeof RULE_PARAMS)[K]>;

export const LOCKED_KINDS = ['columns', 'row_format', 'duplicate_reference', 'duplicate_payment'] as const;
export const CUSTOM_KINDS = ['column_pattern', 'value_list'] as const;
// Limits an admin may set differently for one user (D-33). On/off stays global.
export const OVERRIDABLE_KINDS = [
  'max_file_size',
  'max_rows',
  'amount_range',
  'file_total_max',
  'date_window',
  'max_rows_per_account',
] as const;
export type CustomKind = (typeof CUSTOM_KINDS)[number];
export type BuiltinKind = Exclude<RuleKind, CustomKind>;

export function isRuleKind(k: string): k is RuleKind {
  return k in RULE_PARAMS;
}

export function isOverridableKind(k: string): k is (typeof OVERRIDABLE_KINDS)[number] {
  return (OVERRIDABLE_KINDS as readonly string[]).includes(k);
}

export function isCustomKind(k: string): k is CustomKind {
  return (CUSTOM_KINDS as readonly string[]).includes(k);
}

export type FieldSpec =
  | { name: string; label: string; type: 'number' | 'text'; suffix?: string; hint?: string }
  | { name: string; label: string; type: 'select'; options: { value: string; label: string }[] }
  | { name: string; label: string; type: 'list'; hint?: string };

const COLUMN_OPTIONS = COLUMNS.map((c) => ({ value: c, label: c }));

// Fields the Rules screen shows for each kind; kinds not listed have nothing to tune.
export const RULE_FIELDS: Partial<Record<RuleKind, FieldSpec[]>> = {
  max_file_size: [{ name: 'max_mb', label: 'Largest file', type: 'number', suffix: 'MB', hint: `Up to ${UPLOAD_HARD_LIMIT_MB} MB` }],
  max_rows: [{ name: 'max_rows', label: 'Most rows per file', type: 'number' }],
  amount_range: [
    { name: 'min_inr', label: 'Smallest payout', type: 'text', suffix: 'INR' },
    { name: 'max_inr', label: 'Largest payout', type: 'text', suffix: 'INR' },
  ],
  file_total_max: [{ name: 'max_inr', label: 'Largest file total', type: 'text', suffix: 'INR' }],
  date_window: [{ name: 'max_age_days', label: 'Oldest transaction date', type: 'number', suffix: 'days' }],
  max_rows_per_account: [{ name: 'max', label: 'Most payouts to one account', type: 'number' }],
  column_pattern: [
    { name: 'column', label: 'Column', type: 'select', options: COLUMN_OPTIONS },
    {
      name: 'mode',
      label: 'Values must',
      type: 'select',
      options: [
        { value: 'must_match', label: 'Match the pattern' },
        { value: 'must_not_match', label: 'Not match the pattern' },
      ],
    },
    { name: 'pattern', label: 'Pattern (regular expression)', type: 'text', hint: 'For example ^HDFC to target one bank' },
    { name: 'message', label: 'Message shown when a row fails', type: 'text' },
  ],
  value_list: [
    { name: 'column', label: 'Column', type: 'select', options: COLUMN_OPTIONS },
    {
      name: 'mode',
      label: 'Listed values are',
      type: 'select',
      options: [
        { value: 'block', label: 'Blocked' },
        { value: 'allow', label: 'The only ones allowed' },
      ],
    },
    { name: 'values', label: 'Values', type: 'list', hint: 'One per line' },
    { name: 'message', label: 'Message shown when a row fails', type: 'text' },
  ],
};

export const CUSTOM_KIND_LABELS: Record<CustomKind, { name: string; description: string }> = {
  column_pattern: { name: 'Pattern check', description: 'A column must (or must not) match a regular expression.' },
  value_list: { name: 'Allow or block list', description: 'Allow only, or block, specific values in a column.' },
};

const rupees = (v: unknown) => {
  const paise = parseInrToPaise(String(v ?? ''));
  return paise === null ? `₹${v}` : `₹${formatInr(paise)}`;
};

export function describeParams(kind: string, params: Record<string, unknown>): string {
  const p = params as Record<string, string | number | string[]>;
  switch (kind) {
    case 'max_file_size':
      return `≤ ${p.max_mb} MB`;
    case 'max_rows':
      return `≤ ${Number(p.max_rows).toLocaleString('en-IN')} rows`;
    case 'amount_range':
      return `${rupees(p.min_inr)} – ${rupees(p.max_inr)}`;
    case 'file_total_max':
      return `≤ ${rupees(p.max_inr)}`;
    case 'date_window':
      return `Last ${p.max_age_days} days, not future`;
    case 'max_rows_per_account':
      return `≤ ${p.max} per account`;
    case 'column_pattern':
      return `${p.column} ${p.mode === 'must_match' ? 'matches' : 'does not match'} /${p.pattern}/`;
    case 'value_list': {
      const values = (p.values as string[]) ?? [];
      return `${p.column}: ${p.mode === 'allow' ? 'only' : 'not'} ${values.slice(0, 3).join(', ')}${values.length > 3 ? ` +${values.length - 3}` : ''}`;
    }
    default:
      return '';
  }
}
