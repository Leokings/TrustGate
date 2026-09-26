# Security model

TrustGate is testnet software. Do not use it to protect material funds without independent review and an audited enforcement layer.

## Fail-closed behavior

- Missing evidence returns `REVIEW`.
- Unavailable evidence returns `REVIEW`.
- Partial or truncated evidence adds a review condition.
- Malformed LLM output or invented quotations rejects execution and forces validator rotation.
- Transient upstream failures do not write a clearance.
- A reference cannot be reused by the same requester.
- The on-chain requester must equal the transaction's claimed `from` address.
- The target-chain account nonce is part of the transaction digest.
- Every clearance expires.

## Prompt-injection boundary

Retrieved pages are untrusted evidence. The prompt tells validators never to follow instructions found in those pages. A supported or contradicted fact must contain an exact quotation found in a retrieved source. The LLM cannot directly choose the final verdict; deterministic contract logic derives it from validated fact statuses.

## URL restrictions

Evidence URLs must:

- use HTTPS;
- resolve through a public hostname rather than an IP address or reserved local suffix;
- omit credentials, fragments, and query strings;
- be unique; and
- stay within count and response-size limits.

These constraints reduce server-side request forgery, unstable responses, and prompt-budget abuse. Production source adapters should become more specific rather than relaxing these rules globally.

## Signing boundary

An agent instruction such as “always check TrustGate” is not a security boundary. The signing key must sit behind code that independently checks:

- finalized `ALLOW` decision;
- expiry;
- chain ID and target-chain account nonce;
- sender and destination;
- native value;
- calldata hash;
- policy and configuration digest; and
- clearance signature or on-chain provenance.

The generic wrapper independently checks the on-chain requester, request reference, policy, chain, account nonce, sender, destination, value, calldata hash, reconstructed transaction digest, normalized intent, evidence set, verdict schema, pinned configuration digest, reconstructed clearance digest, verdict, and expiry before calling the configured signer. A production wallet adapter must keep the signing key outside the agent process and expose signing only through this guard.

## Reporting

Do not include private keys, recovery phrases, private transaction intent, or paid API credentials in an issue or evidence URL. Evidence and submitted intent should be treated as public.
