import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import { getAddress } from 'viem';
import {
  STUDIONET_CONTRACT_ADDRESS,
  STUDIONET_RPC_URL,
} from '../lib/public-config.js';

const chain = {
  ...studionet,
  rpcUrls: { default: { http: [STUDIONET_RPC_URL] } },
} as const;

const readClient = createClient({ chain });

function recordFrom(value: unknown, label: string): Record<string, unknown> {
  if (value instanceof Map) return Object.fromEntries(value.entries());
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(`GenLayer returned an invalid ${label}.`);
}

function stringFrom(value: unknown, label: string) {
  if (typeof value !== 'string') throw new Error(`GenLayer returned an invalid ${label}.`);
  return value;
}

function decimalFrom(value: unknown, label: string) {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return value;
  throw new Error(`GenLayer returned an invalid ${label}.`);
}

function jsonFrom(value: unknown, label: string) {
  const raw = stringFrom(value, label);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`GenLayer returned invalid JSON for ${label}.`);
  }
}

export async function readContractInfo() {
  const value = await readClient.readContract({
    address: getAddress(STUDIONET_CONTRACT_ADDRESS),
    args: [],
    functionName: 'get_contract_info',
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  });
  const record = recordFrom(value, 'contract information');
  return {
    contractVersion: stringFrom(record.contract_version, 'contract version'),
    policyCount: decimalFrom(record.policy_count, 'policy count'),
    clearanceCount: decimalFrom(record.clearance_count, 'clearance count'),
    configDigest: stringFrom(record.config_digest, 'config digest'),
  };
}

export async function readClearance(clearanceId: bigint) {
  const value = await readClient.readContract({
    address: getAddress(STUDIONET_CONTRACT_ADDRESS),
    args: [clearanceId],
    functionName: 'get_clearance',
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  });
  const record = recordFrom(value, 'clearance');
  return {
    clearanceId: decimalFrom(record.clearance_id, 'clearance ID'),
    requestReference: stringFrom(record.request_reference, 'request reference'),
    requester: stringFrom(record.requester, 'requester'),
    policyId: stringFrom(record.policy_id, 'policy ID'),
    chainId: decimalFrom(record.chain_id, 'chain ID'),
    transactionNonce: decimalFrom(record.transaction_nonce, 'transaction nonce'),
    fromAddress: stringFrom(record.from_address, 'from address'),
    toAddress: stringFrom(record.to_address, 'to address'),
    valueWei: decimalFrom(record.value_wei, 'value'),
    calldataHash: stringFrom(record.calldata_hash, 'calldata hash'),
    transactionDigest: stringFrom(record.transaction_digest, 'transaction digest'),
    actionKind: stringFrom(record.action_kind, 'action kind'),
    intent: stringFrom(record.intent, 'intent'),
    evidenceUrls: jsonFrom(record.evidence_urls_json, 'evidence URLs'),
    evidenceDigest: stringFrom(record.evidence_digest, 'evidence digest'),
    decision: stringFrom(record.decision, 'decision'),
    reasonCodes: jsonFrom(record.reason_codes_json, 'reason codes'),
    facts: jsonFrom(record.facts_json, 'facts'),
    sourceResults: jsonFrom(record.source_results_json, 'source results'),
    summary: stringFrom(record.summary, 'summary'),
    createdAt: decimalFrom(record.created_at, 'created time'),
    expiresAt: decimalFrom(record.expires_at, 'expiry time'),
    clearanceDigest: stringFrom(record.clearance_digest, 'clearance digest'),
    verdictSchemaVersion: stringFrom(record.verdict_schema_version, 'verdict schema version'),
    configDigest: stringFrom(record.config_digest, 'configuration digest'),
  };
}
