import { useEffect, useRef, useState } from 'react';
import { CHARACTER_LIST, CHARACTERS, healSpecFor, ROLE_META } from '../game/data/characters';
import { ELEMENTS } from '../game/data/elements';
import { WEAPONS } from '../game/data/weapons';
import { constellationBonuses } from '../game/data/constellations';
import {
  MAX_TRANSCEND_LEVEL,
  TRANSCEND_SHARD_COST,
  TRANSCEND_DAMAGE_STEP,
  TRANSCEND_HEAL_STEP,
} from '../game/data/constants';
import { loreFor } from '../game/data/characterLore';
import { CharacterPreview } from './CharacterPreview';
import { ConstellationRing } from './ConstellationRing';
import { CharacterIdentity } from './CharacterIdentity';
import { useDragScroll } from './useDragScroll';
import { MAIN_MENU } from './menu';

type Tab = 'info' | 'weapon' | 'constellation' | 'transcend';

interface CharacterScreenProps {
  characterId: string;
  transcendShards: number;
  /** Transient flash modifier on the shard chip (`wallet-chip--pulse|--drain`), driven by App. */
  shardFlashClass?: string;
  ownedCharacterIds: Set<string>;
  activeCharacterId: string;
  /** Unlocked constellation ceiling per character (from duplicate pulls). */
  constellationById: Record<string, number>;
  /** Installed transcend levels past C6 per character. */
  transcendById: Record<string, number>;
  /** Currently-active stars per character (manual). Absent = full ceiling active. */
  activatedById: Record<string, number>;
  /** Change which character is being viewed (roster tap / swipe). */
  onView(characterId: string): void;
  /** Set how many unlocked stars are active for a character. */
  onSetConstellation(characterId: string, level: number): void;
  /** Install one transcend level on a character (spends transcend shards, C6-gated). */
  onTranscend(characterId: string): void;
  /** Jump to a wish-screen tab from the always-visible main menu. Omit to hide it. */
  onOpenMenu?(tab: 'banners' | 'party' | 'characters' | 'inventory'): void;
  onClose(): void;
}

// Plain-language explanation for each resistance channel (tap a chip to reveal).
const RESIST_INFO: Record<string, { label: string; describe: (percent: number) => string }> = {
  contact: {
    label: 'Tuvcīņa',
    describe: p => `Saņem par ${p}% mazāk bojājumu no ienaidnieku un goliātu sitieniem tuvcīņā.`,
  },
  ranged: {
    label: 'Šāviens',
    describe: p => `Saņem par ${p}% mazāk bojājumu no šāviņiem — bultām un lodēm.`,
  },
  melee: { label: 'Zobens', describe: p => `Saņem par ${p}% mazāk bojājumu no asmeņu uzbrukumiem.` },
  skill: { label: 'Prasme', describe: p => `Saņem par ${p}% mazāk bojājumu no prasmēm un maģijas.` },
};

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'info', label: 'INFO', glyph: '❖' },
  { id: 'weapon', label: 'IEROCIS', glyph: '⚔' },
  { id: 'constellation', label: 'CIEŅA', glyph: '✦' },
  { id: 'transcend', label: 'BŪSTS', glyph: '◈' },
];

const SWIPE_THRESHOLD = 55;

