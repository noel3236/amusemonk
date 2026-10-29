import type { ColumnType, Selectable } from 'kysely';

type Defaulted<T> = ColumnType<T, T | undefined, T>;
type Stamp = ColumnType<Date, Date | undefined, Date>;
type NullableStamp = ColumnType<Date | null, Date | null | undefined, Date | null>;
// BIGINT is read as a decimal string (bigNumberStrings) and written as one.
type Paise = ColumnType<string, string, string>;
type Json<T> = ColumnType<T, string, string>;
type ReadOnly<T> = ColumnType<T, never, never>;

export type FileStatus =
  | 'AWAITING_APPROVAL'
  | 'ACCEPTED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'COMPLETED_WITH_FAILURES'
  | 'FAILED'
  | 'CANCELLED'
  | 'REJECTED';
export type PayoutStatus =
  | 'PENDING'
  | 'DISPATCHING'
  | 'PROCESSING'
  | 'UNKNOWN'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REFUNDED'
  | 'CANCELLED';
export type AttemptOutcome = 'STARTED' | 'ADOPTED_EXISTING' | 'CREATED' | 'FAILED' | 'UNKNOWN' | 'DEFERRED';
export type RuleChangeAction =
  | 'created'
  | 'updated'
  | 'enabled'
  | 'disabled'
  | 'deleted'
  | 'override_set'
  | 'override_cleared';

export interface UploadError {
  row?: number;
  column?: string;
  rule?: string;
  code: string;
  message: string;
}

export interface UsersTable {
  id: string;
  gatekeeper_uid: string;
  email: string | null;
  gatekeeper_role: Defaulted<string>;
  last_login_at: NullableStamp;
  created_at: Stamp;
  updated_at: Stamp;
}

export interface UserApiKeysTable {
  id: string;
  user_id: string;
  kid: string;
  secret_enc: string;
  scope: string | null;
  origin: Defaulted<'pasted' | 'generated'>;
  status: Defaulted<'active' | 'revoked'>;
  active_user_id: ReadOnly<string | null>;
  created_at: Stamp;
  revoked_at: NullableStamp;
}

export interface UserBalancesTable {
  user_id: string;
  balance_paise: ColumnType<string | null, string | null | undefined, string | null>;
  locked_paise: ColumnType<string | null, string | null | undefined, string | null>;
  fetched_at: NullableStamp;
  error: string | null;
  error_at: NullableStamp;
}

export interface UploadRulesTable {
  id: string;
  rule_key: string;
  kind: string;
  name: string;
  description: Defaulted<string>;
  enabled: Defaulted<boolean>;
  locked: Defaulted<boolean>;
  params_json: Json<Record<string, unknown>>;
  sort_order: Defaulted<number>;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: NullableStamp;
  created_at: Stamp;
  updated_at: Stamp;
}

export interface UploadRuleChangesTable {
  id: string;
  rule_id: string;
  changed_by: string;
  target_user_id: string | null;
  action: RuleChangeAction;
  before_json: Json<Record<string, unknown> | null>;
  after_json: Json<Record<string, unknown> | null>;
  created_at: Stamp;
}

export interface UserRuleOverridesTable {
  id: string;
  user_id: string;
  rule_id: string;
  params_json: Json<Record<string, unknown>>;
  cleared_at: NullableStamp;
  created_by: string;
  updated_by: string;
  created_at: Stamp;
  updated_at: Stamp;
}

export interface PayoutFilesTable {
  id: string;
  user_id: string;
  original_filename: string;
  normalized_filename: string;
  raw_sha256: string;
  canonical_sha256: string;
  s3_key: string;
  size_bytes: number;
  row_count: number;
  total_amount_paise: Paise;
  status: Defaulted<FileStatus>;
  warnings_json: Json<UploadError[]>;
  rules_snapshot_json: Json<unknown[]>;
  accepted_at: Stamp;
  approved_at: NullableStamp;
  approved_by: string | null;
  cancelled_at: NullableStamp;
  cancelled_by: string | null;
  cancel_reason: string | null;
  completed_at: NullableStamp;
  created_at: Stamp;
  updated_at: Stamp;
}

export interface PayoutsTable {
  id: string;
  file_id: string;
  user_id: string;
  file_row: number;
  client_reference_id: string;
  content_fingerprint: string;
  bank_account: string;
  ifsc_code: string;
  beneficiary_name: string;
  amount_paise: Paise;
  transaction_date: string;
  status: Defaulted<PayoutStatus>;
  failure_reason: string | null;
  attempt_count: Defaulted<number>;
  current_attempt_id: string | null;
  api_key_id: string | null;
  gateway_payout_id: string | null;
  bank_transaction_id: string | null;
  gateway_status: string | null;
  gateway_status_code: string | null;
  gateway_status_message: string | null;
  last_polled_at: NullableStamp;
  next_poll_at: Stamp;
  poll_failures: Defaulted<number>;
  locked_at: NullableStamp;
  locked_by: string | null;
  completed_at: NullableStamp;
  created_at: Stamp;
  updated_at: Stamp;
}

export interface PayoutAttemptsTable {
  id: string;
  payout_id: string;
  attempt_no: number;
  client_reference_id: string;
  api_key_id: string;
  gateway_endpoint: string;
  request_json: Json<unknown> | null;
  response_json: Json<unknown> | null;
  http_status: number | null;
  outcome: Defaulted<AttemptOutcome>;
  error_code: string | null;
  created_at: Stamp;
  finished_at: NullableStamp;
}

export interface UploadAttemptsTable {
  id: string;
  user_id: string;
  original_filename: string;
  raw_sha256: string | null;
  size_bytes: number | null;
  s3_key: string | null;
  outcome: 'ACCEPTED' | 'REJECTED';
  file_id: string | null;
  errors_json: Json<UploadError[]>;
  created_at: Stamp;
}

export interface WebhookEventsTable {
  id: string;
  received_at: Stamp;
  signature_valid: boolean;
  client_reference_id: string | null;
  gateway_payout_id: string | null;
  payload_json: Json<unknown> | null;
  raw_body: string | null;
  processed_at: NullableStamp;
}

export interface Database {
  users: UsersTable;
  user_api_keys: UserApiKeysTable;
  user_balances: UserBalancesTable;
  upload_rules: UploadRulesTable;
  upload_rule_changes: UploadRuleChangesTable;
  user_rule_overrides: UserRuleOverridesTable;
  payout_files: PayoutFilesTable;
  payouts: PayoutsTable;
  payout_attempts: PayoutAttemptsTable;
  upload_attempts: UploadAttemptsTable;
  webhook_events: WebhookEventsTable;
}

export type User = Selectable<UsersTable>;
export type UploadRule = Selectable<UploadRulesTable>;
export type Payout = Selectable<PayoutsTable>;
