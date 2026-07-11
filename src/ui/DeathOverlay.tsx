import { useEffect, useState } from 'react';
import './deathOverlay.css';

type Phase = 'hidden' | 'pre' | 'in' | 'out';

/**
 * Death sequence: fade to black (~0.8s), manga "KRITIS!" pops in the dark,
 * fade back (~0.6s) on respawn, then unmount. Purely visual — pointer-events
 * stay off for the whole lifecycle. Opacity is transitioned (not keyframed)
 * so a re-death mid fade-out snaps back toward black from the CURRENT opacity
 * instead of restarting from transparent.
 */
export function DeathOverlay({ dead }: { dead: boolean }) {
  const [phase, setPhase] = useState<Phase>('hidden');

  useEffect(() => {
    if (dead) {
      // Fresh death mounts transparent ('pre') for a frame so the fade-in
      // transition can run; a re-death during 'out' jumps straight to 'in'.
      setPhase(current => (current === 'out' || current === 'in' ? 'in' : 'pre'));
    } else {
      setPhase(current => (current === 'hidden' ? 'hidden' : 'out'));
    }
  }, [dead]);

  useEffect(() => {
    if (phase === 'pre') {
      // Double rAF: the first can fire before the mount paint — the class flip
      // must land on the frame AFTER it, or the transition never plays.
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setPhase('in'));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    if (phase === 'out') {
      const timer = window.setTimeout(() => setPhase('hidden'), 650);
      return () => window.clearTimeout(timer);
    }
  }, [phase]);

  if (phase === 'hidden') return null;
  return (
    <div className={`death-overlay death-overlay--${phase}`} aria-hidden="true">
      {phase !== 'pre' && <div className="death-overlay__text">KRITIS!</div>}
    </div>
  );
}
