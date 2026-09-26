import { describe, expect, it, vi } from 'vitest';
import { computeClearanceDigest, computeTransactionBinding, guardedSend } from './agent-tool';
import type { ClearanceRecord, ClearanceRequest } from '../types';

const CONFIG_DIGEST = 'a'.repeat(64);

const request: ClearanceRequest = {
  requestReference: 'agent-test-1',
  policyId: 'balanced-v1',
  chainId: 1n,
  transactionNonce: 7n,
  fromAddress: '0x2222222222222222222222222222222222222222',
  toAddress: '0x1111111111111111111111111111111111111111',
  valueWei: 0n,
  calldata: '0x',
  intent: 'Verify the official destination before interacting with it.',
  evidenceUrls: [],
  validForSeconds: 3600n,
};

function clearance(decision: ClearanceRecord['decision']): ClearanceRecord {
  const binding = computeTransactionBinding(request);
  const record: Omit<ClearanceRecord, 'clearanceDigest'> = {
    clearanceId: 1n,
    requestReference: request.requestReference,
    requester: request.fromAddress,
    policyId: request.policyId,
    chainId: request.chainId,
    transactionNonce: request.transactionNonce,
    fromAddress: request.fromAddress,
    toAddress: request.toAddress,
    valueWei: request.valueWei,
    calldataHash: binding.calldataHash,
    transactionDigest: binding.transactionDigest,
    actionKind: 'NATIVE_TRANSFER',
    intent: request.intent,
    evidenceUrls: [],
    evidenceDigest: 'c'.repeat(64),
    decision,
    reasonCodes: decision === 'ALLOW' ? [] : ['NO_EVIDENCE'],
    summary: 'Test clearance',
    createdAt: 1000n,
    expiresAt: 2000n,
    verdictSchemaVersion: 'TRUSTGATE_CLEARANCE_V2',
    configDigest: CONFIG_DIGEST,
  };
  return { ...record, clearanceDigest: computeClearanceDigest(record) };
}

