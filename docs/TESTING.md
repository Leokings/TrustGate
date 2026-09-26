# Testing TrustGate

- App: https://trustgate-lime.vercel.app
- Contract: `0xB57fE57B3c4EECd29b8544EB54e15B8368cF253D`
- Network: GenLayer StudioNet (`61999`, gasless)

No VPS, database, paid AI key, or GEN purchase is required. Vercel serves the
UI/read API; wallets submit consensus writes directly to GenLayer.

## Browser test

This vector records a clearance only. It does not move USDC.

1. Open the app and connect an injected wallet.
2. Keep **Balanced** selected.
3. Enter target chain `1` and the current Ethereum account nonce for the sender.
4. Set **To** to `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` and native value to `0`.
5. Paste this calldata:

   ```text
   0xa9059cbb000000000000000000000000444444444444444444444444444444444444444400000000000000000000000000000000000000000000000000000000000f4240
   ```

6. Enter this expected outcome:

   ```text
   Transfer exactly 1 USDC (1000000 base units) to 0x4444444444444444444444444444444444444444 using the official Ethereum USDC token contract.
   ```

7. Add these evidence URLs, one per line:

   ```text
   https://raw.githubusercontent.com/circlefin/skills/58ab8648bb1ae9d037a3bf5197ad3bb01262f5b1/plugins/circle/skills/use-usdc/SKILL.md
   https://sourcify.dev/server/v2/contract/1/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
   ```

8. Select **Request clearance**, approve the gasless StudioNet write, and wait
   for finality. `REVIEW` is a valid fail-closed result when evidence is
   incomplete.

## Automated checks

Run all local static, contract, API/SDK, and build checks:

```powershell
npm run verify
```

Verify the live UI, security headers, API, contract state, proof #2, and source
hashes:

```powershell
npm run verify:production
```

Run the five-validator simulator in two terminals:

```powershell
npm run contract:sim
```

```powershell
npm run contract:test:integration
```

Create fresh public proofs with real StudioNet validators:

```powershell
npm run contract:test:studionet
```

Exact deployment IDs, transactions, hashes, counts, and screenshots are in
[VERIFICATION.md](./VERIFICATION.md).
