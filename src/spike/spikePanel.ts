/**
 * Live control panel for the WebGPU spike — sliders + preset buttons that mutate
 * the running scene WITHOUT a reload (the top control bar stays reload-based for
 * things that need a graph/mesh rebuild). Lets the go/no-go be explored
 * gradually: drag the day-cycle, wave height, opacity, colour, pixel size, and
 * click the vendored Water/Sky presets.
 *
 * Everything is guarded — the WebGL2 fallback exposes a thinner surface, so a
 * missing accessor must never crash the spike. Nothing in src/game imports this.
 */
import type { WaterSystem } from "../vendor/threejs-water-pro";
import { getPresetParams } from "../vendor/threejs-water-pro";
import type { SkySystem } from "../vendor/threejs-sky-pro";
import { PRESETS as SKY_PRESETS } from "../vendor/threejs-sky-pro";
import { FAVORITE_WATER } from "./favoritePreset";

export const SKY_NAMES = [
  "partlyCloudy",
  "stunningSunset",
  "thunderstorm",
  "stormyEvening",
  "moonlitNight",
  "fluffy",
  "hazy",
  "pixar",
] as const;

export const WATER_NAMES = [
  "arctic",
  "blackFlag",
  "dusk",
  "foggy",
  "moonlit",
  "seaOfThieves",
  "storm",
  "sunset",
] as const;

const S = () =>
  typeof window === "undefined" ? "" : window.location.search;

/** `?water=<preset>` boot override (validated), else null. */
export function waterPresetFromQuery(): string | null {
  const m = /water=([a-zA-Z]+)/.exec(S());
  return m && (WATER_NAMES as readonly string[]).includes(m[1]) ? m[1] : null;
}
/** `?sky=<preset>` boot override (validated), else null. */
export function skyPresetFromQuery(): string | null {
  const m = /sky=([a-zA-Z]+)/.exec(S());
  return m && (SKY_NAMES as readonly string[]).includes(m[1]) ? m[1] : null;
}
/** `?time=0..1` boot override, else null. */
export function timeFromQuery(): number | null {
  const m = /time=([0-9]*\.?[0-9]+)/.exec(S());
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;
}

