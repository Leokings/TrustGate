import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { parseUnits } from 'viem';
import { evidenceUrlsFromText } from './lib/evidence';
import {
  POLICIES,
  analyzeLocally,
  explainReason,
  isEvmAddress,
  normalizeCalldata,
} from './lib/preflight';
import {
  contractAddress,
  contractConfigured,
  explorerUrl,
} from './lib/runtime-config';
import type { ClearanceRecord, Decision, LocalPreflight } from './types';

const TrustGatePlayer = lazy(() => import('./components/TrustGatePlayer'));

const API_EXAMPLE = `const result = await fetch("/api/preflight", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(transaction)
}).then((response) => response.json());

if (result.preflight.decision === "BLOCK") {
  throw new Error("Signing refused");
}`;

type FormState = {
  policyId: string;
  chainId: string;
  transactionNonce: string;
  fromAddress: string;
  toAddress: string;
  nativeValue: string;
  calldata: string;
  intent: string;
  evidenceText: string;
};

type DisplayResult = LocalPreflight & {
  mode: 'local' | 'consensus';
  clearance?: ClearanceRecord;
  transactionHash?: string;
};

type NetworkState = 'checking' | 'online' | 'offline' | 'unconfigured';

const initialForm: FormState = {
  policyId: 'balanced-v1',
  chainId: '1',
  transactionNonce: '0',
  fromAddress: '',
  toAddress: '',
  nativeValue: '0',
  calldata: '0x',
  intent: '',
  evidenceText: '',
};

function ShieldMark({ small = false }: { small?: boolean }) {
  return (
    <svg className={small ? 'shield-mark shield-mark--small' : 'shield-mark'} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 4 39 10v12c0 10-6 17.5-15 21-9-3.5-15-11-15-21V10l15-6Z" />
      <path className="shield-mark__check" d="m17.5 23.5 4.4 4.4 9-10" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 5.5h12.5A1.5 1.5 0 0 1 17 7v8H4.5A1.5 1.5 0 0 1 3 13.5v-8Z" />
      <path d="M3.5 5.5v-1A1.5 1.5 0 0 1 5 3h9" />
      <path d="M13.5 9.5H17v3h-3.5a1.5 1.5 0 0 1 0-3Z" />
    </svg>
  );
}

function decisionLabel(decision: Decision) {
  return decision === 'REQUIRES_CONSENSUS' ? 'READY FOR CONSENSUS' : decision;
}

function short(value: string, start = 8, end = 6) {
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function requestReference() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `tg-${Date.now().toString(36)}-${suffix}`;
}

function parseValue(value: string) {
  if (!/^\d+(?:\.\d{0,18})?$/.test(value.trim())) {
    throw new Error('Native value must be a non-negative decimal with no more than 18 decimals.');
  }
  return parseUnits(value.trim(), 18);
}

function PlayerFallback() {
  return (
    <div className="story-fallback" aria-hidden="true">
      <span>Transaction</span><i>→</i><span>Validators</span><i>→</i><strong>Proof</strong>
    </div>
  );
}

