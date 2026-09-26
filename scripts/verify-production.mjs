import { createHash } from 'node:crypto';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import { getAddress } from 'viem';

const siteUrl = process.env.TRUSTGATE_PRODUCTION_URL || 'https://trustgate-lime.vercel.app';
const contractAddress = getAddress(
  process.env.TRUSTGATE_STUDIONET_ADDRESS || '0xB57fE57B3c4EECd29b8544EB54e15B8368cF253D',
);
const evidenceUrls = [
  'https://raw.githubusercontent.com/circlefin/skills/58ab8648bb1ae9d037a3bf5197ad3bb01262f5b1/plugins/circle/skills/use-usdc/SKILL.md',
  'https://sourcify.dev/server/v2/contract/1/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: 'follow' });
  const body = await response.text();
  assert(response.status === 200, `${url} returned HTTP ${response.status}`);
  return { response, body };
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.text();
  assert(response.status === 200, `${url} returned HTTP ${response.status}: ${body.slice(0, 240)}`);
  return { response, value: JSON.parse(body) };
}

const { response: homeResponse, body: homeBody } = await fetchText(siteUrl);
assert(homeBody.includes('<title>TrustGate'), 'Production HTML is not the TrustGate application.');
assert(homeResponse.headers.get('x-frame-options') === 'DENY', 'X-Frame-Options is missing or incorrect.');
assert(homeResponse.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options is missing or incorrect.');
const csp = homeResponse.headers.get('content-security-policy') || '';
assert(csp.includes("default-src 'self'"), 'Content-Security-Policy is missing.');

const scriptMatch = homeBody.match(/<script[^>]+src="([^"]+\.js)"/u);
assert(scriptMatch, 'Production JavaScript bundle was not found.');
const bundleUrl = new URL(scriptMatch[1], siteUrl).href;
const { body: bundleBody } = await fetchText(bundleUrl);
assert(bundleBody.toLowerCase().includes(contractAddress.toLowerCase()), 'Production bundle has the wrong contract address.');
assert(bundleBody.includes('Clear it before you sign it.'), 'Production bundle does not contain the redesigned interface.');
assert(bundleBody.includes('/api/preflight'), 'Production bundle does not reference the agent API.');
assert(!bundleBody.includes('Load safe demo'), 'Production bundle still contains the removed safe-demo control.');
assert(!bundleBody.includes('Load risky demo'), 'Production bundle still contains the removed risky-demo control.');

const { value: apiHealth } = await fetchJson(new URL('/api/health', siteUrl));
assert(apiHealth.ok === true, 'Production API health is not OK.');
assert(apiHealth.apiVersion === '0.4.0', 'Production API has the wrong version.');
assert(apiHealth.contract?.address?.toLowerCase() === contractAddress.toLowerCase(), 'Production API has the wrong contract.');

const unlimitedApproval = `0x095ea7b3${'0'.repeat(24)}${'44'.repeat(20)}${'f'.repeat(64)}`;
const { value: apiPreflight } = await fetchJson(new URL('/api/preflight', siteUrl), {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    policyId: 'balanced-v1',
    chainId: '1',
    transactionNonce: '7',
    fromAddress: `0x${'22'.repeat(20)}`,
    toAddress: `0x${'33'.repeat(20)}`,
    valueWei: '0',
    calldata: unlimitedApproval,
    intent: 'Approve this spender to use every available token.',
    evidenceUrls: [],
  }),
});
assert(apiPreflight.preflight?.decision === 'BLOCK', 'Production preflight did not block an unlimited approval.');
assert(apiPreflight.preflight?.reasonCodes?.includes('UNLIMITED_TOKEN_APPROVAL'), 'Production preflight omitted its block reason.');
assert(/^[0-9a-f]{64}$/u.test(apiPreflight.binding?.transactionDigest || ''), 'Production preflight returned an invalid binding.');