export interface SpikePanelRefs {
  water: WaterSystem;
  sky: SkySystem;
  /** The pixel-size uniform node (mutate `.value`). */
  pixelSize: { value: number };
  /** Mutable water-animation-speed multiplier the frame loop reads. */
  speed: { value: number };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Absorption coefficient (per metre) → uniform grey hex (#0a≈0.04/m). */
function coeffToHex(c: number): string {
  const b = Math.min(255, Math.max(1, Math.round(c * 255)));
  const h = b.toString(16).padStart(2, "0");
  return "#" + h + h + h;
}

function tryGet<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn();
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

/**
 * Read a FINITE number or fall back. Water Pro accessors (e.g. `waves.amplitude`)
 * can return a uniform wrapper rather than a plain number on some backends —
 * feeding that to a slider crashed boot with `v.toFixed is not a function`.
 */
function numGet(fn: () => unknown, fallback: number): number {
  try {
    const v = fn();
    const n =
      typeof v === "number"
        ? v
        : typeof (v as any)?.value === "number"
          ? (v as any).value
          : Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function timeLabel(v: number): string {
  if (v < 0.06 || v > 0.94) return "midnight";
  if (v < 0.32) return "sunrise";
  if (v < 0.44) return "morning";
  if (v < 0.56) return "noon";
  if (v < 0.68) return "afternoon";
  if (v < 0.82) return "sunset";
  return "night";
}

const BTN =
  "cursor:pointer;padding:3px 8px;border:1px solid rgba(134,226,255,0.3);background:transparent;color:#bff0ff;font:inherit;border-radius:2px";

function section(title: string): HTMLDivElement {
  const d = document.createElement("div");
  d.style.cssText = "margin-top:10px";
  const h = document.createElement("div");
  h.textContent = title;
  h.style.cssText =
    "opacity:0.55;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px";
  d.appendChild(h);
  return d;
}

function sliderRow(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  onInput: (v: number) => void,
  fmt: (v: number) => string = (v) => Number(v).toFixed(2),
): HTMLDivElement {
  // Guard: a non-finite initial value (some backend accessors return wrappers)
  // must not reach fmt()/the input, or boot throws.
  value = Number.isFinite(value) ? value : min;
  const row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center;gap:6px;margin:3px 0";
  const lab = document.createElement("span");
  lab.textContent = label;
  lab.style.cssText = "flex:0 0 66px;opacity:0.8";
  const val = document.createElement("span");
  val.textContent = fmt(value);
  val.style.cssText = "flex:0 0 62px;text-align:right;opacity:0.7";
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.style.cssText = "flex:1;accent-color:#86e2ff;min-width:80px";
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    val.textContent = fmt(v);
    onInput(v);
  });
  row.append(lab, input, val);
  return row;
}

function presetButtons(
  names: readonly string[],
  onClick: (name: string) => void,
): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:4px";
  for (const n of names) {
    const b = document.createElement("button");
    b.textContent = n;
    b.style.cssText = BTN + ";font-size:11px";
    b.addEventListener("click", () => onClick(n));
    wrap.appendChild(b);
  }
  return wrap;
}

/**
 * Build the live panel. When `parent` is given it renders inline (for the
 * bottom-sheet menu); otherwise it floats fixed on the right.
 */
export function mountSpikePanel(
  refs: SpikePanelRefs,
  parent?: HTMLElement,
): void {
  const { water, sky } = refs;

  const embedded = !!parent;
  const panel = document.createElement("div");
  panel.style.cssText = (
    embedded
      ? [
          "font:12px/1.35 ui-monospace,Menlo,Consolas,monospace",
          "color:#e6f6ff",
        ]
      : [
          "position:fixed",
          "top:64px",
          "right:8px",
          "z-index:9999",
          "width:270px",
          "max-height:calc(100vh - 80px)",
          "overflow:auto",
          "font:12px/1.35 ui-monospace,Menlo,Consolas,monospace",
          "color:#e6f6ff",
          "background:rgba(10,18,26,0.78)",
          "backdrop-filter:blur(7px)",
          "-webkit-backdrop-filter:blur(7px)",
          "border:1px solid rgba(134,226,255,0.25)",
          "padding:10px 12px",
        ]
  ).join(";");

  // --- nav + quick looks ---
  const nav = section("navigate");
  const navRow = document.createElement("div");
  navRow.style.cssText = "display:flex;flex-wrap:wrap;gap:4px";
  const mkLink = (label: string, href: string) => {
    const a = document.createElement("a");
    a.textContent = label;
    a.href = href;
    a.style.cssText = BTN + ";text-decoration:none";
    return a;
  };
  navRow.append(
    mkLink("← game", "/"),
    mkLink("reset", "waterpro-spike.html"),
    mkLink("stylised+dusk", "waterpro-spike.html?sea=stylised&swell=calm&shelf=gentle&water=dusk&sky=stunningSunset&time=0.75"),
    mkLink("night", "waterpro-spike.html?sea=stylised&water=moonlit&sky=moonlitNight&time=0.0"),
  );
  nav.appendChild(navRow);
  panel.appendChild(nav);

  // --- day / night ---
  const day = section("day cycle");
  const t0 = numGet(() => (sky as any).timeOfDay.time.value, 0.5);
  day.appendChild(
    sliderRow(
      "time",
      0,
      1,
      0.01,
      t0,
      (v) => {
        try {
          (sky as any).timeOfDay.time.value = v;
        } catch {
          /* fallback */
        }
      },
      (v) => `${v.toFixed(2)} ${timeLabel(v)}`,
    ),
  );
  const autoRow = document.createElement("div");
  autoRow.style.cssText = "margin:3px 0";
  const autoBtn = document.createElement("button");
  autoBtn.textContent = "▶ auto-advance (60s/day)";
  autoBtn.style.cssText = BTN + ";width:100%";
  let running = false;
  autoBtn.addEventListener("click", () => {
    running = !running;
    try {
      (sky as any).timeOfDay.autoAdvanceSecondsPerDay = running ? 60 : 0;
    } catch {
      /* fallback */
    }
    autoBtn.textContent = running ? "⏸ pause cycle" : "▶ auto-advance (60s/day)";
  });
  autoRow.appendChild(autoBtn);
  day.appendChild(autoRow);
  panel.appendChild(day);

  // --- water sliders ---
  const w = section("water");
  const amp0 = numGet(() => (water as any).waves.amplitude, 1);
  w.appendChild(
    sliderRow("wave ht", 0, 1.2, 0.02, amp0, (v) => {
      try {
        (water as any).waves.amplitude = v;
      } catch {
        /* locked */
      }
    }),
  );
  w.appendChild(
    sliderRow("speed", 0, 2, 0.05, refs.speed.value, (v) => {
      refs.speed.value = v;
    }),
  );
  w.appendChild(
    sliderRow(
      "opacity",
      0.02,
      1.2,
      0.02,
      0.16,
      (v) => {
        try {
          (water as any).color.absorptionColor = coeffToHex(v);
        } catch {
          /* not exposed */
        }
      },
      (v) => v.toFixed(2),
    ),
  );
  // colour
  const colRow = document.createElement("div");
  colRow.style.cssText = "display:flex;align-items:center;gap:6px;margin:3px 0";
  const colLab = document.createElement("span");
  colLab.textContent = "colour";
  colLab.style.cssText = "flex:0 0 66px;opacity:0.8";
  const col = document.createElement("input");
  col.type = "color";
  col.value =
    "#" + tryGet(() => (water as any).color.waterColor.getHexString(), "0b3f57");
  col.style.cssText = "flex:1;height:22px;background:transparent;border:0";
  col.addEventListener("input", () => {
    try {
      (water as any).color.waterColor = col.value;
    } catch {
      /* not exposed */
    }
  });
  colRow.append(colLab, col);
  w.appendChild(colRow);
  panel.appendChild(w);

  // --- pixel ---
  const px = section("pixel size");
  px.appendChild(
    sliderRow(
      "px",
      1,
      12,
      1,
      refs.pixelSize.value,
      (v) => {
        refs.pixelSize.value = v;
      },
      (v) => String(Math.round(v)),
    ),
  );
  panel.appendChild(px);

  // --- presets ---
  const sp = section("sky preset (click)");
  sp.appendChild(
    presetButtons(SKY_NAMES, (n) => {
      const keep = tryGet(() => (sky as any).timeOfDay.time.value as number, 0.5);
      Promise.resolve((sky as any).applyPreset((SKY_PRESETS as any)[n]))
        .then(() => {
          try {
            (sky as any).timeOfDay.time.value = keep;
          } catch {
            /* keep time */
          }
        })
        .catch(() => {});
    }),
  );
  panel.appendChild(sp);

  const wp = section("water preset (click)");
  const favBtn = document.createElement("button");
  favBtn.textContent = "★ favourite";
  favBtn.style.cssText = BTN + ";font-size:11px;margin-bottom:4px";
  favBtn.addEventListener("click", () => {
    try {
      (water as any).loadPreset(FAVORITE_WATER);
    } catch {
      /* ignore */
    }
  });
  wp.appendChild(favBtn);
  wp.appendChild(
    presetButtons(WATER_NAMES, (n) => {
      try {
        (water as any).loadPreset(getPresetParams(n as any));
      } catch {
        /* ignore */
      }
    }),
  );
  panel.appendChild(wp);

  (parent ?? document.body).appendChild(panel);
}
