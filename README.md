# TrustGate

TrustGate is a policy-bound transaction clearance layer for people and autonomous agents. It checks deterministic transaction hazards immediately, sends ambiguous evidence questions through GenLayer consensus, and returns an expiring `ALLOW`, `REVIEW`, or `BLOCK` proof.

Production dashboard: https://trustgate-lime.vercel.app

StudioNet contract: `0xB57fE57B3c4EECd29b8544EB54e15B8368cF253D`

This repository is intentionally serverless and stateless:

```text
Browser wallet -----------------------> GenLayer RPC -> Intelligent Contract
AI agent -> Vercel preflight/proof API ----^             -> public evidence
```

Vercel Functions provide public health, deterministic preflight, proof-read,
and OpenAPI endpoints. They never hold a signing key or submit consensus
transactions. No application database, VPS, or paid AI key is required.

## Deployed capabilities

- Pinned-runner GenLayer Intelligent Contract
- Three built-in policies: Conservative, Balanced, and Experimental
- Deterministic detection for excessive native value, unlimited ERC-20 approvals, NFT operator approvals, and malformed common calldata
- Evidence retrieval from up to three stable public HTTPS sources
- Structured fact extraction with source-bound quotations
- Independent validator reruns comparing only enforcement-critical decision fields
- Fail-closed handling for absent, incomplete, unavailable, or conflicting evidence
- Transaction-, nonce-, policy-, requester-, configuration-, and expiry-bound clearance digests
- On-chain requester-to-sender binding so another wallet cannot mint a clearance for your address
- Production Vercel dashboard connected to the finalized StudioNet contract
- Public `GET /api/health`, `POST /api/preflight`, `GET /api/proof`, and `GET /api/openapi` endpoints
- Remotion-powered transaction-to-proof explainer, loaded as a separate browser chunk
- Live contract-health and finalized-clearance count on page load
- Generic AI-agent tool definition and fail-closed protected-signer wrapper
- Exact agent-side verification of chain/account nonce, policy, intent, calldata hash, transaction digest, evidence, schema, configuration, proof digest, and expiry before signing
- Contract and web unit tests, including explicit validator disagreement checks
- Five-validator GLSim finalization tests for deterministic and evidence-backed decisions

## Local development

Contract requirements are already pinned in `requirements.txt`:

```powershell
python -m pip install -r requirements.txt
```

Install the frontend and run it:

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:5178`. Development defaults to the public StudioNet
deployment. Plain Vite serves the UI and falls back to a direct contract health
read; use `vercel dev` when you also want the local `/api/*` routes.

## Verify everything

```powershell
npm run verify
```

This runs:

1. GenVM lint and SDK validation
2. GenVM type checking
3. Direct-mode contract tests
4. Browser/agent boundary tests
5. A production Vite build

The full consensus path uses two terminals. Start the local five-validator
simulator in the first:

```powershell
npm run contract:sim
```

Then run the integration suite in the second:

```powershell
npm run contract:test:integration
```

## Connect a deployed contract

The production dashboard is already connected to the finalized StudioNet
deployment. To connect another deployment, copy `.env.example` to `.env.local`
and set:

```text
VITE_TRUSTGATE_CONTRACT_ADDRESS=0x...
```

The frontend submits through the connected wallet, waits for GenLayer finality, and reads the stored proof card back from the contract.

For step-by-step browser and automated checks, see [the testing guide](docs/TESTING.md).
For a submission-ready capability matrix, audit findings, public transaction
IDs, and screenshots, see [the submission evidence](docs/SUBMISSION_EVIDENCE.md).
For the latest go/no-go decision and copy-ready entry, see the
[2026-09-26 submission-readiness report](docs/SUBMISSION_READINESS_2026-09-26.md).

## Agent integration

The hosted preflight API validates the request, detects deterministic hazards,
and returns the exact transaction binding:

```ts
const result = await fetch('https://trustgate-lime.vercel.app/api/preflight', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(transaction),
}).then((response) => response.json());

if (result.preflight.decision === 'BLOCK') {
  throw new Error('Signing refused');
}
```

For a consensus decision, the agent signs `request_clearance` directly with its
own GenLayer wallet and later reads the proof through `/api/proof`. The signing
boundary in `src/sdk/agent-tool.ts` independently reconstructs the contract's
transaction digest and verifies the exact request before it invokes a signer.
The transaction's target-chain account nonce is part of that digest, so the
same clearance cannot be reused for a later nonce.
The agent should never receive an unrestricted raw private key.

## Enforcement boundary

TrustGate is a live clearance application on GenLayer StudioNet. It produces finalized, queryable proofs and provides a fail-closed software signing guard. It does not custody funds, intercept arbitrary MetaMask transactions, or claim mainnet smart-account enforcement. On-chain execution enforcement requires a separately audited smart-account module or authenticated cross-chain executor.

See [the architecture](docs/ARCHITECTURE.md) and [security model](SECURITY.md) for details.

## License

TrustGate is available under the [MIT License](LICENSE).
