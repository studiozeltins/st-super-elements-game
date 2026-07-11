import { useEffect, useMemo, useRef, useState } from 'react';
import { CHARACTERS } from '../game/data/characters';
import { WEAPONS_BY_ID, RARITY_CSS } from '../game/data/gacha';
import { SplashModel } from './SplashModel';
import { PullSummaryBig } from './PullSummaryBig';
import { ShardCounter } from './ShardCounter';
import type { PullView } from './GachaScreen';

function itemName(view: PullView): string {
  if (view.kind === 'character') return CHARACTERS[view.itemId]?.displayName ?? view.itemId;
  return WEAPONS_BY_ID[view.itemId]?.displayName ?? view.itemId;
}

function hexToRgba(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

/** Full-screen canvas of 1 or 3 rarity-colored shooting stars with glowing tails. */
function StarField({ colors, onDone }: { colors: string[]; onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const stars = colors.map((color, i) => ({
      color,
      x: w * ((i + 0.5) / colors.length) + (Math.random() * 0.08 - 0.04) * w,
      y: -h * (0.12 + Math.random() * 0.32),
      vx: w * (0.05 + Math.random() * 0.06),
      vy: h * (0.46 + Math.random() * 0.4),
      delay: i * 0.09 + Math.random() * 0.12,
      trail: [] as { x: number; y: number }[],
      sparkles: [] as Sparkle[],
      done: false,
    }));

    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    let finished = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      for (const star of stars) {
        if (elapsed < star.delay) continue;
        if (!star.done) {
          star.x += star.vx * dt;
          star.y += star.vy * dt;
          star.trail.push({ x: star.x, y: star.y });
          if (star.trail.length > 40) star.trail.shift();
          if (Math.random() < 0.9) {
            star.sparkles.push({
              x: star.x + (Math.random() * 18 - 9),
              y: star.y + (Math.random() * 18 - 9),
              vx: Math.random() * 90 - 45,
              vy: Math.random() * 90 - 45,
              life: 0,
              max: 0.4 + Math.random() * 0.6,
            });
          }
          if (star.y > h + h * 0.15) {
            star.done = true;
            finished++;
          }
        }

        for (let k = 0; k < star.trail.length; k++) {
          const point = star.trail[k];
          const along = k / star.trail.length;
          ctx.beginPath();
          ctx.arc(point.x, point.y, 1.5 + along * 6, 0, Math.PI * 2);
          ctx.fillStyle = hexToRgba(star.color, along * 0.55);
          ctx.fill();
        }

        const glow = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, 34);
        glow.addColorStop(0, hexToRgba(star.color, 0.98));
        glow.addColorStop(0.5, hexToRgba(star.color, 0.4));
        glow.addColorStop(1, hexToRgba(star.color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(star.x, star.y, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(star.x, star.y, 4.5, 0, Math.PI * 2);
        ctx.fill();

        for (const sparkle of star.sparkles) {
          sparkle.life += dt;
          sparkle.x += sparkle.vx * dt;
          sparkle.y += sparkle.vy * dt;
          const alpha = Math.max(0, 1 - sparkle.life / sparkle.max);
          ctx.fillStyle = hexToRgba(star.color, alpha);
          ctx.beginPath();
          ctx.arc(sparkle.x, sparkle.y, 2.4 * alpha + 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        star.sparkles = star.sparkles.filter(sparkle => sparkle.life < sparkle.max);
      }

      if (finished >= stars.length || elapsed > 2.6) {
        onDoneRef.current();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [colors]);

  return <canvas ref={canvasRef} className="pull-stars" />;
}

type Phase = 'stars' | 'splash' | 'summary';

interface PullWalletInfo {
  /** Post-pull (live) shard balance. The pre-pull value is derived from results. */
  transcendShards: number;
}

export function PullAnimation({
  results,
  wallet,
  onClose,
}: {
  results: PullView[];
  wallet: PullWalletInfo;
  onClose: () => void;
}) {
  const sorted = useMemo(() => [...results].sort((a, b) => a.slot - b.slot), [results]);
  const [phase, setPhase] = useState<Phase>('stars');
  const [index, setIndex] = useState(0);

  // Only C6-overflow dupes mint shards. The counter is shown ONLY when this pull
  // gained shards, and it ticks up one-by-one (dopamine) from the pre-pull total.
  const mintedShards = useMemo(
    () => sorted.reduce((sum, v) => sum + (v.kind === 'character' ? v.shardMinted : 0), 0),
    [sorted]
  );
  const shardsBefore = wallet.transcendShards - mintedShards;
  // Max-pulls (>10) skip the per-item splash walk (100 taps = tedium) and land
  // on the aggregated summary instead.
  const isBigPull = sorted.length > 10;

  const starColors = useMemo(() => {
    const rarities = results.map(view => view.rarity).sort((a, b) => b - a);
    const count = results.length === 1 ? 3 : 8;
    const top: number[] = [];
    for (let i = 0; i < count; i++) top.push(rarities[i % rarities.length] ?? 3);
    return top.map(rarity => RARITY_CSS[rarity] ?? RARITY_CSS[3]);
  }, [results]);

  const toSplash = () => {
    if (isBigPull) {
      setPhase('summary');
      return;
    }
    setIndex(0);
    setPhase('splash');
  };

  const advanceSplash = () => {
    if (index + 1 < sorted.length) setIndex(index + 1);
    else setPhase('summary');
  };

  if (phase === 'stars') {
    return (
      <div className="pull-anim">
        <StarField colors={starColors} onDone={toSplash} />
        <button className="pull-anim__skip" onClick={() => setPhase('summary')}>
          IZLAIST
        </button>
      </div>
    );
  }

  if (phase === 'splash') {
    const item = sorted[index];
    return (
      <div
        className="pull-anim pull-splash"
        onClick={advanceSplash}
        style={{ '--rarity-color': RARITY_CSS[item.rarity] } as React.CSSProperties}
      >
        <span className="splash__glow" />
        <div key={index} className="splash__stage">
          <SplashModel kind={item.kind} itemId={item.itemId} />
        </div>
        <div key={`info-${index}`} className="splash__info">
          <span className={`splash__rarity rarity-${item.rarity}`}>{'✦'.repeat(item.rarity)}</span>
          <span className="splash__name">{itemName(item)}</span>
          <span className="splash__kind">{item.kind === 'character' ? 'VARONIS' : 'IEROCIS'}</span>
          <span className="splash__tags">
            {item.isFeatured && <span className="splash__tag">PASTIPRINĀTS</span>}
            {item.kind === 'character' && item.isNew && (
              <span className="splash__tag splash__tag--new">JAUNS</span>
            )}
            {item.kind === 'character' && !item.isNew && item.constellation > 0 && (
              <span className="splash__tag">C{item.constellation}</span>
            )}
          </span>
        </div>
        {sorted.length > 1 && (
          <span className="splash__count">
            {index + 1} / {sorted.length}
          </span>
        )}
        <button
          className="pull-anim__skip"
          onClick={event => {
            event.stopPropagation();
            setPhase('summary');
          }}
        >
          IZLAIST
        </button>
        <span className="splash__hint">Pieskaries, lai turpinātu</span>
      </div>
    );
  }

  if (isBigPull) {
    return (
      <PullSummaryBig
        results={sorted}
        transcendShards={wallet.transcendShards}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="pull-reveal" onClick={onClose}>
      <div
        className={`pull-reveal__grid ${sorted.length > 1 ? 'pull-reveal__grid--ten' : ''}`}
      >
        {sorted.map(view => {
          const minted = view.kind === 'character' && view.shardMinted > 0;
          return (
            <div
              key={view.slot}
              data-slot={view.slot}
              className={`reveal-card rarity-border-${view.rarity} ${minted ? 'reveal-card--minted' : ''}`}
              style={{ animationDelay: `${view.slot * 0.05}s` }}
            >
              <span className={`reveal-card__rarity rarity-${view.rarity}`}>
                {'✦'.repeat(view.rarity)}
              </span>
              <span className="reveal-card__name">{itemName(view)}</span>
              <span className="reveal-card__kind">
                {view.kind === 'character' ? 'VARONIS' : 'IEROCIS'}
              </span>
              {view.isFeatured && <span className="reveal-card__tag">PASTIPRINĀTS</span>}
              {view.kind === 'character' && view.isNew && (
                <span className="reveal-card__tag reveal-card__tag--new">JAUNS</span>
              )}
              {view.kind === 'character' && !view.isNew && view.constellation > 0 && (
                <span className="reveal-card__tag">C{view.constellation}</span>
              )}
              {minted && (
                <span className="reveal-card__shardtag">◈ +{view.shardMinted}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Shard payoff: only shown when this pull actually minted shards. The
          number ticks up one-by-one, popping + chiming on each +1. */}
      {mintedShards > 0 && (
        <ShardCounter
          before={shardsBefore}
          after={wallet.transcendShards}
          startDelayMs={sorted.length * 50 + 700}
        />
      )}

      <span className="pull-reveal__hint">Pieskaries, lai aizvērtu</span>
    </div>
  );
}
