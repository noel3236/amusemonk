import { GatewayHttpError, type CreateOutcome, type GatewayPayout, type PayoutCreateRequest } from '@/gateway/types';
import type { GatewayPort } from '@/worker/deps';

export type Inject = '500-created' | '500-not-created' | 'timeout-created' | 'timeout-not-created' | 'crash-after-create' | 'gateway-insufficient';

// In-memory stand-in for the UAPI sandbox (guide p.18): the first digit of bank_account decides the outcome.
export class FakeGateway {
  payouts = new Map<string, GatewayPayout>();
  creates = new Map<string, number>();
  balance = new Map<string, bigint>();
  consumed = new Set<string>();
  queue: Inject[] = [];
  authFail = new Set<string>();
  seq = Date.now() % 100_000_000;

  bal(kid: string) { return this.balance.get(kid) ?? 1_000_000_000n; }

  private resolve(p: GatewayPayout) {
    if (p.payout_status !== 'processing') return;
    const d = Number((p as unknown as { account_number: string }).account_number[0]);
    if (d <= 2) Object.assign(p, { payout_status: 'succeed', status_code: 'PAYOUT_SUCCESS', bank_transaction_id: 'UTR' + p.payout_id.slice(3) });
    else if (d === 4) Object.assign(p, { payout_status: 'rejected', status_code: 'INVALID_TXN', status_message: 'Invalid transaction' });
    else if (d === 5 || d === 6) Object.assign(p, { payout_status: 'rejected', status_code: 'PROVIDER_DOWN', status_message: 'Provider down' });
    else if (d === 9) Object.assign(p, { payout_status: 'rejected', status_code: 'TERMINATED', status_message: 'Terminated' });
  }

  clientFor(kid: string): GatewayPort {
    const auth = () => { if (this.authFail.has(kid)) throw new GatewayHttpError(401, { errors: ['authz.invalid_signature'] }); };
    return {
      balance: async () => { auth(); return { currency: 'inr', balance: (Number(this.bal(kid)) / 100).toFixed(2), locked: '0', escrow: '0' }; },
      availableBalancePaise: async () => { auth(); return this.bal(kid); },
      findByClientReference: async (ref: string) => {
        auth();
        const p = this.payouts.get(ref);
        if (!p) return null;
        this.resolve(p);
        return { ...p };
      },
      findByPayoutId: async (id: string) => {
        auth();
        const p = [...this.payouts.values()].find((x) => x.payout_id === id);
        if (p) this.resolve(p);
        return p ? { ...p } : null;
      },
      createPayout: async (req: PayoutCreateRequest): Promise<CreateOutcome> => {
        if (this.authFail.has(kid)) return { kind: 'auth_error', status: 401, codes: ['authz.invalid_signature'] };
        const inj = this.queue.shift();
        const ref = req.client_reference_id;
        if (inj === '500-not-created') return { kind: 'unknown', reason: 'http_500' };
        if (inj === 'timeout-not-created') return { kind: 'unknown', reason: 'timeout after 15000ms' };
        if (this.payouts.has(ref) || this.consumed.has(ref)) return { kind: 'duplicate_reference' };
        const amount = BigInt(Math.round(Number(req.amount) * 100));
        if (inj === 'gateway-insufficient' || amount > this.bal(kid)) { this.consumed.add(ref); return { kind: 'insufficient_balance' }; }
        this.balance.set(kid, this.bal(kid) - amount);
        this.creates.set(ref, (this.creates.get(ref) ?? 0) + 1);
        const p = { payout_id: 'TID' + String(++this.seq).padStart(8, '0'), bank_currency: 'inr', client_reference_id: ref, amount: req.amount, fee: '0', payout_status: 'processing', status_code: 'PROCESSING', status_message: null, bank_transaction_id: null, created_at: Date.now(), completed_at: null, account_number: req.account_number } as GatewayPayout;
        this.payouts.set(ref, p);
        if (inj === '500-created') return { kind: 'unknown', reason: 'http_500' };
        if (inj === 'timeout-created') return { kind: 'unknown', reason: 'timeout after 15000ms' };
        if (inj === 'crash-after-create') throw new Error('process died right after the POST');
        return { kind: 'created', payout: { ...p } };
      },
    };
  }
}
