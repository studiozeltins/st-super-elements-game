import { useEffect, useMemo, useState } from 'react';
import { CHARACTERS } from '../game/data/characters';
import { WEAPONS_BY_ID, RARITY_CSS } from '../game/data/gacha';
import { ShardCounter } from './ShardCounter';
import { playConstellationChime } from './pullSounds';
import type { PullView } from './GachaScreen';

const CARD_STAGGER_MS = 80;
const CONSTELLATION_STEP_MS = 450;

interface CharacterGroup {
  itemId: string;
  rarity: number;
  copies: number;
  isNew: boolean;
  isFeatured: boolean;
  /** Constellation shown before the animation starts (pre-pull level). */
  startC: number;
  /** Ascending constellation levels the badge pops through (C1→C6 moments). */
  steps: number[];
  shardMinted: number;
}

interface WeaponGroup {
  itemId: string;
  rarity: number;
  count: number;
}

function groupResults(sorted: PullView[]) {
  const characterGroups = new Map<string, CharacterGroup>();
  const weaponGroups = new Map<string, WeaponGroup>();
  for (const view of sorted) {
    if (view.kind === 'character') {
      let group = characterGroups.get(view.itemId);
      if (!group) {
        group = {
          itemId: view.itemId,
          rarity: view.rarity,
          copies: 0,
          isNew: false,
          isFeatured: view.isFeatured,
          // First copy in this pull: new unlock starts blank, an already-C6
          // overflow dupe stays at 6, otherwise the row's constellation is
          // post-increment so the pre-pull level is one lower.
          startC: view.isNew ? 0 : view.shardMinted > 0 ? 6 : Math.max(0, view.constellation - 1),
          steps: [],
          shardMinted: 0,
        };
        characterGroups.set(view.itemId, group);
      }
      group.copies += 1;
      group.isNew ||= view.isNew;
      group.shardMinted += view.shardMinted;
      const shown = group.steps.length > 0 ? group.steps[group.steps.length - 1] : group.startC;
      if (view.constellation > shown) group.steps.push(view.constellation);
    } else {
      const group = weaponGroups.get(view.itemId);
      if (group) group.count += 1;
      else weaponGroups.set(view.itemId, { itemId: view.itemId, rarity: view.rarity, count: 1 });
    }
  }
  const characters = [...characterGroups.values()].sort(
    (a, b) => b.rarity - a.rarity || b.copies - a.copies
  );
  const weapons = [...weaponGroups.values()].sort(
    (a, b) => b.rarity - a.rarity || b.count - a.count
  );
  return { characters, weapons };
}

/** One aggregated character card whose C-badge pops through the gained levels. */
function CharacterCard({
  group,
  order,
  animStartMs,
}: {
  group: CharacterGroup;
  order: number;
  animStartMs: number;
}) {
  const [stepIndex, setStepIndex] = useState(-1); // -1 = still at startC

  useEffect(() => {
    if (group.steps.length === 0) return;
    let index = -1;
    let interval = 0;
    const kickoff = window.setTimeout(() => {
      interval = window.setInterval(() => {
        index += 1;
        setStepIndex(index);
        playConstellationChime(index);
        if (index >= group.steps.length - 1) window.clearInterval(interval);
      }, CONSTELLATION_STEP_MS);
    }, animStartMs);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
    };
  }, [group.steps.length, animStartMs]);

  const shownC = stepIndex >= 0 ? group.steps[stepIndex] : group.startC;
  const name = CHARACTERS[group.itemId]?.displayName ?? group.itemId;
  return (
    <div
      className={`reveal-card bigpull-char rarity-border-${group.rarity} ${group.shardMinted > 0 ? 'reveal-card--minted' : ''}`}
      style={{ animationDelay: `${order * CARD_STAGGER_MS}ms` }}
    >
      <span className={`reveal-card__rarity rarity-${group.rarity}`}>
        {'✦'.repeat(group.rarity)}
      </span>
      <span className="reveal-card__name">{name}</span>
      <span className="reveal-card__kind">
        VARONIS{group.copies > 1 ? ` ×${group.copies}` : ''}
      </span>
      <span className="reveal-card__tags">
        {group.isFeatured && <span className="reveal-card__tag">PASTIPRINĀTS</span>}
        {group.isNew && <span className="reveal-card__tag reveal-card__tag--new">JAUNS</span>}
        {shownC > 0 && (
          <span key={shownC} className="reveal-card__tag bigpull-char__constellation">
            C{shownC}
          </span>
        )}
      </span>
      {group.shardMinted > 0 && (
        <span className="reveal-card__shardtag">◈ +{group.shardMinted}</span>
      )}
    </div>
  );
}

/**
 * Aggregated reveal for max-pulls (>10 results): character cards animate their
 * constellation gains, weapons collapse into ×N count rows, then the purple
 * shard payoff ticks up with a rising chime.
 */
export function PullSummaryBig({
  results,
  transcendShards,
  onClose,
}: {
  results: PullView[];
  transcendShards: number;
  onClose: () => void;
}) {
  const sorted = useMemo(() => [...results].sort((a, b) => a.slot - b.slot), [results]);
  const { characters, weapons } = useMemo(() => groupResults(sorted), [sorted]);

  const mintedShards = characters.reduce((sum, group) => sum + group.shardMinted, 0);
  const maxSteps = characters.reduce((max, group) => Math.max(max, group.steps.length), 0);
  const cardsLandedMs = 650 + characters.length * CARD_STAGGER_MS;
  const shardStartMs = cardsLandedMs + maxSteps * CONSTELLATION_STEP_MS + 500;

  return (
    <div className="pull-reveal pull-reveal--big" onClick={onClose}>
      <span className="bigpull-total">{sorted.length} VĒLĒŠANĀS</span>

      {characters.length > 0 && (
        <div className="bigpull-chars">
          {characters.map((group, order) => (
            <CharacterCard
              key={group.itemId}
              group={group}
              order={order}
              animStartMs={cardsLandedMs}
            />
          ))}
        </div>
      )}

      <div className="bigpull-weapons">
        {weapons.map((group, order) => (
          <div
            key={group.itemId}
            className={`bigpull-weapon rarity-border-${group.rarity}`}
            style={{
              animationDelay: `${characters.length * CARD_STAGGER_MS + order * 30}ms`,
              '--rarity-color': RARITY_CSS[group.rarity] ?? RARITY_CSS[3],
            } as React.CSSProperties}
          >
            <span className={`bigpull-weapon__rarity rarity-${group.rarity}`}>
              {'✦'.repeat(group.rarity)}
            </span>
            <span className="bigpull-weapon__name">
              {WEAPONS_BY_ID[group.itemId]?.displayName ?? group.itemId}
            </span>
            <span className="bigpull-weapon__count">×{group.count}</span>
          </div>
        ))}
      </div>

      {mintedShards > 0 && (
        <ShardCounter
          before={transcendShards - mintedShards}
          after={transcendShards}
          startDelayMs={shardStartMs}
        />
      )}

      <span className="pull-reveal__hint">Pieskaries, lai aizvērtu</span>
    </div>
  );
}
