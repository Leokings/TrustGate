# TrustGate submission evidence

TrustGate is a non-custodial transaction-clearance layer. A human or AI agent
submits an exact unsigned transaction; deterministic hazards stop immediately,
ambiguous evidence goes to GenLayer validators, and an expiring verdict is
stored on-chain before the target transaction is signed.

## Live release

- App: https://trustgate-lime.vercel.app
- Health: https://trustgate-lime.vercel.app/api/health
- Proof #2: https://trustgate-lime.vercel.app/api/proof?id=2
- OpenAPI: https://trustgate-lime.vercel.app/api/openapi
- Contract: `0xB57fE57B3c4EECd29b8544EB54e15B8368cF253D`
- Network: GenLayer StudioNet (`61999`)
- Vercel deployment: `dpl_AgsYp82KyGMdYtMfJY9cn5WhNVGx`

## What it does now

- Accepts one exact unsigned EVM transaction in the dashboard or agent API.
- Connects an injected wallet and submits a gasless StudioNet clearance write.
- Recognizes native transfers, ERC-20 transfer/transferFrom/approve, NFT
  operator approval, and custom calldata.
- Blocks excessive value, unlimited approvals, operator approvals, and
  malformed recognized calldata without an AI call.
- Applies Conservative, Balanced, or Experimental policy rules.
- Fetches up to three stable public HTTPS sources and asks validators for seven
  structured, source-cited facts.
- Stores `ALLOW`, `REVIEW`, or `BLOCK` with an expiry and digests bound to the
  requester, policy, target chain, EVM account nonce, sender, destination,
  value, calldata, intent, evidence, and contract configuration.
- Exposes public health, preflight, proof-read, and OpenAPI endpoints.
- Provides a fail-closed agent guard that verifies the finalized proof before
  calling a signer.
- Supports custom-policy create/deactivate methods directly on the contract.

## What it does not do

- It does not broadcast the target Ethereum/EVM transaction or move assets.
- It does not automatically intercept wallet signatures.
- It is not an audited mainnet enforcement product or a safety guarantee.
- Vercel does not keep a signing key or perform consensus writes by API call;
  the `fromAddress` wallet signs directly on GenLayer.
- There are no API keys, user accounts, billing, private history database, or
  distributed application rate limiter.
- It is not a general wallet, URL, or token-reputation scanner. Batch scans,
  community flags, PNG exports, and a history dashboard are absent.
- The dashboard exposes built-in policies only; custom-policy management is a
  contract-level feature.
- `ALLOW` remains advisory unless a protected signer or smart account requires
  it.

## Audit fixes in v0.4.0

- Bound every proof to the target EVM account nonce to prevent reuse for a
  later nonce.
- Bound the on-chain requester to `fromAddress`.
- Added verdict-schema, pinned-configuration, transaction-digest, and
  clearance-digest verification at the agent signing boundary.
- Made runtime request validation match the published OpenAPI schema.
- Corrected contrast, ARIA semantics, wallet-switch state, evidence validation,
  test commands, and API descriptions.
- Made wallet connection failures visible without scrolling and fixed reliable
  muted autoplay for the Remotion explainer while preserving reduced motion.

See [AUDIT.md](./AUDIT.md) for the finding table.

## Test evidence

- GenVM lint/schema: passed, 11 methods.
- GenVM type check: 0 errors, 0 warnings.
- Direct contract tests: 29 passed.
- Web/API/agent tests: 39 passed.
- Five-validator GLSim tests: 3 passed.
- Live StudioNet tests: 2 passed.
- Dependency audit: 0 vulnerabilities.
- Production verifier: passed.
- axe WCAG A/AA: 0 violations.
- Browser errors and console messages: none.
- Mobile horizontal overflow: none at 390 × 844.
- UI controls and validation states: passed within app-owned scope.
- Remotion: moving loop with normal motion; complete static frame with reduced
  motion.
- Vercel error logs: none found.

### Public transactions

| Scenario | Clearance | Decision | Transaction |
| --- | ---: | --- | --- |
| Unlimited ERC-20 approval | 1 | BLOCK | `0x70dc3577e83d50cf0a7efb33c31cc4bc03a6995cc103f8638ee370c7e697a628` |
| Evidence-backed USDC transfer | 2 | ALLOW | `0x959e242bf2c5ce24412a9290780e8d85e6b45d99559fb0a31495402912d90a4c` |

### Screenshots

- [Desktop landing page](./evidence/production-home-v0.4.0.png)
- [Desktop deterministic BLOCK](./evidence/production-block-v0.4.0.png)
- [Desktop transfer ready for validators](./evidence/production-consensus-ready-v0.4.0.png)
- [Mobile landing page](./evidence/production-mobile-home-v0.4.0.png)
- [Mobile BLOCK verdict](./evidence/production-mobile-block-v0.4.0.png)
- [Mobile agent API](./evidence/production-mobile-api-v0.4.0.png)
- [Desktop wallet-error state](./evidence/production-wallet-alert-v0.4.0.png)
- [Mobile wallet-error state](./evidence/production-mobile-wallet-alert-v0.4.0.png)
- [UI control matrix](./evidence/ui-control-matrix-v0.4.0.json)
- [Motion and reduced-motion samples](./evidence/motion-check-v0.4.0.json)
- [Machine-readable browser audit](./evidence/browser-audit-v0.4.0.json)

## Reviewer reproduction

```powershell
npm install
npm run verify
npm audit --omit=dev
npm run verify:production
```

Optional gasless StudioNet writes:

```powershell
npm run contract:test:studionet
```

The live command creates new public clearance records and is therefore kept
outside the normal verification command.