export default function App() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [account, setAccount] = useState('');
  const [result, setResult] = useState<DisplayResult | null>(null);
  const [phase, setPhase] = useState('Ready');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [networkState, setNetworkState] = useState<NetworkState>(contractConfigured ? 'checking' : 'unconfigured');
  const [clearanceCount, setClearanceCount] = useState<bigint | null>(null);
  const [apiLive, setApiLive] = useState(false);

  const selectedPolicy = useMemo(
    () => POLICIES.find((policy) => policy.id === form.policyId) ?? POLICIES[1],
    [form.policyId],
  );

  const preview = useMemo(() => {
    try {
      return analyzeLocally({
        policyId: form.policyId,
        valueWei: parseValue(form.nativeValue || '0'),
        calldata: form.calldata || '0x',
        hasEvidence: form.evidenceText.trim().length > 0,
      });
    } catch {
      return null;
    }
  }, [form.policyId, form.nativeValue, form.calldata, form.evidenceText]);

  const hasTransactionInput = Boolean(
    form.fromAddress.trim()
    || form.toAddress.trim()
    || form.intent.trim()
    || form.evidenceText.trim()
    || form.calldata.trim().toLowerCase() !== '0x'
    || form.nativeValue.trim() !== '0'
    || form.transactionNonce.trim() !== '0',
  );
  const visiblePreview = hasTransactionInput ? preview : null;

  useEffect(() => {
    if (!contractConfigured) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12_000);

    async function checkHealth() {
      try {
        const response = await fetch('/api/health', { signal: controller.signal, headers: { Accept: 'application/json' } });
        const payload = await response.json() as { ok?: boolean; contract?: { clearanceCount?: string } };
        if (!response.ok || !payload.ok || !payload.contract?.clearanceCount) throw new Error('API health check failed.');
        if (!cancelled) {
          setClearanceCount(BigInt(payload.contract.clearanceCount));
          setNetworkState('online');
          setApiLive(true);
        }
      } catch {
        try {
          const { getContractInfo } = await import('./lib/genlayer');
          const info = await getContractInfo();
          if (!cancelled) {
            setClearanceCount(info.clearanceCount);
            setNetworkState('online');
            setApiLive(false);
          }
        } catch {
          if (!cancelled) setNetworkState('offline');
        }
      } finally {
        window.clearTimeout(timer);
      }
    }

    void checkHealth();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const provider = (window as Window & {
      ethereum?: {
        on?: (event: string, listener: (accounts: unknown) => void) => void;
        removeListener?: (event: string, listener: (accounts: unknown) => void) => void;
      };
    }).ethereum;
    if (!provider?.on) return;
    const handleAccounts = (accounts: unknown) => {
      const next = Array.isArray(accounts) && typeof accounts[0] === 'string' && isEvmAddress(accounts[0])
        ? accounts[0]
        : '';
      setAccount(next);
      setForm((current) => ({ ...current, fromAddress: next }));
      setResult(null);
      setError('');
      setPhase(next ? 'Wallet account updated' : 'Wallet disconnected');
    };
    provider.on('accountsChanged', handleAccounts);
    return () => provider.removeListener?.('accountsChanged', handleAccounts);
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setResult(null);
    setError('');
    setPhase('Ready');
  }

  async function handleConnect() {
    setBusy(true);
    setError('');
    setPhase('Connecting wallet');
    try {
      const { connectWallet } = await import('./lib/genlayer');
      const address = await connectWallet();
      setAccount(address);
      setForm((current) => ({ ...current, fromAddress: address }));
      setPhase('Wallet connected');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to connect the wallet.');
      setPhase('Connection failed');
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setForm({ ...initialForm, fromAddress: account });
    setResult(null);
    setError('');
    setPhase('Ready');
  }

  async function runClearance() {
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const fromAddress = (account || form.fromAddress).trim();
      const toAddress = form.toAddress.trim();
      if (!isEvmAddress(fromAddress)) throw new Error('Enter or connect a valid non-zero sender address.');
      if (!isEvmAddress(toAddress)) throw new Error('Enter a valid non-zero destination address.');
      if (!/^\d+$/.test(form.chainId) || BigInt(form.chainId) < 1n) throw new Error('Enter a valid target chain ID.');
      if (!/^\d+$/.test(form.transactionNonce)) throw new Error('Enter the sender account nonce as a non-negative integer.');
      if (form.intent.trim().length < 8) throw new Error('Describe the intended action in at least eight characters.');

      const valueWei = parseValue(form.nativeValue);
      const calldata = normalizeCalldata(form.calldata);
      const urls = evidenceUrlsFromText(form.evidenceText);
      const local = analyzeLocally({
        policyId: form.policyId,
        valueWei,
        calldata,
        hasEvidence: urls.length > 0,
      });

      if (!contractConfigured) {
        setResult({ ...local, mode: 'local' });
        setPhase('Local preflight complete');
        return;
      }
      if (!account) throw new Error('Connect a wallet to submit this request to GenLayer.');

      setPhase(local.decision === 'BLOCK' ? 'Recording deterministic block' : 'Submitting to GenLayer');
      const { requestClearance } = await import('./lib/genlayer');
      const request = {
        requestReference: requestReference(),
        policyId: form.policyId,
        chainId: BigInt(form.chainId),
        transactionNonce: BigInt(form.transactionNonce),
        fromAddress,
        toAddress,
        valueWei,
        calldata,
        intent: form.intent.trim(),
        evidenceUrls: urls,
        validForSeconds: 3_600n,
      };
      const response = await requestClearance(account, request, () => {
        setPhase('Validators are checking');
      });
      setResult({
        decision: response.clearance.decision,
        actionKind: response.clearance.actionKind,
        reasonCodes: response.clearance.reasonCodes,
        summary: response.clearance.summary,
        mode: 'consensus',
        clearance: response.clearance,
        transactionHash: response.hash,
      });
      setClearanceCount((current) => current === null || response.clearance.clearanceId > current
        ? response.clearance.clearanceId
        : current);
      setNetworkState('online');
      setPhase('Finalized on GenLayer');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The clearance request failed.');
      setPhase('Request stopped');
    } finally {
      setBusy(false);
    }
  }

  async function copyProof() {
    if (!result?.clearance) return;
    await navigator.clipboard.writeText(result.clearance.clearanceDigest);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_600);
  }

  const activeDecision = result?.decision ?? visiblePreview?.decision ?? 'REQUIRES_CONSENSUS';
  const outcomeClass = result || visiblePreview
    ? activeDecision.toLowerCase().replaceAll('_', '-')
    : 'idle';
  const networkLabel = networkState === 'online'
    ? `${apiLive ? 'API + ' : ''}StudioNet live · ${clearanceCount?.toString() ?? '—'} proofs`
    : networkState === 'checking'
      ? 'Checking StudioNet'
      : networkState === 'offline'
        ? 'StudioNet unavailable'
        : 'Contract not configured';

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="TrustGate home">
          <span className="brand-mark"><ShieldMark small /></span>
          <span>TrustGate</span>
        </a>
        <nav className="nav-links" aria-label="Primary navigation">
          <a href="#scanner">Check</a>
          <a href="#flow">How it works</a>
          <a href="#agent-api">Agent API</a>
        </nav>
        <div className="topbar-actions">
          <span className={`network-pill network-pill--${networkState}`} title={networkLabel}>
            <span className="network-dot" />
            <span className="network-copy">{networkLabel}</span>
            <span className="network-short">{networkState === 'online' ? 'Live' : networkState === 'checking' ? 'Wait' : networkState === 'offline' ? 'Down' : 'Off'}</span>
          </span>
          <button className="wallet-button" type="button" onClick={handleConnect} disabled={busy}>
            <WalletIcon />
            {account ? short(account, 6, 4) : 'Connect'}
          </button>
        </div>
      </header>

      {phase === 'Connection failed' && error && (
        <div className="wallet-alert" role="alert">
          <span><strong>Wallet not connected.</strong> {error}</span>
          <button
            type="button"
            aria-label="Dismiss wallet message"
            onClick={() => {
              setError('');
              setPhase('Ready');
            }}
          >×</button>
        </div>
      )}

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span>LIVE ON GENLAYER</span></div>
            <h1>Clear it before you sign it.</h1>
            <p>One calm checkpoint for wallet and agent transactions. Obvious danger stops fast; everything else gets a verifiable verdict.</p>
            <div className="hero-actions">
              <a className="primary-link" href="#scanner">Check a transaction <ArrowIcon /></a>
              <a className="text-link" href="#flow">See the 3-step flow</a>
            </div>
            <div className="hero-trust">
              <span><i /> Gasless testnet</span>
              <span><i /> Non-custodial</span>
              <span><i /> Proof on-chain</span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="visual-sticker">Made for humans + agents</div>
            <Suspense fallback={<PlayerFallback />}>
              <TrustGatePlayer />
            </Suspense>
          </div>
        </section>

        <section className="scanner-section" id="scanner">
          <div className="section-intro">
            <div>
              <span className="section-kicker">TRANSACTION CHECK</span>
              <h2>What are you about to do?</h2>
            </div>
            <p>Paste the exact call. TrustGate binds the verdict to it.</p>
          </div>

          <div className="scanner-grid">
            <div className="scanner-panel">
              <div className="form-block form-block--policy">
                <div className="form-label-row">
                  <label>Choose a policy</label>
                  <span>{selectedPolicy.description}</span>
                </div>
                <div className="policy-grid" role="group" aria-label="Security policy">
                  {POLICIES.map((policy) => (
                    <button
                      type="button"
                      key={policy.id}
                      className={`policy-card ${form.policyId === policy.id ? 'policy-card--selected' : ''}`}
                      onClick={() => update('policyId', policy.id)}
                      aria-pressed={form.policyId === policy.id}
                    >
                      <span className="policy-radio" />
                      <span><strong>{policy.name}</strong><small>{policy.id === 'balanced-v1' ? 'Best default' : policy.id === 'conservative-v1' ? 'Most careful' : 'More flexible'}</small></span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-block">
                <div className="form-label-row"><label>Transaction</label><span>Exact values only</span></div>
                <div className="field-grid field-grid--split">
                  <label className="field">
                    <span>Target chain</span>
                    <input value={form.chainId} onChange={(event) => update('chainId', event.target.value)} inputMode="numeric" />
                  </label>
                  <label className="field">
                    <span>Native value</span>
                    <div className="input-with-unit">
                      <input value={form.nativeValue} onChange={(event) => update('nativeValue', event.target.value)} inputMode="decimal" />
                      <b>NATIVE</b>
                    </div>
                  </label>
                </div>
                <label className="field">
                  <span>Account nonce</span>
                  <input value={form.transactionNonce} onChange={(event) => update('transactionNonce', event.target.value)} inputMode="numeric" />
                </label>
                <label className="field">
                  <span>From</span>
                  <input
                    value={account || form.fromAddress}
                    onChange={(event) => update('fromAddress', event.target.value)}
                    disabled={Boolean(account)}
                    placeholder="0x sender"
                    autoComplete="off"
                  />
                </label>
                <label className="field">
                  <span>To</span>
                  <input value={form.toAddress} onChange={(event) => update('toAddress', event.target.value)} placeholder="0x contract or wallet" autoComplete="off" />
                </label>
                <label className="field">
                  <span>Calldata</span>
                  <textarea
                    className="code-input"
                    value={form.calldata}
                    onChange={(event) => update('calldata', event.target.value)}
                    rows={3}
                    spellCheck={false}
                  />
                </label>
              </div>

              <div className="form-block">
                <div className="form-label-row"><label>Context</label><span>Helps validators judge the call</span></div>
                <label className="field">
                  <span>Expected outcome</span>
                  <textarea
                    value={form.intent}
                    onChange={(event) => update('intent', event.target.value)}
                    placeholder="Example: Transfer exactly 1 USDC to 0x…"
                    rows={3}
                  />
                </label>
                <label className="field">
                  <span>Evidence links <em>optional · up to 3</em></span>
                  <textarea
                    value={form.evidenceText}
                    onChange={(event) => update('evidenceText', event.target.value)}
                    placeholder={'https://project.org/deployment.json\nhttps://explorer.org/verified-source'}
                    rows={3}
                  />
                </label>
              </div>

              {error && phase !== 'Connection failed' && <div className="error-banner" role="alert"><strong>Not submitted.</strong> {error}</div>}

              <div className="form-actions">
                <button className="secondary-button" type="button" onClick={resetForm} disabled={busy}>Clear</button>
                <button className="primary-button" type="button" onClick={runClearance} disabled={busy}>
                  {busy ? <span className="spinner" /> : <ShieldMark small />}
                  {busy ? phase : contractConfigured ? 'Request clearance' : 'Run local check'}
                  {!busy && <ArrowIcon />}
                </button>
              </div>
            </div>

            <aside className={`verdict-panel verdict-panel--${outcomeClass}`} aria-live="polite">
              <div className="verdict-topline">
                <span>YOUR PROOF</span>
                <span className="phase-status"><i /> {phase}</span>
              </div>
              <div className="verdict-stamp"><ShieldMark /></div>
              <div className="verdict-copy">
                <span>{result || visiblePreview ? 'CURRENT VERDICT' : 'READY WHEN YOU ARE'}</span>
                <h3>{result || visiblePreview ? decisionLabel(activeDecision) : 'Add a transaction'}</h3>
                <p>{result?.summary ?? visiblePreview?.summary ?? 'Your result will appear here before anything is signed.'}</p>
              </div>

              <div className="verdict-details">
                <div><span>Action</span><strong>{result?.actionKind ?? visiblePreview?.actionKind ?? '—'}</strong></div>
                <div><span>Policy</span><strong>{selectedPolicy.name}</strong></div>
                <div><span>Mode</span><strong>{result?.mode === 'consensus' ? 'Finalized' : result ? 'Local' : 'Preview'}</strong></div>
                {result?.clearance && (
                  <>
                    <div><span>Proof</span><strong>#{result.clearance.clearanceId.toString()}</strong></div>
                    <div><span>Expires</span><strong>{new Date(Number(result.clearance.expiresAt) * 1_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></div>
                    <div className="digest-row"><span>Digest</span><button type="button" onClick={copyProof}>{copied ? 'Copied!' : short(result.clearance.clearanceDigest)}</button></div>
                  </>
                )}
              </div>

              {result && result.reasonCodes.length > 0 && (
                <div className="reason-list">
                  {result.reasonCodes.map((code) => (
                    <div className="reason-item" key={code}>
                      <i />
                      <p><strong>{code.replaceAll('_', ' ')}</strong><span>{explainReason(code)}</span></p>
                    </div>
                  ))}
                </div>
              )}

              {result?.transactionHash && (
                <a className="proof-link" href={`${explorerUrl}/tx/${result.transactionHash}`} target="_blank" rel="noreferrer">
                  View on explorer <ArrowIcon />
                </a>
              )}

              <div className="contract-chip" title={contractAddress ?? undefined}>
                <span className={`network-dot network-dot--${networkState}`} />
                <span>{contractAddress ? short(contractAddress, 7, 5) : 'No contract'}</span>
                <strong>{clearanceCount?.toString() ?? '—'} proofs</strong>
              </div>
            </aside>
          </div>
        </section>

        <section className="flow-section" id="flow">
          <div className="section-intro section-intro--center">
            <div><span className="section-kicker">HOW IT WORKS</span><h2>Three steps. No mystery.</h2></div>
          </div>
          <div className="process-grid">
            <article><span>1</span><div className="process-icon process-icon--peach">⌁</div><h3>Decode</h3><p>Catch dangerous approvals and value limits immediately.</p></article>
            <article><span>2</span><div className="process-icon process-icon--lilac">•••</div><h3>Agree</h3><p>Validators check public evidence when judgment is needed.</p></article>
            <article><span>3</span><div className="process-icon process-icon--mint">✓</div><h3>Prove</h3><p>Store an expiring verdict bound to the exact transaction.</p></article>
          </div>
        </section>

        <section className="api-section" id="agent-api">
          <div className="api-copy">
            <span className="section-kicker">FOR AI AGENTS</span>
            <h2>A real API, with a clear boundary.</h2>
            <p>Use HTTP for health, deterministic preflight, and proof reads. The wallet named by From signs consensus writes directly on GenLayer.</p>
            <div className="api-links">
              <a href="/api/health" target="_blank" rel="noreferrer"><i /> Live health</a>
              <a href="/api/proof?id=2" target="_blank" rel="noreferrer"><i /> Proof #2</a>
              <a href="/api/openapi" target="_blank" rel="noreferrer"><i /> OpenAPI</a>
            </div>
            <div className="boundary-note"><strong>No signing key on Vercel.</strong><span>The agent or wallet remains in control.</span></div>
          </div>
          <div className="code-card">
            <div className="code-card__top"><span /><span /><span /><b>preflight.ts</b></div>
            <pre><code>{API_EXAMPLE}</code></pre>
            <div className="code-card__footer"><span className={`network-dot network-dot--${apiLive ? 'online' : networkState}`} /> {apiLive ? 'Production API responding' : 'Direct contract reads available'}</div>
          </div>
        </section>
      </main>

      <footer>
        <a className="brand brand--footer" href="#top"><span className="brand-mark"><ShieldMark small /></span><span>TrustGate</span></a>
        <p>Know what happens before you sign.</p>
        <div><span>StudioNet</span><i /><span>v0.4.0</span></div>
      </footer>
    </div>
  );
}
