import { describe, expect, it } from 'vitest';
import { canonicalContentHash, normalizeFilename, rowFingerprint, sha256Hex } from '@/features/ingest/fingerprint';

const base = { bankAccount: '1234567890', ifscCode: 'HDFC0000044', amountPaise: 10000n, transactionDate: '2026-10-28' };

describe('fingerprints', () => {
  it('normalises file names so trivial variations collide', () => {
    expect(normalizeFilename('Payouts  Oct.CSV')).toBe('payouts oct.csv');
    expect(normalizeFilename('  payouts oct.csv ')).toBe('payouts oct.csv');
    expect(normalizeFilename('C:\\Users\\x\\payouts oct.csv')).toBe('payouts oct.csv');
  });

  it('identifies a payment by account, IFSC (any case), amount and date only', () => {
    const a = rowFingerprint(base);
    expect(a).toHaveLength(64);
    expect(rowFingerprint({ ...base, ifscCode: 'hdfc0000044' })).toBe(a);
    expect(rowFingerprint({ ...base, amountPaise: 10001n })).not.toBe(a);
  });

  it('hashes a file by its rows, not their order', () => {
    const rows = [
      { ...base, clientReferenceId: 'A1', beneficiaryName: 'N' },
      { ...base, bankAccount: '2', clientReferenceId: 'B1', beneficiaryName: 'M' },
    ];
    expect(canonicalContentHash(rows)).toBe(canonicalContentHash([...rows].reverse()));
    expect(canonicalContentHash(rows)).not.toBe(canonicalContentHash([rows[0]!, { ...rows[1]!, amountPaise: 1n }]));
  });

  it('sha256Hex matches the standard vector', () => {
    expect(sha256Hex(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
