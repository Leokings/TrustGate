# TrustGate product and security audit — 2026-09-24

Audited release: frontend/API `0.4.0`, Intelligent Contract `0.3.0`, verdict
schema `TRUSTGATE_CLEARANCE_V2`.

- App: https://trustgate-lime.vercel.app
- Vercel deployment: `dpl_AgsYp82KyGMdYtMfJY9cn5WhNVGx`
- Contract: `0xB57fE57B3c4EECd29b8544EB54e15B8368cF253D`

## Outcome

No open critical, high, or medium implementation finding remains in the
audited scope. Product limitations are listed below and must not be marketed
as implemented features.

## Findings fixed

| Severity | Finding | Fix and evidence |
| --- | --- | --- |
| High | A caller could claim another wallet as `fromAddress`. | The contract rejects `requester != fromAddress`; the agent guard repeats the check. Direct and SDK regressions pass. |
| High | A clearance did not bind the target EVM account nonce, so an ALLOW could be replayed for another transaction with otherwise identical fields. | Contract v0.3.0 adds `transaction_nonce` to the stored record, evaluator context, and transaction digest. The UI, API, OpenAPI, and agent guard require it. Direct tests prove nonce changes alter the digest; the SDK refuses nonce changes. |
| High | The agent guard did not pin contract configuration or reconstruct the clearance digest. | The proof API exposes schema/config fields; the guard enforces schema V2, a caller-pinned configuration digest, and the reconstructed on-chain proof digest. Live proof fixtures confirm parity. |
| Medium | The API's OpenAPI schema disallowed unknown fields, but the runtime ignored them. | Production now returns HTTP 400 for unknown fields; a regression test covers it. |
| Medium | Browser evidence validation was looser than the contract. | Browser/API and contract now share HTTPS, public-host, stable-path, uniqueness, and source-count constraints. |
| Medium | Wallet account changes could leave another account's result visible. | Account changes now replace the sender and clear stale results. |
| Accessibility | Selected-policy text was below WCAG AA contrast and two labels used invalid ARIA. | Color and semantics were corrected. Production axe reports 0 WCAG A/AA violations. |
| UX | A failed wallet connection was reported only inside the transaction form and could be off-screen. | A fixed, dismissible wallet alert now keeps the actionable error visible on desktop and mobile. |
| UX | The Remotion explainer rendered its opening frame but autoplay could wait on a browser audio context. | The silent player now starts muted and is explicitly played; production sampling observes changing frames, while reduced-motion remains static. |
| Documentation | The agent API and test commands overstated or misnamed behavior. | Documentation now separates stateless HTTP preflight/proof reads from wallet-signed GenLayer consensus writes and uses executable commands. |

## Verification

| Check | Result |
| --- | --- |
| GenVM lint / schema validation | Passed; 11 methods |
| GenVM type check | 0 errors, 0 warnings |
| Direct contract suite | 29 passed |
| Web, API, and agent suite | 39 passed |
| Five-validator GLSim suite | 3 passed |
| Live StudioNet suite | 2 passed |
| Production dependency audit | 0 known vulnerabilities |
| Production verifier | Passed |
| Browser accessibility | 0 axe violations |
| Browser errors / console | None |
| Mobile layout at 390 × 844 | No horizontal overflow |
| UI control matrix | Passed; external wallet approval window is the documented automation boundary |
| Remotion behavior | Animated with normal motion; static complete frame with reduced motion |
| Browser timings | TTFB 97.8 ms; FCP/LCP 1,284 ms; CLS 0.0 |
| Vercel production error logs | None found |

The build reports one size warning for the separately loaded GenLayer wallet
chunk (`108.66 KiB` gzip). The initial application chunk is `68.36 KiB` gzip;
the warning is a performance watch item, not a correctness failure.

## Product boundaries

- This is live gasless StudioNet software, not an audited mainnet safety
  product.
- It clears an exact unsigned transaction; it does not broadcast the target
  EVM transaction, move assets, or intercept arbitrary wallet signatures.
- HTTP supports health, deterministic preflight, proof reads, and OpenAPI. A
  consensus write is signed directly by the wallet named in `fromAddress`.
- There are no API keys, customer accounts, billing, private database, or
  distributed application rate limiter in this zero-cost release.
- It is not a general wallet/URL/token reputation scanner. Batch scans,
  community flags, PNG exports, and a history dashboard are not implemented.
- Custom-policy write methods exist on-chain; the dashboard exposes the three
  built-in policies only.
- `ALLOW` is a policy verdict, not a guarantee. It becomes enforceable only
  when a signer or smart account is configured to require the proof.
- Intent and evidence URLs submitted for consensus are public on-chain data.
