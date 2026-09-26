# TrustGate architecture

## Consensus boundary

The frontend owns form handling, wallet connection, non-authoritative previews, formatting, and polling. The stateless HTTP API exposes the same deterministic preview plus finalized proof reads. Neither is trusted to decide whether a transaction is safe.

The Intelligent Contract owns:

- policy definitions;
- deterministic transaction checks;
- evidence URL validation and retrieval;
- the validator comparison rule;
- the final decision, reason codes, expiry, and clearance digest; and
- immutable clearance history.

External sources own raw public evidence. Their text is explicitly treated as untrusted data rather than instructions.

## Request flow

```text
1. Human or agent constructs an unsigned transaction, including its target-chain account nonce.
2. Browser, SDK, or `POST /api/preflight` performs the same cheap preflight used by the contract.
3. The same wallet named by the transaction's `from` field submits `request_clearance(...)` to TrustGate.
4. Contract verifies requester = sender, then canonicalizes and hashes the exact transaction, target-chain nonce, and intent.
5. Obvious deterministic violations produce BLOCK without an LLM call.
6. Otherwise, validators independently retrieve up to three public sources.
7. Each validator extracts the same seven stable fact statuses.
8. Contract code derives ALLOW / REVIEW / BLOCK from those statuses.
9. Validators compare the enforcement-critical decision and reason codes. Non-material fact wording/status variance remains visible in the stored evidence record but cannot prevent finality when the enforced outcome is identical.
10. The finalized proof is stored and read through the contract or `GET /api/proof`.
11. A protected signer may execute only an unexpired ALLOW proof.
```

## Why requests are asynchronous

GenLayer consensus and finality do not happen inside one ordinary HTTP request.
The UI or agent signs and submits directly to GenLayer, waits for finality, and
then reads the stored clearance. The hosted API deliberately does not keep a
Vercel Function open during validator work and never stores a requester key.

## Verdict derivation

Deterministic blockers include:

- native value beyond the policy ceiling;
- effectively unlimited ERC-20 allowance;
- collection-wide ERC-721/ERC-1155 operator approval; and
- malformed calldata for recognized functions.

Evidence facts include:

- target identity matches;
- source or bytecode is verified;
- privileged control is disclosed;
- security claims are supported;
- credible abuse reports are present;
- the action matches the stated intent; and
- the custom policy is satisfied.

AI extracts these facts with exact source quotations. Contract code—not the LLM—maps the facts to the final verdict.

## Zero-cost hosting

The production UI is static Vite output on Vercel. Small stateless Vercel
Functions provide health, preflight, proof, and OpenAPI endpoints and scale to
zero. The product calls the hosted GenLayer RPC and uses contract state instead
of an application database. No function possesses a transaction-signing key.

## Later enforcement layer

The present SDK is a software signing boundary. Stronger enforcement can be added in two stages:

1. A managed or embedded wallet exposes only a gated signing API to the agent.
2. A smart-account module queues a transaction and accepts only a finalized clearance bound to its exact digest.

Cross-chain execution remains a separate security boundary because it requires an authenticated relay or bridge and chain-specific executor contracts.
