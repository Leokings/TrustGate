import { keccak256, toBytes, type Hex } from 'viem';
import type { ClearanceRecord, ClearanceRequest } from '../types';

const DIGEST_DOMAIN = 'GENLAYER_TRUSTGATE';
const VERDICT_SCHEMA_VERSION = 'TRUSTGATE_CLEARANCE_V2';

function canonicalText(value: string) {
  return value.trim().split(/\s+/u).join(' ');
}

function canonicalCalldata(value: string): Hex {
  const normalized = value.trim().toLowerCase();
  if (!/^0x(?:[0-9a-f]{2})*$/.test(normalized)) {
    throw new Error('TrustGate refused to sign: invalid transaction calldata.');
  }
  return normalized as Hex;
}

function digest(tag: string, parts: string[]) {
  const framed = [DIGEST_DOMAIN, tag, ...parts]
    .map((part) => `${Array.from(part).length}:${part}`)
    .join('');
  return keccak256(toBytes(framed)).slice(2).toLowerCase();
}

export function computeTransactionBinding(request: ClearanceRequest) {
  const calldata = canonicalCalldata(request.calldata);
  const calldataHash = keccak256(calldata).slice(2).toLowerCase();
  const canonicalIntent = canonicalText(request.intent);
  const transactionDigest = digest('TRANSACTION', [
    request.policyId,
    request.chainId.toString(),
    request.transactionNonce.toString(),
    request.fromAddress.toLowerCase(),
    request.toAddress.toLowerCase(),
    request.valueWei.toString(),
    calldataHash,
    canonicalIntent,
  ]);
  return { calldata, calldataHash, canonicalIntent, transactionDigest };
}

export function computeClearanceDigest(
  clearance: Omit<ClearanceRecord, 'clearanceDigest'> | ClearanceRecord,
) {
  const referenceKey = digest('REFERENCE', [
    clearance.requester.toLowerCase(),
    clearance.requestReference,
  ]);
  return digest('CLEARANCE', [
    clearance.configDigest.toLowerCase(),
    referenceKey,
    clearance.transactionDigest.toLowerCase(),
    clearance.decision,
    JSON.stringify(clearance.reasonCodes),
    clearance.expiresAt.toString(),
  ]);
}

export const trustGateToolDefinition = {
  name: 'trustgate_check_transaction',
  description: 'Obtain a finalized, policy-bound clearance before asking a wallet to sign a transaction.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['policyId', 'chainId', 'transactionNonce', 'fromAddress', 'toAddress', 'valueWei', 'calldata', 'intent'],
    properties: {
      policyId: { type: 'string' },
      chainId: { type: 'string', description: 'Decimal EVM chain ID.' },
      transactionNonce: { type: 'string', description: 'Decimal EVM account nonce for replay binding.' },
      fromAddress: { type: 'string' },
      toAddress: { type: 'string' },
      valueWei: { type: 'string', description: 'Decimal native value in wei.' },
      calldata: { type: 'string', description: 'Hex transaction data beginning with 0x.' },
      intent: { type: 'string', description: 'Plain-English description of the intended action.' },
      evidenceUrls: { type: 'array', items: { type: 'string', format: 'uri' }, maxItems: 3 },
    },
  },
} as const;

export type AgentGuardDependencies<TReceipt> = {
  check(request: ClearanceRequest): Promise<ClearanceRecord>;
  send(request: ClearanceRequest, clearance: ClearanceRecord): Promise<TReceipt>;
  expectedConfigDigest: string;
  now?: () => number;
};

/**
 * Fail-closed signing boundary for autonomous agents. The agent can propose a
 * transaction, but the protected signer receives it only after a matching,
 * unexpired ALLOW clearance has finalized.
 */
export async function guardedSend<TReceipt>(
  request: ClearanceRequest,
  dependencies: AgentGuardDependencies<TReceipt>,
) {
  const clearance = await dependencies.check(request);
  const now = BigInt(Math.floor((dependencies.now?.() ?? Date.now()) / 1000));
  const binding = computeTransactionBinding(request);

  if (clearance.decision !== 'ALLOW') {
    throw new Error(`TrustGate refused to sign: ${clearance.decision} (${clearance.reasonCodes.join(', ')})`);
  }
  if (clearance.expiresAt <= now) {
    throw new Error('TrustGate refused to sign: the clearance has expired.');
  }
  if (clearance.verdictSchemaVersion !== VERDICT_SCHEMA_VERSION) {
    throw new Error('TrustGate refused to sign: unsupported clearance schema.');
  }
  if (!/^[0-9a-f]{64}$/i.test(dependencies.expectedConfigDigest)
      || clearance.configDigest.toLowerCase() !== dependencies.expectedConfigDigest.toLowerCase()) {
    throw new Error('TrustGate refused to sign: clearance configuration mismatch.');
  }
  if (clearance.requester.toLowerCase() !== request.fromAddress.toLowerCase()) {
    throw new Error('TrustGate refused to sign: clearance requester mismatch.');
  }
  if (clearance.fromAddress.toLowerCase() !== request.fromAddress.toLowerCase()) {
    throw new Error('TrustGate refused to sign: clearance sender mismatch.');
  }
  if (clearance.toAddress.toLowerCase() !== request.toAddress.toLowerCase()) {
    throw new Error('TrustGate refused to sign: clearance destination mismatch.');
  }
  if (clearance.chainId !== request.chainId
      || clearance.transactionNonce !== request.transactionNonce
      || clearance.valueWei !== request.valueWei) {
    throw new Error('TrustGate refused to sign: clearance transaction parameters changed.');
  }
  if (clearance.requestReference !== request.requestReference) {
    throw new Error('TrustGate refused to sign: clearance request reference mismatch.');
  }
  if (clearance.policyId !== request.policyId) {
    throw new Error('TrustGate refused to sign: clearance policy mismatch.');
  }
  if (canonicalText(clearance.intent) !== binding.canonicalIntent) {
    throw new Error('TrustGate refused to sign: clearance intent mismatch.');
  }
  if (clearance.calldataHash.toLowerCase() !== binding.calldataHash) {
    throw new Error('TrustGate refused to sign: clearance calldata mismatch.');
  }
  if (clearance.transactionDigest.toLowerCase() !== binding.transactionDigest) {
    throw new Error('TrustGate refused to sign: clearance transaction digest mismatch.');
  }
  if (clearance.clearanceDigest.toLowerCase() !== computeClearanceDigest(clearance)) {
    throw new Error('TrustGate refused to sign: clearance proof digest mismatch.');
  }
  const requestEvidence = [...request.evidenceUrls].sort();
  const clearanceEvidence = [...clearance.evidenceUrls].sort();
  if (JSON.stringify(clearanceEvidence) !== JSON.stringify(requestEvidence)) {
    throw new Error('TrustGate refused to sign: clearance evidence mismatch.');
  }

  return dependencies.send(request, clearance);
}