describe('agent signing boundary', () => {
  it('reconstructs the digest of live StudioNet proof #2', () => {
    const liveProof = {
      ...clearance('ALLOW'),
      requester: '0x523551834b2278e64b38d367c496cb30c0ec57f9',
      requestReference: 'smoke-safe-988aff8aef87',
      configDigest: 'cf07afa9b439bb40181d07395b7c1bf492caa7ddaf82c72e72369f54dceb2f29',
      transactionDigest: '9a88d96e46c4f814d56a1e77681cbc10e4abd9c6e99908fcc88cd5c876d0f054',
      expiresAt: 1_790_282_150n,
    };
    expect(computeClearanceDigest(liveProof)).toBe(
      '227bf8c842de86b705a6723ca6a28548071fe1185ab15a25df7c33322725c009',
    );
  });

  it('reconstructs the non-empty reason digest of live StudioNet proof #1', () => {
    const liveProof = {
      ...clearance('BLOCK'),
      requester: '0x9cea0b0d0bbe58d561eba9325e1fc8f277f05ac7',
      requestReference: 'smoke-block-36a7e5c20280',
      configDigest: 'cf07afa9b439bb40181d07395b7c1bf492caa7ddaf82c72e72369f54dceb2f29',
      transactionDigest: '0a292dc892f0695a40c72ef5b275622e402ab5bb7fa9d7c853bf26345677b14b',
      reasonCodes: ['UNLIMITED_TOKEN_APPROVAL'],
      expiresAt: 1_790_282_108n,
    };
    expect(computeClearanceDigest(liveProof)).toBe(
      '2f8bfe57c1d759fc173905ba611dc5217b7d97bfa8481406acc37191f55361a8',
    );
  });

  it('reconstructs the nonce-bound transaction digest of live StudioNet proof #2', () => {
    const liveRequest: ClearanceRequest = {
      requestReference: 'smoke-safe-988aff8aef87',
      policyId: 'balanced-v1',
      chainId: 1n,
      transactionNonce: 7n,
      fromAddress: '0x523551834b2278e64b38d367c496cb30c0ec57f9',
      toAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      valueWei: 0n,
      calldata: `0xa9059cbb${'0'.repeat(24)}${'44'.repeat(20)}${1_000_000n.toString(16).padStart(64, '0')}`,
      intent: 'Transfer exactly 1 USDC (1000000 base units) to 0x4444444444444444444444444444444444444444 using the official Ethereum USDC token contract.',
      evidenceUrls: [],
      validForSeconds: 3600n,
    };
    expect(computeTransactionBinding(liveRequest).transactionDigest).toBe(
      '9a88d96e46c4f814d56a1e77681cbc10e4abd9c6e99908fcc88cd5c876d0f054',
    );
  });

  it('forwards an allowed, matching transaction to the signer', async () => {
    const send = vi.fn().mockResolvedValue('0xtx');
    await expect(guardedSend(request, {
      check: async () => clearance('ALLOW'),
      send,
      expectedConfigDigest: CONFIG_DIGEST,
      now: () => 1_500_000,
    })).resolves.toBe('0xtx');
    expect(send).toHaveBeenCalledOnce();
  });

  it('never calls the signer for review or block decisions', async () => {
    const send = vi.fn();
    await expect(guardedSend(request, {
      check: async () => clearance('REVIEW'),
      send,
      expectedConfigDigest: CONFIG_DIGEST,
      now: () => 1_500_000,
    })).rejects.toThrow(/refused to sign: REVIEW/);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['request reference', { requestReference: 'different-reference' }],
    ['policy', { policyId: 'conservative-v1' }],
    ['transaction nonce', { transactionNonce: 8n }],
    ['intent', { intent: 'Send the funds somewhere else.' }],
    ['calldata', { calldata: '0x1234' }],
    ['evidence', { evidenceUrls: ['https://example.org/evidence.json'] }],
  ])('refuses an ALLOW proof when the %s changed', async (_label, changed) => {
    const send = vi.fn();
    const changedRequest = { ...request, ...changed } as ClearanceRequest;
    await expect(guardedSend(changedRequest, {
      check: async () => clearance('ALLOW'),
      send,
      expectedConfigDigest: CONFIG_DIGEST,
      now: () => 1_500_000,
    })).rejects.toThrow(/refused to sign/);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a forged transaction digest even when individual fields match', async () => {
    const send = vi.fn();
    await expect(guardedSend(request, {
      check: async () => ({ ...clearance('ALLOW'), transactionDigest: '0'.repeat(64) }),
      send,
      expectedConfigDigest: CONFIG_DIGEST,
      now: () => 1_500_000,
    })).rejects.toThrow(/transaction digest mismatch/);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a clearance requested by a different wallet', async () => {
    const send = vi.fn();
    await expect(guardedSend(request, {
      check: async () => ({
        ...clearance('ALLOW'),
        requester: '0x9999999999999999999999999999999999999999',
      }),
      send,
      expectedConfigDigest: CONFIG_DIGEST,
      now: () => 1_500_000,
    })).rejects.toThrow(/requester mismatch/);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a clearance from an unexpected contract configuration', async () => {
    const send = vi.fn();
    await expect(guardedSend(request, {
      check: async () => clearance('ALLOW'),
      send,
      expectedConfigDigest: 'b'.repeat(64),
      now: () => 1_500_000,
    })).rejects.toThrow(/configuration mismatch/);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a forged clearance proof digest', async () => {
    const send = vi.fn();
    await expect(guardedSend(request, {
      check: async () => ({ ...clearance('ALLOW'), clearanceDigest: '0'.repeat(64) }),
      send,
      expectedConfigDigest: CONFIG_DIGEST,
      now: () => 1_500_000,
    })).rejects.toThrow(/proof digest mismatch/);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses an unsupported clearance schema', async () => {
    const send = vi.fn();
    await expect(guardedSend(request, {
      check: async () => ({ ...clearance('ALLOW'), verdictSchemaVersion: 'TRUSTGATE_CLEARANCE_V3' }),
      send,
      expectedConfigDigest: CONFIG_DIGEST,
      now: () => 1_500_000,
    })).rejects.toThrow(/unsupported clearance schema/);
    expect(send).not.toHaveBeenCalled();
  });
});
