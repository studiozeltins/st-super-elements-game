import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { randomComicStyle, type ComicStyle } from './SfxPopup';
import './deathOverlay.css';

type Phase = 'hidden' | 'pre' | 'in' | 'out';

/**
 * Minimum time the screen stays BLACK after a death before fade-back may start.
 * The server's synthesized dead-window is only ~1.2s, so onDeathChange(false)
 * usually arrives early — the overlay owns its own hold so the death still
 * lands as a real beat, not a blink.
 */
const BLACK_HOLD_MS = 2200;

/**
 * Death sequence: fade to black (~0.8s), a comic "DEAD!" (random face / tilt /
 * position per death, red accent) pops in the dark, the black HOLDS for
 * BLACK_HOLD_MS, then fades back (~0.6s) and unmounts. Purely visual —
 * pointer-events stay off for the whole lifecycle. Opacity is transitioned
 * (not keyframed) so a re-death mid fade-out snaps back toward black from the
 * CURRENT opacity instead of restarting from transparent.
 */
export function DeathOverlay({ dead }: { dead: boolean }) {
  const [phase, setPhase] = useState<Phase>('hidden');
  const [comic, setComic] = useState<ComicStyle | null>(null);
  const deathAtRef = useRef(-Infinity);

  useEffect(() => {
    if (dead) {
      deathAtRef.current = performance.now();
      setComic(randomComicStyle());
      // Fresh death mounts transparent ('pre') for a frame so the fade-in
      // transition can run; a re-death during 'out' jumps straight to 'in'.
      setPhase(current => (current === 'out' || current === 'in' ? 'in' : 'pre'));
      return;
    }
    // Respawn arrived: only leave the dark once the hold has fully elapsed.
    const holdRemaining = deathAtRef.current + BLACK_HOLD_MS - performance.now();
    if (holdRemaining <= 0) {
      setPhase(current => (current === 'hidden' ? 'hidden' : 'out'));
      return;
    }
    const timer = window.setTimeout(
      () => setPhase(current => (current === 'hidden' ? 'hidden' : 'out')),
      holdRemaining
    );
    return () => window.clearTimeout(timer);
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
  const textStyle = comic
    ? ({
        '--death-font': `'${comic.font}'`,
        '--death-tilt': `${comic.tiltDeg.toFixed(1)}deg`,
        '--death-x': `${comic.x.toFixed(1)}%`,
        '--death-y': `${comic.y.toFixed(1)}%`,
      } as CSSProperties)
    : undefined;
  return (
    <div className={`death-overlay death-overlay--${phase}`} aria-hidden="true">
      {phase !== 'pre' && (
        <div className="death-overlay__text" style={textStyle}>
          DEAD!
        </div>
      )}
    </div>
  );
}
