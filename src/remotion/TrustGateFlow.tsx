import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

function Check({ color = '#173d2d' }: { color?: string }) {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
      <path d="m7 16 6 6L25 10" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrustGateFlow() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      name="TrustGate flow"
      style={{
        backgroundColor: '#fff7e8',
        color: '#18352a',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      <Interactive.Div
        name="Sun glow"
        style={{
          position: 'absolute',
          width: 440,
          height: 440,
          borderRadius: 999,
          backgroundColor: '#ffd77c',
          opacity: 0.42,
          top: -210,
          right: -80,
          scale: interpolate(frame, [0, 4 * fps], [0.92, 1.08], {
            easing: Easing.bezier(0.37, 0, 0.63, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            output: 'perceptual-scale',
          }),
        }}
      />
      <Interactive.Div
        name="Intro label"
        style={{
          position: 'absolute',
          top: 64,
          left: 68,
          fontSize: 19,
          fontWeight: 800,
          letterSpacing: 2.5,
          color: '#866647',
          opacity: interpolate(frame, [0, 0.6 * fps], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        ONE TRANSACTION. ONE CLEAR ANSWER.
      </Interactive.Div>

      <Interactive.Div
        name="Transaction card"
        style={{
          position: 'absolute',
          left: 68,
          top: 158,
          width: 296,
          height: 394,
          borderRadius: 36,
          backgroundColor: '#ffffff',
          border: '3px solid #18352a',
          boxShadow: '12px 14px 0 #f2a7a0',
          padding: 30,
          translate: interpolate(frame, [0.4 * fps, 1.4 * fps], ['-90px 0px', '0px 0px'], {
            easing: Easing.spring({ damping: 160 }),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          opacity: interpolate(frame, [0.4 * fps, 1 * fps], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        <div style={{ width: 62, height: 62, borderRadius: 20, display: 'grid', placeItems: 'center', background: '#ece4ff', fontSize: 28 }}>↗</div>
        <div style={{ marginTop: 30, fontSize: 21, fontWeight: 800, color: '#8b6d56' }}>PROPOSED CALL</div>
        <div style={{ marginTop: 12, fontSize: 42, lineHeight: 1.02, letterSpacing: -2.4, fontWeight: 850 }}>Send<br />1 USDC</div>
        <div style={{ marginTop: 30, display: 'grid', gap: 12 }}>
          <div style={{ height: 10, borderRadius: 99, background: '#e8e4dc', width: '100%' }} />
          <div style={{ height: 10, borderRadius: 99, background: '#e8e4dc', width: '72%' }} />
          <div style={{ height: 10, borderRadius: 99, background: '#e8e4dc', width: '86%' }} />
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Flow line"
        style={{
          position: 'absolute',
          left: 364,
          top: 344,
          width: interpolate(frame, [1.4 * fps, 4.2 * fps], [0, 350], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          height: 5,
          borderRadius: 99,
          backgroundColor: '#6cbf9a',
        }}
      />

      {[0, 1, 2].map((index) => (
        <Interactive.Div
          name={`Validator ${index + 1}`}
          key={index}
          style={{
            position: 'absolute',
            left: 428 + index * 74,
            top: 309 + (index === 1 ? -78 : index === 2 ? 78 : 0),
            width: 62,
            height: 62,
            borderRadius: 999,
            display: 'grid',
            placeItems: 'center',
            backgroundColor: index === 1 ? '#ffd77c' : index === 2 ? '#ece4ff' : '#d7f2e4',
            border: '3px solid #18352a',
            fontSize: 24,
            fontWeight: 900,
            scale: interpolate(frame, [(1.7 + index * 0.28) * fps, (2.45 + index * 0.28) * fps], [0, 1], {
              easing: Easing.spring({ damping: 120 }),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              output: 'perceptual-scale',
            }),
          }}
        >
          {index + 1}
        </Interactive.Div>
      ))}

      <Interactive.Div
        name="Consensus label"
        style={{
          position: 'absolute',
          left: 428,
          top: 506,
          width: 210,
          textAlign: 'center',
          fontSize: 20,
          fontWeight: 800,
          color: '#6d765f',
          opacity: interpolate(frame, [2.7 * fps, 3.3 * fps], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        validators agree
      </Interactive.Div>

      <Interactive.Div
        name="Proof ticket"
        style={{
          position: 'absolute',
          right: 62,
          top: 148,
          width: 286,
          height: 414,
          borderRadius: 42,
          backgroundColor: '#d7f2e4',
          border: '3px solid #18352a',
          boxShadow: '12px 14px 0 #8dcdb0',
          padding: 30,
          translate: interpolate(frame, [3.4 * fps, 4.5 * fps], ['92px 0px', '0px 0px'], {
            easing: Easing.spring({ damping: 160 }),
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          opacity: interpolate(frame, [3.4 * fps, 4.1 * fps], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        <div style={{ width: 82, height: 82, borderRadius: 27, display: 'grid', placeItems: 'center', background: '#fff', border: '3px solid #18352a' }}><Check /></div>
        <div style={{ marginTop: 35, fontSize: 20, fontWeight: 800, color: '#47705d' }}>FINAL PROOF</div>
        <div style={{ marginTop: 8, fontSize: 62, lineHeight: 1, letterSpacing: -4, fontWeight: 900 }}>ALLOW</div>
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '2px dashed #7ab99a', display: 'grid', gap: 11, fontSize: 18, fontWeight: 700 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Policy</span><span>Balanced</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Bound</span><span>Exact call</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Expires</span><span>1 hour</span></div>
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Bottom note"
        style={{
          position: 'absolute',
          left: 68,
          bottom: 52,
          fontSize: 25,
          fontWeight: 800,
          letterSpacing: -0.6,
          opacity: interpolate(frame, [4.6 * fps, 5.3 * fps], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        Deterministic rules first. Judgment only when needed.
      </Interactive.Div>
    </AbsoluteFill>
  );
}
