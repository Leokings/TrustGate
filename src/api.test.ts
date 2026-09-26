import { describe, expect, it } from 'vitest';
import health from '../api/health';
import openapi from '../api/openapi';
import preflight from '../api/preflight';
import proof from '../api/proof';

const sender = '0x2222222222222222222222222222222222222222';
const token = '0x3333333333333333333333333333333333333333';
const spender = '4444444444444444444444444444444444444444';

function approval(amount: bigint) {
  return `0x095ea7b3${'0'.repeat(24)}${spender}${amount.toString(16).padStart(64, '0')}`;
}

function request(body: Record<string, unknown>) {
  return new Request('https://trustgate.test/api/preflight', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('TrustGate HTTP API', () => {
  it('returns a transaction-bound deterministic block', async () => {
    const response = await preflight.fetch(request({
      policyId: 'balanced-v1',
      chainId: '1',
      transactionNonce: '7',
      fromAddress: sender,
      toAddress: token,
      valueWei: '0',
      calldata: approval((1n << 256n) - 1n),
      intent: 'Approve this spender to use every available token.',
      evidenceUrls: [],
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.preflight.decision).toBe('BLOCK');
    expect(payload.preflight.reasonCodes).toContain('UNLIMITED_TOKEN_APPROVAL');
    expect(payload.binding.transactionDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(payload.next).toMatch(/Do not sign/);
  });

  it('returns a consensus-ready result for a finite transfer with evidence', async () => {
    const response = await preflight.fetch(request({
      chainId: '1',
      transactionNonce: '7',
      fromAddress: sender,
      toAddress: token,
      valueWei: '0',
      calldata: '0xa9059cbb' + '0'.repeat(128),
      intent: 'Transfer a finite token amount to the intended recipient.',
      evidenceUrls: ['https://example.com/deployment.json'],
    }));
    const payload = await response.json();

    expect(payload.preflight.decision).toBe('REQUIRES_CONSENSUS');
    expect(payload.request.evidenceUrls).toEqual(['https://example.com/deployment.json']);
    expect(payload.request.validForSeconds).toBe('3600');
  });

  it('fails closed on invalid or private evidence hosts', async () => {
    const response = await preflight.fetch(request({
      chainId: '1',
      transactionNonce: '7',
      fromAddress: sender,
      toAddress: token,
      valueWei: '0',
      calldata: '0x',
      intent: 'Send the intended native asset to the destination.',
      evidenceUrls: ['https://localhost/report'],
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('INVALID_REQUEST');
  });

  it('rejects fields excluded by the published OpenAPI schema', async () => {
    const response = await preflight.fetch(request({
      chainId: '1',
      transactionNonce: '7',
      fromAddress: sender,
      toAddress: token,
      valueWei: '0',
      calldata: '0x',
      intent: 'Send the intended native asset to the destination.',
      unexpected: true,
    }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.message).toBe('Unknown request field: unexpected.');
  });

  it('publishes a usable OpenAPI document', async () => {
    const response = openapi.fetch(new Request('https://trustgate.test/api/openapi'));
    const payload = await response.json();
    expect(payload.openapi).toBe('3.1.0');
    expect(payload.paths['/api/preflight']).toBeTruthy();
    expect(payload.servers[0].url).toBe('https://trustgate.test');
  });

  it('rejects an invalid proof ID without making an RPC call', async () => {
    const response = await proof.fetch(new Request('https://trustgate.test/api/proof?id=zero'));
    expect(response.status).toBe(400);
  });

  it('answers CORS preflight without making an RPC call', async () => {
    const response = await health.fetch(new Request('https://trustgate.test/api/health', { method: 'OPTIONS' }));
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });
});