export function CharacterScreen({
  characterId,
  transcendShards,
  shardFlashClass = '',
  ownedCharacterIds,
  activeCharacterId,
  constellationById,
  transcendById,
  activatedById,
  onView,
  onSetConstellation,
  onTranscend,
  onOpenMenu,
  onClose,
}: CharacterScreenProps) {
  const [tab, setTab] = useState<Tab>('info');
  const [openResist, setOpenResist] = useState<string | null>(null);
  const [openStat, setOpenStat] = useState<string | null>(null);
  // Transcend confirm is two-step. Track the character it's armed for so switching
  // characters (or a completed install) auto-disarms without a reset effect.
  const [confirmingTranscendId, setConfirmingTranscendId] = useState<string | null>(null);
  // Bumped whenever the shown character's transcend level rises → replays the
  // orbit-star "drop-in" flourish on the portrait. prevLevels remembers the last
  // seen level per character so switching characters never mis-fires the anim.
  const [transcendFlourish, setTranscendFlourish] = useState(0);
  const prevTranscendLevels = useRef<Record<string, number>>({});
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const rosterScroll = useDragScroll();

  // Replay the orbit flourish when the shown character's transcend level rises.
  useEffect(() => {
    const lvl = transcendById[characterId] ?? 0;
    const prev = prevTranscendLevels.current[characterId];
    prevTranscendLevels.current[characterId] = lvl;
    if (prev !== undefined && lvl > prev) setTranscendFlourish(f => f + 1);
  }, [characterId, transcendById]);

  const character = CHARACTERS[characterId];
  if (!character) return null;

  const element = ELEMENTS[character.element];
  const weapon = WEAPONS[character.weapon];

  // Info-tab stats as data so the grid and the tap-to-explain popover share one source.
  const roleMeta = ROLE_META[character.role];
  const infoStats: { key: string; label: string; value: string; info: string }[] = [
    ...(roleMeta ? [{ key: 'role', label: 'LOMA', value: roleMeta.label, info: roleMeta.desc }] : []),
    { key: 'level', label: 'LĪMENIS', value: '1', info: 'Varoņa līmenis. Augstāki līmeņi vēlāk dos vairāk dzīvības un uzbrukuma.' },
    { key: 'hp', label: 'DZĪVĪBA', value: String(character.maxHealth), info: 'Maksimālā dzīvība. Kad tā sasniedz 0, varonis krīt un atdzimst drošajā zonā.' },
    { key: 'atk', label: 'UZBRUKUMS', value: String(weapon.damage), info: 'Bāzes bojājums vienam ieroča sitienam — pirms kombo un zvaigžņu bonusiem.' },
    { key: 'speed', label: 'ĀTRUMS', value: character.moveSpeed.toFixed(1), info: 'Pārvietošanās ātrums pa karti.' },
    { key: 'interval', label: 'UZBR. INTERVĀLS', value: `${weapon.cooldownSeconds.toFixed(2)}s`, info: 'Laiks starp diviem uzbrukumiem. Mazāks skaitlis = biežāki sitieni.' },
    { key: 'regen', label: 'REĢENERĀCIJA', value: `${character.healthRegen}/s`, info: 'Dzīvība, ko varonis pats atjauno katru sekundi.' },
  ];
  const openStatRow = infoStats.find(row => row.key === openStat) ?? null;
  const owned = ownedCharacterIds.has(characterId);
  const unlocked = constellationById[characterId] ?? 0; // ceiling earned from pulls
  const activated = activatedById[characterId] ?? unlocked; // stars currently on
  const transcendLevel = transcendById[characterId] ?? 0; // installed levels past C6
  const bonuses = constellationBonuses(character);

  // Transcend install gate — client UX only; the transcendCharacter reducer is authoritative.
  // Cost curve is nextLevel (never client-derived beyond TRANSCEND_SHARD_COST).
  const belowC6 = unlocked < 6;
  const atTranscendCap = transcendLevel >= MAX_TRANSCEND_LEVEL;
  const nextTranscendLevel = transcendLevel + 1;
  const transcendCost = TRANSCEND_SHARD_COST(nextTranscendLevel);
  const canTranscend = owned && !belowC6 && !atTranscendCap && transcendShards >= transcendCost;
  // Two-step confirm is armed only while it stays valid for THIS character.
  const confirmingTranscend = confirmingTranscendId === characterId && canTranscend;
  const shardShortfall = Math.max(0, transcendCost - transcendShards);

  // Transcend stat preview — the delta each level adds ON TOP of constellations.
  // Damage applies to everyone; healing only to party healers (healSpecFor).
  const isHealer = healSpecFor(characterId).type !== 'none';
  const pct = (v: number) => Math.round(v * 100);
  const dmgBonusNow = pct(transcendLevel * TRANSCEND_DAMAGE_STEP);
  const dmgBonusNext = pct(nextTranscendLevel * TRANSCEND_DAMAGE_STEP);
  const healBonusNow = pct(transcendLevel * TRANSCEND_HEAL_STEP);
  const healBonusNext = pct(nextTranscendLevel * TRANSCEND_HEAL_STEP);
  const dmgStepPct = pct(TRANSCEND_DAMAGE_STEP);
  const healStepPct = pct(TRANSCEND_HEAL_STEP);
  // A preview shows a "→ next" only when another level is actually reachable.
  const showTranscendNext = !belowC6 && !atTranscendCap;
  const transcendStats = [
    { label: 'Bojājums', now: dmgBonusNow, next: dmgBonusNext, step: dmgStepPct },
    ...(isHealer
      ? [{ label: 'Dziedināšana', now: healBonusNow, next: healBonusNext, step: healStepPct }]
      : []),
  ];

  // Only owned characters appear here (menu + swipe order).
  const ownedList = CHARACTER_LIST.filter(entry => ownedCharacterIds.has(entry.id));
  const order = ownedList.map(entry => entry.id);
  const viewIndex = order.indexOf(characterId);
  const step = (delta: number) => {
    const next = order[(viewIndex + delta + order.length) % order.length];
    setOpenResist(null);
    onView(next);
  };

  const onTouchStart = (event: React.TouchEvent) => {
    touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = event.changedTouches[0].clientX - touchStart.current.x;
    const dy = event.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    // Only a clearly horizontal swipe flips characters — a vertical scroll of the
    // tab list (even one that drifts sideways) must not change who's shown.
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.8) {
      step(dx < 0 ? 1 : -1);
    }
  };

  return (
    <div
      className="cscreen"
      style={{ '--element-color': element.cssColor } as React.CSSProperties}
    >
      {/* Thumb-reachable close (portrait phones) — mirrors the wish screen FAB. */}
      <button className="cscreen__close-fab" onClick={onClose} aria-label="Aizvērt">
        ✕
      </button>

      <header className="cscreen__topbar">
        <h2 className="cscreen__title">
          {MAIN_MENU.find(entry => entry.id === 'profile')?.label ?? 'VARONIS'}
        </h2>
        {/* Roster selector — scrolls in the header (wheel + drag on desktop). */}
        <nav
          className="cscreen__roster drag-scroll"
          aria-label="Varoņu saraksts"
          ref={rosterScroll.ref as React.RefObject<HTMLElement>}
          {...rosterScroll.handlers}
        >
          {ownedList.map(entry => {
            const entryElement = ELEMENTS[entry.element];
            const selected = entry.id === characterId;
            return (
              <button
                key={entry.id}
                className={`roster-chip ${selected ? 'roster-chip--on' : ''}`}
                style={{ '--element-color': entryElement.cssColor } as React.CSSProperties}
                onClick={() => {
                  setOpenResist(null);
                  onView(entry.id);
                }}
              >
                <span className="roster-chip__ring">
                  <ConstellationRing
                    variant="chip"
                    letter={entry.displayName[0]}
                    unlocked={constellationById[entry.id] ?? 0}
                    activated={activatedById[entry.id] ?? constellationById[entry.id] ?? 0}
                  />
                </span>
                <span className="roster-chip__text">
                  <span className="roster-chip__name">{entry.displayName}</span>
                  <span className="roster-chip__level">Līm. 1</span>
                </span>
                {entry.id === activeCharacterId && <span className="roster-chip__active">●</span>}
              </button>
            );
          })}
        </nav>
        {/* Scarce transcend-shard balance — identical chip to the gacha wallet,
            pinned right of the scrolling roster, read-only from the player row. */}
        <span
          className={`wallet-chip ${shardFlashClass}`.trim()}
          aria-label={`Zvaigžņu šķembas: ${transcendShards}`}
        >
          <span className="gacha__gem">◈</span> {transcendShards}
        </span>
        <button className="cscreen__close" onClick={onClose} aria-label="Aizvērt">
          ✕
        </button>
      </header>

      <div className="cscreen__main">
        {/* Main menu rail (always visible). 'profile' is the current view. */}
        {onOpenMenu && (
          <nav className="cscreen__rail cscreen__rail--main" aria-label="Galvenā izvēlne">
            {MAIN_MENU.map(entry => {
              const isProfile = entry.id === 'profile';
              return (
                <button
                  key={entry.id}
                  className={`rail-tab ${isProfile ? 'rail-tab--on' : ''}`}
                  onClick={() => {
                    if (entry.id !== 'profile') onOpenMenu(entry.id);
                  }}
                  aria-pressed={isProfile}
                >
                  <span className="rail-tab__glyph">{entry.glyph}</span>
                  <span className="rail-tab__label">{entry.label}</span>
                </button>
              );
            })}
          </nav>
        )}

        {/* Sub-rail: the modal's own sections. */}
        <nav className="cscreen__rail cscreen__rail--sub" aria-label="Sadaļas">
          {TABS.map(entry => (
            <button
              key={entry.id}
              className={`rail-tab ${tab === entry.id ? 'rail-tab--on' : ''}`}
              onClick={() => setTab(entry.id)}
              aria-pressed={tab === entry.id}
            >
              <span className="rail-tab__glyph">{entry.glyph}</span>
              <span className="rail-tab__label">{entry.label}</span>
            </button>
          ))}
        </nav>

        {/* Swipeable content: left character portrait, right the active tab. */}
        <div className="cscreen__panel" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {/* Full-bleed card: the spinning character fills it, text overlaid.
              Swipe (or tap a roster chip) to change character — no arrows. */}
          <section className="cchar">
            {/* Būsts orbit now lives in the 3D scene (CharacterPreview), one purple
                shard-diamond per installed level. */}
            <CharacterPreview characterId={character.id} transcendLevel={transcendLevel} />

            {/* One-shot install flourish: remounts on every level-up (keyed by the
                flourish counter) so its star-slams-home burst replays each time. */}
            {transcendFlourish > 0 && (
              <div key={transcendFlourish} className="cchar__burst" aria-hidden="true">
                <span className="cchar__burst-star">◈</span>
                <span className="cchar__burst-ring" />
              </div>
            )}

            <button
              className="cchar__ring"
              onClick={() => setTab('constellation')}
              aria-label={`Zvaigznes: aktīvas ${activated} no ${unlocked}`}
              title={`Aktīvas C${activated} / atbloķētas C${unlocked}`}
            >
              <ConstellationRing
                letter={character.displayName[0]}
                unlocked={unlocked}
                activated={activated}
              />
            </button>
            <div className="cchar__id">
              {/* No card ring here — the big clickable cchar__ring below owns it. */}
              <CharacterIdentity
                character={character}
                className="cident--lg"
                showRole
                transcendLevel={transcendLevel}
                onConClick={() => setTab('constellation')}
                onBoostClick={() => setTab('transcend')}
              />
            </div>
          </section>

          <section className="ctab">
            {tab === 'info' && (
              <div className="ctab__scroll">
                <span className="ctab__section">STATISTIKA · piesit, lai uzzinātu</span>
                <div className="stat-grid">
                  {infoStats.map(row => (
                    <button
                      key={row.key}
                      className={`stat-cell ${openStat === row.key ? 'stat-cell--on' : ''}`}
                      onClick={() => setOpenStat(openStat === row.key ? null : row.key)}
                    >
                      <span className="stat-cell__label">{row.label}</span>
                      <span className="stat-cell__value">{row.value}</span>
                    </button>
                  ))}
                </div>

                <p className="ctab__lore">{loreFor(character.id)}</p>

                {character.resistances && (
                  <div className="ctab__resist">
                    <span className="ctab__section">PRETESTĪBAS · piesit, lai uzzinātu</span>
                    <ul className="resist-row">
                      {Object.entries(character.resistances).map(([channel, multiplier]) => {
                        const percent = Math.round((1 - multiplier) * 100);
                        const open = openResist === channel;
                        return (
                          <li key={channel}>
                            <button
                              className={`resist-chip ${open ? 'resist-chip--on' : ''}`}
                              onClick={() => setOpenResist(open ? null : channel)}
                            >
                              <span className="resist-chip__name">
                                {RESIST_INFO[channel]?.label ?? channel}
                              </span>
                              <span className="resist-chip__value">−{percent}%</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {openResist && (
                      <div className="resist-card">
                        {RESIST_INFO[openResist]?.describe(
                          Math.round(
                            (1 -
                              (character.resistances[
                                openResist as keyof typeof character.resistances
                              ] as number)) *
                              100
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === 'weapon' && (
              <div className="ctab__scroll">
                <span className="ctab__section">IEROCIS</span>
                <div className="weapon-card">
                  <span className="weapon-card__name">{weapon.displayName}</span>
                  <span className="weapon-card__type">
                    {weapon.isRanged ? 'Attālināts' : 'Tuvcīņas'}
                  </span>
                  <div className="stat-grid">
                    <div className="stat-cell">
                      <span className="stat-cell__label">BOJĀJUMS</span>
                      <span className="stat-cell__value">{weapon.damage}</span>
                    </div>
                    <div className="stat-cell">
                      <span className="stat-cell__label">INTERVĀLS</span>
                      <span className="stat-cell__value">{weapon.cooldownSeconds.toFixed(2)}s</span>
                    </div>
                    <div className="stat-cell">
                      <span className="stat-cell__label">DISTANCE</span>
                      <span className="stat-cell__value">{weapon.range.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
                <p className="ctab__soon">
                  Ieroču maiņa un uzlabošana — drīzumā. Katrs varonis pagaidām nēsā savu ieroci.
                </p>
              </div>
            )}

            {tab === 'constellation' && (
              <div className="ctab__scroll">
                <span className="ctab__section">
                  CIEŅA · aktīvas C{activated} / atbloķētas C{unlocked}
                </span>
                <ol className="con-list">
                  {bonuses.map(bonus => {
                    const isUnlocked = bonus.level <= unlocked;
                    const isOn = bonus.level <= activated;
                    // Tapping an active star turns it (and everything above) off;
                    // tapping an unlocked-but-off star activates up to it.
                    const nextLevel = bonus.level === activated ? bonus.level - 1 : bonus.level;
                    return (
                      <li key={bonus.level}>
                        <button
                          className={`con-item ${isOn ? 'con-item--on' : ''} ${
                            isUnlocked ? '' : 'con-item--off'
                          }`}
                          disabled={!owned || !isUnlocked}
                          onClick={() => onSetConstellation(characterId, nextLevel)}
                        >
                          <span className="con-item__badge">C{bonus.level}</span>
                          <span className="con-item__text">
                            <span className="con-item__title">
                              {bonus.title}
                              {isUnlocked ? (isOn ? ' · AKTĪVS' : ' · IZSLĒGTS') : ' · SLĒGTS'}
                            </span>
                            <span className="con-item__effect">{bonus.effect}</span>
                          </span>
                          {isUnlocked && owned && (
                            <span className="con-item__toggle">{isOn ? '●' : '○'}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>

                <p className="ctab__soon">
                  Piesit zvaigzni, lai to ieslēgtu vai izslēgtu. Aktīvās zvaigznes pastiprina varoni;
                  atbloķē vairāk ar dublikātiem no vēlēšanās. Drīzumā zvaigznes dos jaunas spējas.
                </p>
              </div>
            )}

            {tab === 'transcend' && (
              <div className="ctab__scroll">
                {/* ── Būsts altar ─────────────────────────────────────────────
                    Dedicated būsts section: a B1→B10 progress track, a stat
                    preview (current būsts bonus + green delta for the next
                    level), and a two-step confirm install. Purple (--shard)
                    energy sets it apart from the gold cieņa stars.
                    Client gate is UX only — the transcendCharacter reducer is
                    authoritative. */}
                <section className="transcend" aria-label="Būsts">
                  <header className="transcend__head">
                    <span className="transcend__kicker">Būsts</span>
                    <span className="transcend__level">
                      B{transcendLevel}
                      <em> / {MAX_TRANSCEND_LEVEL}</em>
                    </span>
                  </header>

                  <ol className="transcend__track" aria-hidden="true">
                    {Array.from({ length: MAX_TRANSCEND_LEVEL }, (_, i) => {
                      const lvl = i + 1;
                      const filled = lvl <= transcendLevel;
                      const isNext = lvl === nextTranscendLevel && showTranscendNext;
                      return (
                        <li
                          key={lvl}
                          className={`transcend__pip${filled ? ' transcend__pip--on' : ''}${
                            isNext ? ' transcend__pip--next' : ''
                          }`}
                        />
                      );
                    })}
                  </ol>

                  <div className="transcend__body">
                    <div className="transcend__preview">
                      {transcendStats.map(stat => (
                        <div className="tstat" key={stat.label}>
                          <span className="tstat__label">{stat.label}</span>
                          <span className="tstat__values">
                            <span className="tstat__base">+{stat.now}%</span>
                            {showTranscendNext && (
                              <>
                                <span className="tstat__arrow">→</span>
                                <span className="tstat__next">+{stat.next}%</span>
                                <span className="tstat__delta">+{stat.step}%</span>
                              </>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="transcend__action">
                      {belowC6 ? (
                        <div className="transcend__gate">
                          <span className="transcend__gate-title">Vajadzīgs C6</span>
                          <span className="transcend__gate-note">
                            Atbloķē visas 6 cieņas zvaigznes, lai sāktu būstu.
                          </span>
                        </div>
                      ) : atTranscendCap ? (
                        <div className="transcend__gate transcend__gate--max">
                          <span className="transcend__gate-title">
                            Maksimums · B{MAX_TRANSCEND_LEVEL}
                          </span>
                          <span className="transcend__gate-note">
                            Pilns būsts — stiprāk vairs nevar. Leģenda.
                          </span>
                        </div>
                      ) : confirmingTranscend ? (
                        <div className="transcend__confirm">
                          <span className="transcend__confirm-q">
                            Uzlabot uz <strong>B{nextTranscendLevel}</strong> par {transcendCost} ◈?
                          </span>
                          <div className="transcend__confirm-row">
                            <button
                              className="transcend__btn transcend__btn--yes"
                              onClick={() => {
                                onTranscend(characterId);
                                setConfirmingTranscendId(null);
                              }}
                              aria-label={`Apstiprināt būstu uz B${nextTranscendLevel} par ${transcendCost} zvaigžņu šķembas`}
                            >
                              Jā, būsts!
                            </button>
                            <button
                              className="transcend__btn transcend__btn--no"
                              onClick={() => setConfirmingTranscendId(null)}
                              aria-label="Atcelt"
                              title="Atcelt"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : canTranscend ? (
                        <button
                          className="transcend__btn transcend__btn--install"
                          onClick={() => setConfirmingTranscendId(characterId)}
                          aria-label={`Būsts ${character.displayName} uz B${nextTranscendLevel}, maksā ${transcendCost} zvaigžņu šķembas`}
                        >
                          <span className="transcend__btn-label">
                            + Būsts · B{nextTranscendLevel}
                          </span>
                          <span className="transcend__btn-cost">{transcendCost} ◈</span>
                        </button>
                      ) : (
                        <div className="transcend__gate transcend__gate--short">
                          <span className="transcend__gate-title">
                            Vajag vēl {shardShortfall} ◈
                          </span>
                          <span className="transcend__gate-note">
                            B{nextTranscendLevel} maksā {transcendCost} ◈ · tev ir {transcendShards} ◈.
                            Nogalini, vāc šķembas!
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="transcend__note">
                    Katrs būsts = <strong>+{dmgStepPct}% bojājuma</strong>
                    {isHealer && (
                      <>
                        {' '}un <strong>+{healStepPct}% dziedināšanas</strong>
                      </>
                    )}
                    , virs cieņas zvaigznēm. Jo augstāk kāp, jo stiprāks kļūsti — līdz{' '}
                    <em>B{MAX_TRANSCEND_LEVEL}</em>. Cena aug ar līmeni: sāc lēti (B1 = 1 ◈),
                    tad vāc šķembas un dodies uz maksimumu.
                  </p>
                </section>
              </div>
            )}

            {/* Stat explanation — absolutely positioned, so opening it never
                reflows the grid underneath. Scrim catches an outside tap. */}
            {tab === 'info' && openStatRow && (
              <>
                <button
                  className="stat-pop__scrim"
                  onClick={() => setOpenStat(null)}
                  aria-label="Aizvērt"
                />
                <div className="stat-pop" role="dialog">
                  <div className="stat-pop__head">
                    <span className="stat-pop__label">{openStatRow.label}</span>
                    <span className="stat-pop__value">{openStatRow.value}</span>
                  </div>
                  <p className="stat-pop__text">{openStatRow.info}</p>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
