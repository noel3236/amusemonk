// Shapes from the API Integration Guide (version 2026-10-23).

export type GatewayPayoutStatus = 'processing' | 'succeed' | 'rejected' | 'refunded';

export interface GatewayPayout {
  payout_id: string;
  bank_currency: string;
  beneficiary_id?: string | null;
  client_reference_id: string;
  amount: string;
  fee: string;
  payout_status: GatewayPayoutStatus | string;
  status_code: string;
  status_message: string | null;
  remark?: string | null;
  bank_transaction_id: string | null;
  created_at: number;
  completed_at: number | null;
  [k: string]: unknown;
}

export interface PayoutCreateRequest {
  bank_currency: 'inr';
  amount: string;
  account_holder_name: string;
  client_reference_id: string;
  bank_ifsc_code: string;
  account_number: string;
  penny_drop_required?: boolean;
}

export interface GatewayBalance {
  currency: string;
  balance: string;
  locked: string;
  escrow: string;
  wallet_type?: string;
}

// Classified outcome of POST /account/payouts/initiate.
export type CreateOutcome =
  | { kind: 'created'; payout: GatewayPayout }
  | { kind: 'duplicate_reference' }
  | { kind: 'in_processing' }
  // The gateway has consumed the reference: the payout can never be sent under it again (D-18).
  | { kind: 'insufficient_balance' }
  | { kind: 'validation_failed'; codes: string[] }
  | { kind: 'auth_error'; status: number; codes: string[] }
  | { kind: 'rate_limited' }
  // 500 / timeout / network: the payout MAY exist. Never POST again blindly; reconcile by reference.
  | { kind: 'unknown'; reason: string };

export class GatewayHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message?: string
  ) {
    super(message ?? `Gateway HTTP ${status}`);
  }
}

export class GatewayNetworkError extends Error {}
