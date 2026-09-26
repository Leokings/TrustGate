# Agent SDK boundary

`agent-tool.ts` is framework-neutral. It exports:

- `trustGateToolDefinition` for MCP/function-tool adapters;
- `guardedSend()` for placing a finalized clearance in front of a signer; and
- dependency types that let an application supply its own GenLayer client and wallet.

The deployed HTTP API is complementary: `/api/preflight` validates and binds a
request, while `/api/proof?id=…` reads finalized results. It deliberately does
not hold a private key or submit consensus writes for the agent.

An agent should have permission to propose a transaction and call the TrustGate tool. It should not have direct permission to export or use the signing key.

```ts
const receipt = await guardedSend(request, {
  check: (request) => trustgate.requestAndWait(request),
  send: (request, clearance) => wallet.sendAfterVerification(request, clearance),
  expectedConfigDigest: '99ccbe96c2335385962e07dc80af92c672bde119d15b6b583f8896420afa7e10',
});
```

`REVIEW`, `BLOCK`, expiry, or any mismatch in the requester, request reference,
policy, chain, sender, destination, value, calldata hash, reconstructed transaction
digest, normalized intent, evidence set, verdict schema, configuration digest, or
reconstructed clearance digest throws before `send` is called.
