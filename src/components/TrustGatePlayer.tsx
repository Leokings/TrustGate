import { Player, type PlayerRef } from '@remotion/player';
import { useEffect, useRef, useState } from 'react';
import { TrustGateFlow } from '../remotion/TrustGateFlow';

export default function TrustGatePlayer() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const playerRef = useRef<PlayerRef>(null);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    if (reducedMotion) {
      player.pause();
      player.seekTo(170);
      return;
    }

    player.play();
  }, [reducedMotion]);

  return (
    <div
      className="story-player"
      role="img"
      aria-label="Animated explanation of a transaction becoming a finalized TrustGate proof"
    >
      <Player
        ref={playerRef}
        component={TrustGateFlow}
        durationInFrames={240}
        compositionWidth={1000}
        compositionHeight={700}
        fps={30}
        autoPlay={!reducedMotion}
        loop={!reducedMotion}
        initiallyMuted
        initialFrame={reducedMotion ? 170 : 30}
        acknowledgeRemotionLicense
        controls={false}
        clickToPlay={false}
        style={{ width: '100%', aspectRatio: '10 / 7' }}
      />
    </div>
  );
}
