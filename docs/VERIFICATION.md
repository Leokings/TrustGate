# TrustGate production verification

Verified **2026-09-24** against the public Vercel release and GenLayer
StudioNet.

## Exact deployed artifacts

- App: https://trustgate-lime.vercel.app
- Frontend/API: `0.4.0`
- Vercel deployment: `dpl_AgsYp82KyGMdYtMfJY9cn5WhNVGx`
- Immutable URL:
  https://trustgate-r00whyv5j-leokings588-5902s-projects.vercel.app
- Contract: `0xB57fE57B3c4EECd29b8544EB54e15B8368cF253D`
- Contract version: `0.3.0`
- Verdict schema: `TRUSTGATE_CLEARANCE_V2`
- StudioNet chain: `61999`
- Contract deployment transaction:
  `0x8c60379eed5c35ae1ff21c6dd820c8672e23429dd83a4673f0e25ba609225913`
- Configuration digest:
  `cf07afa9b439bb40181d07395b7c1bf492caa7ddaf82c72e72369f54dceb2f29`

The deployment finalized successfully with five agreeing validators. Its
published schema exposes eight read methods and three write methods.

## Reproducible checks

| Layer | Command/check | Result |
| --- | --- | --- |
| Contract lint/schema | `npm run contract:lint` | Passed; 11 methods |
| Contract types | `npm run contract:typecheck` | 0 errors, 0 warnings |
| Direct contract tests | `npm run contract:test` | 29 passed |
| Web/API/agent tests | `npm run test:web` | 39 passed |
| Production build | `npm run build` | Passed |
| Five-validator simulation | `npm run contract:test:integration` | 3 passed |
| Live StudioNet writes | `npm run contract:test:studionet` | 2 passed |
| Deployed release | `npm run verify:production` | Passed |
| Production dependencies | `npm audit --omit=dev` | 0 vulnerabilities |
| Accessibility | axe WCAG A/AA | 0 violations |
| Browser | Console and page errors | None |
| Responsive | 390 × 844 | No horizontal overflow |
| UI controls | Browser interaction matrix | Passed within app-owned scope |
| Motion | Normal and reduced-motion modes | Animated loop / static complete frame |
| Vercel runtime | Production error log query | None found |

Browser timings in the final audit session: TTFB `97.8 ms`, FCP/LCP `1,284 ms`,
CLS `0.0`. INP had no qualifying interaction sample.

## Finalized on-chain proofs

| Scenario | ID | Decision | Nonce | StudioNet transaction |
| --- | ---: | --- | ---: | --- |
| Unlimited ERC-20 approval | 1 | BLOCK | 7 | `0x70dc3577e83d50cf0a7efb33c31cc4bc03a6995cc103f8638ee370c7e697a628` |
| Evidence-backed USDC transfer | 2 | ALLOW | 7 | `0x959e242bf2c5ce24412a9290780e8d85e6b45d99559fb0a31495402912d90a4c` |

Proof #1:

- reason: `UNLIMITED_TOKEN_APPROVAL`
- transaction digest:
  `0a292dc892f0695a40c72ef5b275622e402ab5bb7fa9d7c853bf26345677b14b`
- clearance digest:
  `2f8bfe57c1d759fc173905ba611dc5217b7d97bfa8481406acc37191f55361a8`

Proof #2:

- action: `ERC20_TRANSFER`
- transaction digest:
  `9a88d96e46c4f814d56a1e77681cbc10e4abd9c6e99908fcc88cd5c876d0f054`
- clearance digest:
  `227bf8c842de86b705a6723ca6a28548071fe1185ab15a25df7c33322725c009`
- Circle evidence SHA-256:
  `234b616ac688a71a464757c9f77af2973d029ce9c30b49bcf12d87a38d6c7b42`
- Sourcify evidence SHA-256:
  `a3df679f5d5210284bf180d96b910ce995d3eb46c0081e8c8682559e13f13f4f`

## Public API evidence

- [Health and contract state](https://trustgate-lime.vercel.app/api/health)
- [Finalized proof #2](https://trustgate-lime.vercel.app/api/proof?id=2)
- [OpenAPI 3.1 schema](https://trustgate-lime.vercel.app/api/openapi)

The verifier also posts an unlimited approval to `/api/preflight` and requires
`BLOCK / ERC20_APPROVE / UNLIMITED_TOKEN_APPROVAL`. Production separately
returned HTTP 400 for an unknown field, matching `additionalProperties: false`.

## Browser evidence

- [Desktop landing page](./evidence/production-home-v0.4.0.png)
- [Desktop deterministic BLOCK](./evidence/production-block-v0.4.0.png)
- [Desktop transfer ready for consensus](./evidence/production-consensus-ready-v0.4.0.png)
- [Mobile landing page](./evidence/production-mobile-home-v0.4.0.png)
- [Mobile BLOCK verdict](./evidence/production-mobile-block-v0.4.0.png)
- [Mobile agent API](./evidence/production-mobile-api-v0.4.0.png)
- [Desktop wallet-error state](./evidence/production-wallet-alert-v0.4.0.png)
- [Mobile wallet-error state](./evidence/production-mobile-wallet-alert-v0.4.0.png)
- [UI control matrix](./evidence/ui-control-matrix-v0.4.0.json)
- [Motion and reduced-motion samples](./evidence/motion-check-v0.4.0.json)
- [Machine-readable browser audit](./evidence/browser-audit-v0.4.0.json)

The wallet matrix uses a simulated standards-compliant EIP-1193 provider to
verify connect, StudioNet switch/add, account change, and disconnect behavior.
The host cannot automate a user's third-party wallet approval window. Separate
live StudioNet writes above prove the actual SDK/contract path.

## Scope

This evidence proves a real StudioNet clearance workflow and public API. It
does not claim target-chain execution, asset movement, general reputation
scanning, or automatic enforcement over arbitrary wallet transactions.
