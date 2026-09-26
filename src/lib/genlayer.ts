import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import {
  TransactionHashVariant,
  TransactionStatus,
  type CalldataEncodable,
  type TransactionHash,
} from 'genlayer-js/types';
import { getAddress, isAddress } from 'viem';
import type { ClearanceRecord, ClearanceRequest } from '../types';
import { contractAddress, explorerUrl } from './runtime-config';

const defaultRpcUrl = 'https://studio.genlayer.com/api';
const rpcUrl = import.meta.env.VITE_GENLAYER_RPC_URL?.trim() || defaultRpcUrl;
const chain = {
  ...studionet,
  rpcUrls: { default: { http: [rpcUrl] } },
} as const;

const readClient = createClient({ chain });
const finalityWait = Object.freeze({
  interval: 3_000,
  retries: 1_200,
  status: TransactionStatus.FINALIZED,
});

type ClientConfig = NonNullable<Parameters<typeof createClient>[0]>;
type WalletProvider = NonNullable<ClientConfig['provider']>;
type ProviderRequest = { method: string; params?: unknown[] };
type InjectedProvider = WalletProvider & {
  request(args: ProviderRequest): Promise<unknown>;
};

function injectedProvider() {
  const candidate = (window as Window & { ethereum?: InjectedProvider }).ethereum;
  if (!candidate || typeof candidate.request !== 'function') {
    throw new Error('Install or open an EIP-1193 wallet to submit a GenLayer clearance.');
  }
  return candidate;
}

async function ensureStudionet(provider: InjectedProvider) {
  const chainId = `0x${chain.id.toString(16)}`;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? Number((error as { code?: unknown }).code)
      : 0;
    if (code !== 4_902) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        blockExplorerUrls: chain.blockExplorers?.default ? [chain.blockExplorers.default.url] : undefined,
        chainId,
        chainName: chain.name,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: [rpcUrl],
      }],
    });
  }
}

function asTransactionHash(value: unknown): TransactionHash {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error('GenLayer did not return a valid transaction ID.');
  }
  return value as TransactionHash;
}

function recordFrom(value: unknown, label: string): Record<string, unknown> {
  if (value instanceof Map) return Object.fromEntries(value.entries());
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(`GenLayer returned an invalid ${label}.`);
}

function textFrom(value: unknown, label: string) {
  if (typeof value !== 'string') throw new Error(`GenLayer returned an invalid ${label}.`);
  return value;
}

function bigintFrom(value: unknown, label: string) {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
    if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  } catch {
    // Fall through to the stable application error below.
  }
  throw new Error(`GenLayer returned an invalid ${label}.`);
}

function jsonStringArray(value: unknown, label: string) {
  const text = textFrom(value, label);
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error(`GenLayer returned an invalid ${label}.`);
  }
  return parsed as string[];
}

function parseClearance(value: unknown): ClearanceRecord {
  const record = recordFrom(value, 'clearance record');
  const decision = textFrom(record.decision, 'clearance decision');
  if (decision !== 'ALLOW' && decision !== 'REVIEW' && decision !== 'BLOCK') {
    throw new Error('GenLayer returned an unknown clearance decision.');
  }
  return {
    clearanceId: bigintFrom(record.clearance_id, 'clearance ID'),
    requestReference: textFrom(record.request_reference, 'request reference'),
    requester: String(record.requester ?? ''),
    policyId: textFrom(record.policy_id, 'policy ID'),
    chainId: bigintFrom(record.chain_id, 'chain ID'),
    transactionNonce: bigintFrom(record.transaction_nonce, 'transaction nonce'),
    fromAddress: textFrom(record.from_address, 'from address'),
    toAddress: textFrom(record.to_address, 'to address'),
    valueWei: bigintFrom(record.value_wei, 'value'),
    calldataHash: textFrom(record.calldata_hash, 'calldata hash'),
    transactionDigest: textFrom(record.transaction_digest, 'transaction digest'),
    actionKind: textFrom(record.action_kind, 'action kind'),
    intent: textFrom(record.intent, 'intent'),
    evidenceUrls: jsonStringArray(record.evidence_urls_json, 'evidence URLs'),
    evidenceDigest: textFrom(record.evidence_digest, 'evidence digest'),
    decision,
    reasonCodes: jsonStringArray(record.reason_codes_json, 'reason codes'),
    summary: textFrom(record.summary, 'summary'),
    createdAt: bigintFrom(record.created_at, 'created time'),
    expiresAt: bigintFrom(record.expires_at, 'expiry time'),
    clearanceDigest: textFrom(record.clearance_digest, 'clearance digest'),
    verdictSchemaVersion: textFrom(record.verdict_schema_version, 'verdict schema version'),
    configDigest: textFrom(record.config_digest, 'configuration digest'),
  };
}

export type ContractInfo = {
  contractVersion: string;
  policyCount: bigint;
  clearanceCount: bigint;
  configDigest: string;
};

export async function getContractInfo(): Promise<ContractInfo> {
  if (!contractAddress) throw new Error('TrustGate contract address is not configured.');
  const value = await readClient.readContract({
    address: getAddress(contractAddress),
    args: [],
    functionName: 'get_contract_info',
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  });
  const record = recordFrom(value, 'contract information');
  return {
    contractVersion: textFrom(record.contract_version, 'contract version'),
    policyCount: bigintFrom(record.policy_count, 'policy count'),
    clearanceCount: bigintFrom(record.clearance_count, 'clearance count'),
    configDigest: textFrom(record.config_digest, 'config digest'),
  };
}

async function waitForFinalized(hash: TransactionHash) {
  await readClient.waitForTransactionReceipt({ hash, ...finalityWait });
  const transaction = await readClient.getTransaction({ hash });
  if (transaction.statusName !== TransactionStatus.FINALIZED) {
    throw new Error('The clearance did not reach GenLayer finality.');
  }
  if (transaction.txExecutionResultName && transaction.txExecutionResultName !== 'FINISHED_WITH_RETURN') {
    throw new Error(`The finalized clearance failed: ${transaction.txExecutionResultName}.`);
  }
}

export async function connectWallet() {
  const provider = injectedProvider();
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || !isAddress(accounts[0])) {
    throw new Error('The wallet did not expose a valid account.');
  }
  await ensureStudionet(provider);
  return getAddress(accounts[0]);
}

export async function requestClearance(
  account: string,
  request: ClearanceRequest,
  onSubmitted?: (hash: TransactionHash) => void,
) {
  if (!contractAddress) throw new Error('TrustGate contract address is not configured.');
  const provider = injectedProvider();
  await ensureStudionet(provider);
  const client = createClient({ account: getAddress(account), chain, provider });
  const args: CalldataEncodable[] = [
    request.requestReference,
    request.policyId,
    request.chainId,
    request.transactionNonce,
    request.fromAddress,
    request.toAddress,
    request.valueWei,
    request.calldata,
    request.intent,
    JSON.stringify(request.evidenceUrls),
    request.validForSeconds,
  ];
  const hash = asTransactionHash(await client.writeContract({
    address: getAddress(contractAddress),
    args,
    functionName: 'request_clearance',
    leaderOnly: false,
    value: 0n,
  }));
  onSubmitted?.(hash);
  await waitForFinalized(hash);
  const clearance = await readClient.readContract({
    address: getAddress(contractAddress),
    args: [account.toLowerCase(), request.requestReference],
    functionName: 'get_clearance_by_reference',
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  });
  return { hash, clearance: parseClearance(clearance) };
}
