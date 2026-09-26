export type Decision = 'ALLOW' | 'REVIEW' | 'BLOCK' | 'REQUIRES_CONSENSUS';

export type PolicyId = 'conservative-v1' | 'balanced-v1' | 'experimental-v1' | string;

export type ClearanceRequest = {
  requestReference: string;
  policyId: PolicyId;
  chainId: bigint;
  transactionNonce: bigint;
  fromAddress: string;
  toAddress: string;
  valueWei: bigint;
  calldata: string;
  intent: string;
  evidenceUrls: string[];
  validForSeconds: bigint;
};

export type ClearanceRecord = {
  clearanceId: bigint;
  requestReference: string;
  requester: string;
  policyId: string;
  chainId: bigint;
  transactionNonce: bigint;
  fromAddress: string;
  toAddress: string;
  valueWei: bigint;
  calldataHash: string;
  transactionDigest: string;
  actionKind: string;
  intent: string;
  evidenceUrls: string[];
  evidenceDigest: string;
  decision: Exclude<Decision, 'REQUIRES_CONSENSUS'>;
  reasonCodes: string[];
  summary: string;
  createdAt: bigint;
  expiresAt: bigint;
  clearanceDigest: string;
  verdictSchemaVersion: string;
  configDigest: string;
};

export type LocalPreflight = {
  decision: Decision;
  actionKind: string;
  reasonCodes: string[];
  summary: string;
};
