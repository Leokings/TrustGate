# GenLayer Portal submission copy

Prepared for the GenLayer Portal **Project** contribution form on 2026-09-26.

## Identity

- Project name: `TrustGate`
- Primary tag: `AI & Agents`
- Logo: `public/trustgate-logo.png`

## One-line summary

TrustGate clears exact wallet and AI-agent transactions before signing with deterministic checks and verifiable GenLayer consensus proofs.

## Project overview

TrustGate is a non-custodial transaction-clearance layer for people and
agents. Wallets and agents often sign opaque calls without a reusable,
verifiable safety decision. TrustGate binds one exact
unsigned EVM transaction—including chain, sender, destination, account nonce,
value, calldata, intent, policy, evidence and expiry—to an on-chain verdict.

Deterministic hazards such as excessive native value, unlimited ERC-20
approvals, NFT operator approvals and malformed calldata stop immediately.
When evidence requires judgment, the requester wallet sends a gasless write to
a GenLayer Intelligent Contract. Independent validators fetch public sources,
evaluate structured enforcement facts and finalize ALLOW, REVIEW or BLOCK
through Optimistic Democracy and the Equivalence Principle.

Vercel holds no private key. Humans use the dashboard; agents use the
preflight/proof API and a fail-closed signing guard. Two real StudioNet proofs,
full source, tests and audit evidence are public.

## First-time-user path

### Step 1 — Open TrustGate

Visit https://trustgate-lime.vercel.app. No account, API key, paid server or
database is required. The header should show `API + StudioNet live · 2 proofs`.

### Step 2 — Connect a wallet

Select **Connect**. Approve adding or switching to GenLayer StudioNet (chain ID
61999) if the wallet asks. TrustGate is non-custodial; the wallet signs its own
gasless clearance request and no private key is sent to Vercel.

### Step 3 — Describe the exact unsigned transaction

Keep **Balanced** for the default policy. Enter the target EVM chain, current
sender account nonce, destination, native value, calldata and expected outcome.
Add up to three stable public HTTPS evidence links when the decision depends on
real-world facts. The connected wallet supplies the From address.

### Step 4 — Request clearance

Select **Request clearance**. TrustGate decodes the call and runs deterministic
rules first. An obvious hazard returns BLOCK; otherwise approve the gasless
StudioNet request and wait for GenLayer validators to finalize the evidence
decision.

### Step 5 — Verify before signing

Read the ALLOW, REVIEW or BLOCK proof card, including the clearance ID, reason,
expiry and transaction binding. Agents can repeat the check through
`/api/preflight`, read the finalized record through `/api/proof?id=...`, and
use the included fail-closed guard before invoking their signer.

## Expected verification outcome

On load, the header shows `API + StudioNet live · 2 proofs`. The documented
unlimited ERC-20 approval returns `BLOCK / ERC20_APPROVE /
UNLIMITED_TOKEN_APPROVAL`, matching public proof #1. The evidence-backed USDC
transfer finalized `ALLOW` as proof #2. `/api/health` reports contract v0.3.0,
three policies and two clearances. The repository reproduces 29 direct tests,
39 web/API/agent tests and three five-validator GLSim tests with zero production
dependency vulnerabilities.

## Links

- Website: https://trustgate-lime.vercel.app
- GitHub: https://github.com/Leokings/TrustGate
- Health: https://trustgate-lime.vercel.app/api/health
- OpenAPI: https://trustgate-lime.vercel.app/api/openapi
- BLOCK proof #1: https://trustgate-lime.vercel.app/api/proof?id=1
- ALLOW proof #2: https://trustgate-lime.vercel.app/api/proof?id=2
- StudioNet transaction evidence:
  https://github.com/Leokings/TrustGate/blob/main/docs/SUBMISSION_EVIDENCE.md#public-transactions
- Verification report:
  https://github.com/Leokings/TrustGate/blob/main/docs/VERIFICATION.md

## Existing StudioNet transactions

- Contract deployment:
  `0x8c60379eed5c35ae1ff21c6dd820c8672e23429dd83a4673f0e25ba609225913`
- Deterministic BLOCK proof #1:
  `0x70dc3577e83d50cf0a7efb33c31cc4bc03a6995cc103f8638ee370c7e697a628`
- Evidence-backed ALLOW proof #2:
  `0x959e242bf2c5ce24412a9290780e8d85e6b45d99559fb0a31495402912d90a4c`

## Contract

- Address: `0xB57fE57B3c4EECd29b8544EB54e15B8368cF253D`
- Studio URL candidate:
  `https://studio.genlayer.com/contracts/0xB57fE57B3c4EECd29b8544EB54e15B8368cF253D`
