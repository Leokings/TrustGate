import { describe, expect, it } from 'vitest';
import { analyzeLocally, normalizeCalldata } from './preflight';

const spender = '3333333333333333333333333333333333333333';

function approval(amount: bigint) {
  return `0x095ea7b3${'0'.repeat(24)}${spender}${amount.toString(16).padStart(64, '0')}`;
}

describe('TrustGate local preflight', () => {
  it('blocks unlimited approvals before consensus', () => {
    const result = analyzeLocally({
      policyId: 'balanced-v1',
      valueWei: 0n,
      calldata: approval((1n << 256n) - 1n),
      hasEvidence: false,
    });

    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCodes).toContain('UNLIMITED_TOKEN_APPROVAL');
  });

  it('sends a non-blocked evidence-backed request to consensus', () => {
    const result = analyzeLocally({
      policyId: 'balanced-v1',
      valueWei: 0n,
      calldata: '0x',
      hasEvidence: true,
    });

    expect(result.decision).toBe('REQUIRES_CONSENSUS');
  });

  it('fails closed without evidence', () => {
    const result = analyzeLocally({
      policyId: 'balanced-v1',
      valueWei: 0n,
      calldata: '0x',
      hasEvidence: false,
    });

    expect(result.decision).toBe('REVIEW');
    expect(result.reasonCodes).toEqual(['NO_EVIDENCE']);
  });

  it('rejects malformed hexadecimal calldata', () => {
    expect(() => normalizeCalldata('0xabc')).toThrow(/even-length hexadecimal/);
  });
});