const { value: apiProof } = await fetchJson(new URL('/api/proof?id=2', siteUrl));
assert(apiProof.clearance?.decision === 'ALLOW', 'Production proof API did not return the finalized ALLOW proof.');
assert(apiProof.clearance?.clearanceId === '2', 'Production proof API returned the wrong proof.');
assert(apiProof.clearance?.transactionNonce === '7', 'Production proof API omitted the nonce binding.');
assert(apiProof.clearance?.verdictSchemaVersion === 'TRUSTGATE_CLEARANCE_V2', 'Production proof API returned the wrong schema.');

const strictSchemaResponse = await fetch(new URL('/api/preflight', siteUrl), {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    chainId: '1',
    transactionNonce: '7',
    fromAddress: `0x${'22'.repeat(20)}`,
    toAddress: `0x${'33'.repeat(20)}`,
    valueWei: '0',
    calldata: '0x',
    intent: 'Send the intended native asset to the destination.',
    unexpected: true,
  }),
});
const strictSchemaBody = await strictSchemaResponse.json();
assert(strictSchemaResponse.status === 400, 'Production preflight accepted an unknown field.');
assert(strictSchemaBody.error === 'INVALID_REQUEST', 'Production preflight returned the wrong schema-validation error.');

const { value: openapi } = await fetchJson(new URL('/api/openapi', siteUrl));
assert(openapi.openapi === '3.1.0', 'Production OpenAPI document is missing or invalid.');
assert(openapi.paths?.['/api/preflight'], 'Production OpenAPI document omits preflight.');

const client = createClient({ chain: studionet });
const contractInfoRaw = await client.readContract({
  address: contractAddress,
  args: [],
  functionName: 'get_contract_info',
  transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
});
const contractInfo = contractInfoRaw instanceof Map
  ? Object.fromEntries(contractInfoRaw.entries())
  : contractInfoRaw;
assert(contractInfo && typeof contractInfo === 'object', 'Contract information has an invalid shape.');
assert(String(contractInfo.contract_version) === '0.3.0', 'Unexpected contract version.');
assert(String(contractInfo.verdict_schema_version) === 'TRUSTGATE_CLEARANCE_V2', 'Unexpected verdict schema.');
assert(BigInt(contractInfo.policy_count) >= 3n, 'Built-in policies are missing.');
assert(apiProof.clearance.configDigest === String(contractInfo.config_digest), 'Proof and contract configuration digests differ.');

const evidence = [];
for (const url of evidenceUrls) {
  const { body } = await fetchText(url);
  evidence.push({
    bytes: Buffer.byteLength(body),
    sha256: createHash('sha256').update(body).digest('hex'),
    url,
  });
}
assert(evidence[0].bytes < 80_000, 'Circle evidence exceeds the contract fetch limit.');
assert(evidence[1].bytes < 80_000, 'Sourcify evidence exceeds the contract fetch limit.');
assert(evidence[0].sha256.length === 64 && evidence[1].sha256.length === 64, 'Evidence hashing failed.');

const sourcify = JSON.parse((await fetchText(evidenceUrls[1])).body);
assert(sourcify.address?.toLowerCase() === '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 'Sourcify returned the wrong contract.');
assert(sourcify.match === 'match', 'Sourcify does not report a verified bytecode match.');

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  contract: {
    address: contractAddress,
    clearanceCount: String(contractInfo.clearance_count),
    configDigest: String(contractInfo.config_digest),
    policyCount: String(contractInfo.policy_count),
    version: String(contractInfo.contract_version),
  },
  evidence,
  production: {
    bundleUrl,
    contentSecurityPolicy: csp,
    demoControlsPresent: false,
    status: homeResponse.status,
    url: siteUrl,
    xContentTypeOptions: homeResponse.headers.get('x-content-type-options'),
    xFrameOptions: homeResponse.headers.get('x-frame-options'),
  },
  api: {
    health: apiHealth.ok,
    version: apiHealth.apiVersion,
    clearanceCount: apiHealth.contract.clearanceCount,
    unlimitedApprovalDecision: apiPreflight.preflight.decision,
    proofTwoDecision: apiProof.clearance.decision,
    proofTwoNonce: apiProof.clearance.transactionNonce,
    strictSchemaStatus: strictSchemaResponse.status,
    openapi: openapi.openapi,
  },
}, null, 2));
