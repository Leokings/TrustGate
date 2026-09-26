import { normalizeEvidenceUrls } from '../src/lib/evidence.js';
import { analyzeLocally, isEvmAddress, normalizeCalldata } from '../src/lib/preflight.js';
import {
  STUDIONET_CHAIN_ID,
  STUDIONET_CONTRACT_ADDRESS,
  TRUSTGATE_VERSION,
} from '../src/lib/public-config.js';
import { computeTransactionBinding } from '../src/sdk/agent-tool.js';
import type { ClearanceRequest } from '../src/types.js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

const MAX_UINT256 = (1n << 256n) - 1n;
const INPUT_KEYS = new Set([
  'requestReference',
  'policyId',
  'chainId',
  'transactionNonce',
  'fromAddress',
  'toAddress',
  'valueWei',
  'calldata',
  'intent',
  'evidenceUrls',
  'validForSeconds',
]);

type Input = {
  requestReference?: unknown;
  policyId?: unknown;
  chainId?: unknown;
  transactionNonce?: unknown;
  fromAddress?: unknown;
  toAddress?: unknown;
  valueWei?: unknown;
  calldata?: unknown;
  intent?: unknown;
  evidenceUrls?: unknown;
  validForSeconds?: unknown;
};

function identifier(value: unknown) {
  if (value === undefined) return `api-${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/.test(value)) {
    throw new Error('requestReference must use 1-64 letters, numbers, dots, colons, underscores, or hyphens.');
  }
  return value;
}

function decimal(value: unknown, label: string, minimum = 0n, maximum = MAX_UINT256) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(`${label} must be a decimal string.`);
  }
  const parsed = BigInt(value);
  if (parsed < minimum) throw new Error(`${label} is below the allowed minimum.`);
  if (parsed > maximum) throw new Error(`${label} exceeds the uint256 limit.`);
  return parsed;
}

function evidence(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3 || value.some((item) => typeof item !== 'string')) {
    throw new Error('evidenceUrls must contain at most three HTTPS URLs.');
  }
  return normalizeEvidenceUrls(value as string[]);
}

function requestFrom(input: Input): ClearanceRequest {
  const policyId = typeof input.policyId === 'string' ? input.policyId : 'balanced-v1';
  if (!['conservative-v1', 'balanced-v1', 'experimental-v1'].includes(policyId)) {
    throw new Error('policyId must be conservative-v1, balanced-v1, or experimental-v1.');
  }
  if (typeof input.fromAddress !== 'string' || !isEvmAddress(input.fromAddress)) {
    throw new Error('fromAddress must be a valid non-zero EVM address.');
  }
  if (typeof input.toAddress !== 'string' || !isEvmAddress(input.toAddress)) {
    throw new Error('toAddress must be a valid non-zero EVM address.');
  }
  if (typeof input.intent !== 'string') throw new Error('intent is required.');
  const intent = input.intent.trim().split(/\s+/u).join(' ');
  if (intent.length < 8 || intent.length > 600) throw new Error('intent must contain 8-600 characters.');
  const validForSeconds = input.validForSeconds === undefined
    ? 3_600n
    : decimal(input.validForSeconds, 'validForSeconds', 300n, 86_400n);
  if (validForSeconds > 86_400n) throw new Error('validForSeconds cannot exceed 86400.');

  return {
    requestReference: identifier(input.requestReference),
    policyId,
    chainId: decimal(input.chainId, 'chainId', 1n),
    transactionNonce: decimal(input.transactionNonce, 'transactionNonce'),
    fromAddress: input.fromAddress.toLowerCase(),
    toAddress: input.toAddress.toLowerCase(),
    valueWei: decimal(input.valueWei ?? '0', 'valueWei'),
    calldata: normalizeCalldata(typeof input.calldata === 'string' ? input.calldata : '0x'),
    intent,
    evidenceUrls: evidence(input.evidenceUrls),
    validForSeconds,
  };
}

export default {
  async fetch(request: Request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') {
      return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers });
    }
    if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
      return Response.json({ error: 'UNSUPPORTED_MEDIA_TYPE' }, { status: 415, headers });
    }
    const announcedSize = Number(request.headers.get('content-length') || '0');
    if (announcedSize > 32_768) {
      return Response.json({ error: 'PAYLOAD_TOO_LARGE' }, { status: 413, headers });
    }

    try {
      const text = await request.text();
      if (text.length > 32_768) throw new Error('Request body exceeds 32 KiB.');
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Request body must be a JSON object.');
      const unknownKeys = Object.keys(parsed).filter((key) => !INPUT_KEYS.has(key));
      if (unknownKeys.length > 0) {
        throw new Error(`Unknown request field: ${unknownKeys.sort()[0]}.`);
      }
      const clearanceRequest = requestFrom(parsed as Input);
      const preflight = analyzeLocally({
        policyId: clearanceRequest.policyId,
        valueWei: clearanceRequest.valueWei,
        calldata: clearanceRequest.calldata,
        hasEvidence: clearanceRequest.evidenceUrls.length > 0,
      });
      const binding = computeTransactionBinding(clearanceRequest);
      return Response.json({
        ok: true,
        apiVersion: TRUSTGATE_VERSION,
        network: { name: 'GenLayer StudioNet', chainId: STUDIONET_CHAIN_ID },
        contract: STUDIONET_CONTRACT_ADDRESS,
        preflight,
        binding: {
          calldataHash: binding.calldataHash,
          transactionDigest: binding.transactionDigest,
        },
        request: {
          ...clearanceRequest,
          chainId: clearanceRequest.chainId.toString(),
          transactionNonce: clearanceRequest.transactionNonce.toString(),
          valueWei: clearanceRequest.valueWei.toString(),
          validForSeconds: clearanceRequest.validForSeconds.toString(),
        },
        next: preflight.decision === 'BLOCK'
          ? 'Do not sign or submit this transaction.'
          : 'Submit request_clearance directly to the TrustGate contract with the wallet named by fromAddress.',
      }, { headers });
    } catch (error) {
      return Response.json({
        ok: false,
        error: 'INVALID_REQUEST',
        message: error instanceof Error ? error.message : 'The request could not be validated.',
      }, { status: 400, headers });
    }
  },
};
