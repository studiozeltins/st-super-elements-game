// Constellation ring: 6 arc segments around a character's letter disc. Shared by
// the character screen (portrait badge + roster chips) and the team page.

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

type SegState = 'active' | 'available' | 'locked';

export function ConstellationRing({
  letter,
  unlocked,
  activated,
  variant = 'large',
}: {
  letter: string;
  unlocked: number;
  activated: number;
  /** 'large' = tight portrait badge, 'chip' = tiny selector ring. */
  variant?: 'large' | 'chip';
}) {
  const GAP = 26; // degrees of empty space between segments
  const RADIUS = 40; // arc radius — close to the disc so padding is small
  const disc = variant === 'chip' ? 30 : 29;
  const nextAvailable = activated < unlocked ? activated + 1 : 0;
  return (
    <svg className={`cring cring--${variant}`} viewBox="0 0 100 100" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => {
        const level = index + 1;
        const state: SegState =
          level <= activated ? 'active' : level <= unlocked ? 'available' : 'locked';
        const isNext = level === nextAvailable;
        const start = index * 60 + GAP / 2;
        const end = (index + 1) * 60 - GAP / 2;
        return (
          <path
            key={level}
            className={`cring__seg cring__seg--${state} ${isNext ? 'cring__seg--next' : ''}`}
            d={arcPath(50, 50, RADIUS, start, end)}
          />
        );
      })}
      <circle className="cring__disc" cx="50" cy="50" r={disc} />
      <text className="cring__letter" x="50" y="51" textAnchor="middle" dominantBaseline="central">
        {letter}
      </text>
    </svg>
  );
}
