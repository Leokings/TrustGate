import type { LocalPreflight, PolicyId } from '../types';

const MAX_UINT256 = (1n << 256n) - 1n;
const UNLIMITED_THRESHOLD = 1n << 255n;

type LocalPolicy = {
  id: PolicyId;
  name: string;
  maxNativeValueWei: bigint;
  blockUnlimitedApprovals: boolean;
  description: string;
};

export const POLICIES: LocalPolicy[] = [
  {
    id: 'conservative-v1',
    name: 'Conservative',
    maxNativeValueWei: 10n ** 18n,
    blockUnlimitedApprovals: true,
    description: 'Strict evidence, control disclosure, and a 1-token native-value ceiling.',
  },
  {
    id: 'balanced-v1',
    name: 'Balanced',
    maxNativeValueWei: 10n * 10n ** 18n,
    blockUnlimitedApprovals: true,
    description: 'Verified identity and source with a 10-token native-value ceiling.',
  },
  {
    id: 'experimental-v1',
    name: 'Experimental',
    maxNativeValueWei: MAX_UINT256,
    blockUnlimitedApprovals: true,
    description: 'No native-value ceiling, while critical conflicts and broad approvals still block.',
  },
];

const reasonText: Record<string, string> = {
  VALUE_LIMIT_EXCEEDED: 'Native value exceeds the selected policy limit.',
  UNLIMITED_TOKEN_APPROVAL: 'The transaction grants an effectively unlimited token allowance.',
  OPERATOR_APPROVAL: 'The transaction grants operator access to every asset in a collection.',
  MALFORMED_CALLDATA: 'The transaction data is too short for the detected method.',
  NO_EVIDENCE: 'No public evidence was supplied for validator review.',
  READY_FOR_CONSENSUS: 'No deterministic blocker found. GenLayer evidence consensus is still required.',
};

export function isEvmAddress(value: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value);
}

export function normalizeCalldata(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^0x(?:[0-9a-f]{2})*$/.test(normalized)) {
    throw new Error('Transaction data must be an even-length hexadecimal value beginning with 0x.');
  }
  if (normalized.length > 8194) {
    throw new Error('Transaction data exceeds the 4,096-byte clearance limit.');
  }
  return normalized;
}

export function getPolicy(policyId: PolicyId) {
  return POLICIES.find((policy) => policy.id === policyId) ?? POLICIES[1];
}

export function explainReason(code: string) {
  return reasonText[code] ?? code.toLowerCase().replaceAll('_', ' ');
}

export function analyzeLocally(input: {
  policyId: PolicyId;
  valueWei: bigint;
  calldata: string;
  hasEvidence: boolean;
}): LocalPreflight {
  const policy = getPolicy(input.policyId);
  const calldata = normalizeCalldata(input.calldata);
  const reasons: string[] = [];
  let actionKind = 'CUSTOM_CALL';

  if (input.valueWei > policy.maxNativeValueWei) reasons.push('VALUE_LIMIT_EXCEEDED');

  if (calldata === '0x') {
    actionKind = 'NATIVE_TRANSFER';
  } else {
    const selector = calldata.slice(0, 10);
    if (selector === '0xa9059cbb') {
      actionKind = 'ERC20_TRANSFER';
      if (calldata.length < 138) reasons.push('MALFORMED_CALLDATA');
    } else if (selector === '0x23b872dd') {
      actionKind = 'ERC20_TRANSFER_FROM';
      if (calldata.length < 202) reasons.push('MALFORMED_CALLDATA');
    } else if (selector === '0x095ea7b3') {
      actionKind = 'ERC20_APPROVE';
      if (calldata.length < 138) {
        reasons.push('MALFORMED_CALLDATA');
      } else if (policy.blockUnlimitedApprovals) {
        const amount = BigInt(`0x${calldata.slice(74, 138)}`);
        if (amount >= UNLIMITED_THRESHOLD) reasons.push('UNLIMITED_TOKEN_APPROVAL');
      }
    } else if (selector === '0xa22cb465') {
      actionKind = 'ERC721_OR_ERC1155_SET_APPROVAL_FOR_ALL';
      if (calldata.length < 138) {
        reasons.push('MALFORMED_CALLDATA');
      } else if (policy.blockUnlimitedApprovals) {
        const enabled = BigInt(`0x${calldata.slice(74, 138)}`);
        if (enabled !== 0n) reasons.push('OPERATOR_APPROVAL');
      }
    }
  }

  if (reasons.length > 0) {
    return {
      decision: 'BLOCK',
      actionKind,
      reasonCodes: [...new Set(reasons)].sort(),
      summary: explainReason(reasons[0]),
    };
  }

  const pendingReason = input.hasEvidence ? 'READY_FOR_CONSENSUS' : 'NO_EVIDENCE';
  return {
    decision: input.hasEvidence ? 'REQUIRES_CONSENSUS' : 'REVIEW',
    actionKind,
    reasonCodes: [pendingReason],
    summary: explainReason(pendingReason),
  };
}
