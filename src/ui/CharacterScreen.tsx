import { useRef, useState } from 'react';
import { CHARACTER_LIST, CHARACTERS } from '../game/data/characters';
import { ELEMENTS } from '../game/data/elements';
import { WEAPONS } from '../game/data/weapons';
import { constellationBonuses } from '../game/data/constellations';
import { loreFor } from '../game/data/characterLore';
import { CharacterPreview } from './CharacterPreview';
import { ConstellationRing } from './ConstellationRing';
import { CharacterIdentity } from './CharacterIdentity';
import { useDragScroll } from './useDragScroll';
import { MAIN_MENU } from './menu';

type Tab = 'info' | 'weapon' | 'constellation';

interface CharacterScreenProps {
  characterId: string;
  ownedCharacterIds: Set<string>;
  activeCharacterId: string;
  /** Unlocked constellation ceiling per character (from duplicate pulls). */
  constellationById: Record<string, number>;
  /** Currently-active stars per character (manual). Absent = full ceiling active. */
  activatedById: Record<string, number>;
  /** Change which character is being viewed (roster tap / swipe). */
  onView(characterId: string): void;
  /** Set how many unlocked stars are active for a character. */
  onSetConstellation(characterId: string, level: number): void;
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
  { id: 'constellation', label: 'ZVAIGZNES', glyph: '✦' },
];

const SWIPE_THRESHOLD = 55;

export function CharacterScreen({
  characterId,
  ownedCharacterIds,
  activeCharacterId,
  constellationById,
  activatedById,
  onView,
  onSetConstellation,
  onOpenMenu,
  onClose,
}: CharacterScreenProps) {
  const [tab, setTab] = useState<Tab>('info');
  const [openResist, setOpenResist] = useState<string | null>(null);
  const [openStat, setOpenStat] = useState<string | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const rosterScroll = useDragScroll();

  const character = CHARACTERS[characterId];
  if (!character) return null;

  const element = ELEMENTS[character.element];
  const weapon = WEAPONS[character.weapon];

  // Info-tab stats as data so the grid and the tap-to-explain popover share one source.
  const infoStats: { key: string; label: string; value: string; info: string }[] = [
    { key: 'level', label: 'LĪMENIS', value: '1', info: 'Varoņa līmenis. Augstāki līmeņi vēlāk dos vairāk dzīvības un uzbrukuma.' },
    { key: 'hp', label: 'DZĪVĪBA', value: String(character.maxHealth), info: 'Maksimālā dzīvība. Kad tā sasniedz 0, varonis krīt un atdzimst drošajā zonā.' },
    { key: 'atk', label: 'UZBRUKUMS', value: String(weapon.damage), info: 'Bāzes bojājums vienam ieroča sitienam — pirms kombo un zvaigžņu bonusiem.' },
    { key: 'speed', label: 'ĀTRUMS', value: character.moveSpeed.toFixed(1), info: 'Pārvietošanās ātrums pa karti.' },
    { key: 'interval', label: 'UZBR. INTERVĀLS', value: `${weapon.cooldownSeconds.toFixed(2)}s`, info: 'Laiks starp diviem uzbrukumiem. Mazāks skaitlis = biežāki sitieni.' },
    { key: 'regen', label: 'REĢENERĀCIJA', value: `${character.healthRegen}/s`, info: 'Dzīvība, ko varonis pats atjauno katru sekundi.' },
  ];
  const openStatRow = infoStats.find(row => row.key === openStat) ?? null;
  const owned = ownedCharacterIds.has(characterId);
  const isActive = characterId === activeCharacterId;
  const unlocked = constellationById[characterId] ?? 0; // ceiling earned from pulls
  const activated = activatedById[characterId] ?? unlocked; // stars currently on
  const bonuses = constellationBonuses(character);

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
        <h2 className="cscreen__title">VAROŅI</h2>
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
            <CharacterPreview characterId={character.id} />
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
              <CharacterIdentity character={character} className="cident--lg" />
              {isActive && <span className="cchar__active-tag">AKTĪVS VARONIS</span>}
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
                  ZVAIGZNES · aktīvas C{activated} / atbloķētas C{unlocked}
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
