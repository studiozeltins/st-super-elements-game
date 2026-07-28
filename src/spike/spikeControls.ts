/**
 * On-screen control bar for the WebGPU feasibility spike (waterpro-spike.html).
 *
 * Every control just rewrites a query param and reloads — no live node-graph
 * rebuild. That is deliberate: the spike graph is wired once at boot, and a
 * reload is the robust way to flip a shape/tone/backend/camera without a
 * half-rebuilt post chain. Lets the go/no-go be driven from the page (incl.
 * remotely on prod) instead of hand-editing the URL.
 *
 * Each button carries a hover tooltip (`title`) saying what it does in plain
 * terms AND what to look for, because the settings are not self-evident.
 *
 * The STAGE toggle is the diagnostic lever: it swaps `postProcessing.outputNode`
 * between pipeline stages so a broken frame can be localised —
 *   scene    → raw render (beach+water+sky), NO post nodes
 *   comp     → water fx + sky composite, BEFORE bloom/pixel
 *   nofilter → composite (+bloom), pixel filter + rim SKIPPED
 *   full     → everything (the shipped look)
 *
 * Throwaway spike glue: plain DOM, nothing in src/game imports it.
 */

export type SpikeStage = "scene" | "comp" | "nofilter" | "full";
export type SpikeView = "shore" | "inland" | "top";

const S = () =>
  typeof window === "undefined" ? "" : window.location.search;

/** Read the pipeline stage (`?stage=`), default `full`. */
export function stageFromQuery(): SpikeStage {
  const m = /stage=(scene|comp|nofilter|full)/.exec(S());
  return (m?.[1] as SpikeStage) ?? "full";
}

/** Sun-facing rim on? `?outline=0` turns it off (default on). */
export function outlineEnabledFromQuery(): boolean {
  return !/outline=0/.test(S());
}

/** Chunky-pixel edge length in device px (`?px=N`), default 4. `px=1` = off. */
export function pixelSizeFromQuery(): number {
  const m = /px=(\d+)/.exec(S());
  const n = m ? parseInt(m[1], 10) : 4;
  return Number.isFinite(n) && n >= 1 ? n : 4;
}

/** Camera framing preset (`?view=`), default `shore`. */
export function viewFromQuery(): SpikeView {
  const m = /view=(shore|inland|top)/.exec(S());
  return (m?.[1] as SpikeView) ?? "shore";
}

/**
 * Water-motion speed multiplier applied to the dt fed into `water.update`
 * (`?waves=calm|slow|normal`). Lower = slower waves + gentler wake. Default 1.
 */
export function waterSpeedFromQuery(): number {
  if (/waves=slow/.test(S())) return 0.2;
  if (/waves=calm/.test(S())) return 0.4;
  return 1;
}

interface Toggle {
  label: string;
  /** Tooltip on the group label — the overall "what is this". */
  tip: string;
  /** The active option's key for highlighting. */
  current: string;
  /** [buttonLabel, paramsToSet, tooltip] — null value deletes the param. */
  options: Array<[string, Record<string, string | null>, string]>;
}

function reloadWith(patch: Record<string, string | null>): void {
  const p = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) p.delete(k);
    else p.set(k, v);
  }
  window.location.search = p.toString();
}

/** Build + mount the fixed control bar. Call once after boot. */
export function mountSpikeControls(): void {
  const q = new URLSearchParams(S());
  const stage = stageFromQuery();
  const shape = /shape=whole/.test(S()) ? "whole" : "final";
  const tone = /tone=(neutral|none|off)/.test(S()) ? "neutral" : "aces";
  const backend = /forceWebGL=1/.test(S()) ? "webgl" : "webgpu";
  const derisk = /[?&]derisk=1(?:&|$)/.test(S()) ? "on" : "off";
  const outline = outlineEnabledFromQuery() ? "on" : "off";
  const px = String(pixelSizeFromQuery());
  const view = viewFromQuery();
  const waves = /waves=slow/.test(S())
    ? "slow"
    : /waves=calm/.test(S())
      ? "calm"
      : "normal";

  const toggles: Toggle[] = [
    {
      label: "stage",
      tip: "DIAGNOSTIC: taps the render pipeline at different points so you can find WHERE it breaks. Flip through scene→comp→nofilter→full and note where the rainbow/magenta first appears.",
      current: stage,
      options: [
        [
          "scene",
          { stage: "scene" },
          "Raw 3D render only — no water fx, no sky, no pixel filter. LOOK: is the sand plain/correct here? If it's already wrong, the bug is the base render, not the filter.",
        ],
        [
          "comp",
          { stage: "comp" },
          "Water + sky composited, before pixel filter. LOOK: does the rainbow appear now? Then it's the water/sky pass, not the pixel node.",
        ],
        [
          "nofilter",
          { stage: "nofilter" },
          "Full scene but pixel filter + rim SKIPPED. LOOK: clean here but broken on 'full'? Then the bug is the pixel/outline node.",
        ],
        [
          "full",
          { stage: null },
          "Everything, the shipped look (default). This is what the final game would show.",
        ],
      ],
    },
    {
      label: "view",
      tip: "Camera framing. Use to get more dry land vs open sea.",
      current: view,
      options: [
        [
          "shore",
          { view: null },
          "Camera at the waterline (default). Roughly half land, half sea.",
        ],
        [
          "inland",
          { view: "inland" },
          "Pans toward the island centre + closer. LOOK: MORE dry sand/grass, LESS water — use this if the sea floods the view.",
        ],
        [
          "top",
          { view: "top" },
          "Steeper, more top-down angle (closer to the game's overhead camera).",
        ],
      ],
    },
    {
      label: "waves",
      tip: "How fast the water animates.",
      current: waves,
      options: [
        ["normal", { waves: null }, "Default Water Pro wave speed."],
        ["calm", { waves: "calm" }, "~40% speed — slower, gentler swell."],
        ["slow", { waves: "slow" }, "~20% speed — very slow, easiest to inspect the surface."],
      ],
    },
    {
      label: "tone",
      tip: "Colour grading of the whole image.",
      current: tone,
      options: [
        [
          "aces",
          { tone: null },
          "Filmic tone-mapping (Water Pro default). Can tint the flat pixel palette. LOOK: is there a magenta/pink cast?",
        ],
        [
          "neutral",
          { tone: "neutral" },
          "No tone-mapping, raw colours. LOOK: if the magenta cast DISAPPEARS here, ACES was the cause.",
        ],
      ],
    },
    {
      label: "shape",
      tip: "Which pixel-art resolution strategy (SPIKE-02's core A/B). Effect is SUBTLE — look at edge blockiness.",
      current: shape,
      options: [
        [
          "final",
          { shape: null },
          "Crisp rim first, then pixelate the whole image last (default). Sharper edges.",
        ],
        [
          "whole",
          { shape: "whole" },
          "Pixelate the whole image first, then rim. Chunkier, more retro. LOOK: blockier outlines vs 'final'.",
        ],
      ],
    },
    {
      label: "rim",
      tip: "The sun-facing outline (the game's signature edge light).",
      current: outline,
      options: [
        [
          "on",
          { outline: null },
          "Outline ON (default). LOOK: the bright edge band along shorelines/rocks facing the sun.",
        ],
        [
          "off",
          { outline: "0" },
          "Outline OFF. LOOK: edges go plain. If the rainbow band vanishes with rim off, the outline node is the bug.",
        ],
      ],
    },
    {
      label: "px",
      tip: "Chunky-pixel size. Bigger = blockier retro look.",
      current: px,
      options: [
        ["1", { px: "1" }, "1px = pixelation OFF (smooth). Baseline to compare against."],
        ["2", { px: "2" }, "Fine pixels."],
        ["4", { px: null }, "Default block size."],
        ["8", { px: "8" }, "Very blocky."],
      ],
    },
    {
      label: "backend",
      tip: "Which GPU path renders. For the go/no-go you need a FPS number from EACH.",
      current: backend,
      options: [
        [
          "webgpu",
          { forceWebGL: null },
          "Full WebGPU compute path (default). LOOK: HUD should say backend=WebGPU; note the FPS.",
        ],
        [
          "webgl",
          { forceWebGL: "1" },
          "Forced WebGL2 fallback (no spray, simpler water). LOOK: HUD backend=WebGL2; note this FPS — it's the plain-http LAN players' tier.",
        ],
      ],
    },
    {
      label: "derisk",
      tip: "Turns on the extra reactive-water demo (SPIKE-04).",
      current: derisk,
      options: [
        [
          "off",
          { derisk: null },
          "Clean water (default) — use this when JUDGING the pixel-art look.",
        ],
        [
          "on",
          { derisk: "1" },
          "Adds a pulsing glow patch + circling wake ripples + spray. LOOK: proof the lit-water + projectile ripples are viable.",
        ],
      ],
    },
  ];

  const bar = document.createElement("div");
  bar.style.cssText = [
    "position:fixed",
    "top:8px",
    "left:8px",
    "z-index:9999",
    "display:flex",
    "flex-wrap:wrap",
    "gap:6px 12px",
    "align-items:center",
    "font:12px/1.4 ui-monospace,Menlo,Consolas,monospace",
    "color:#e6f6ff",
    "background:rgba(10,18,26,0.72)",
    "backdrop-filter:blur(6px)",
    "-webkit-backdrop-filter:blur(6px)",
    "border:1px solid rgba(134,226,255,0.25)",
    "padding:8px 10px",
    "max-width:calc(100vw - 16px)",
    "user-select:none",
  ].join(";");

  // Header: what the bar is + how to read it. Tap-and-hold shows tooltips on
  // touch devices too (the title attribute); desktop = hover.
  const head = document.createElement("div");
  head.textContent =
    "spike controls — tap a button to apply (page reloads). Hover/long-press any button for what it does + what to look for.";
  head.style.cssText =
    "flex-basis:100%;opacity:0.7;margin-bottom:2px;font-size:11px";
  bar.appendChild(head);

  for (const t of toggles) {
    const grp = document.createElement("span");
    grp.style.cssText = "display:inline-flex;gap:4px;align-items:center";
    grp.title = t.tip;
    const lab = document.createElement("span");
    lab.textContent = t.label;
    lab.style.cssText = "opacity:0.6;margin-right:2px;cursor:help";
    lab.title = t.tip;
    grp.appendChild(lab);
    for (const [name, patch, tip] of t.options) {
      const b = document.createElement("button");
      b.textContent = name;
      b.title = tip;
      const active = t.current === name;
      b.style.cssText = [
        "cursor:pointer",
        "padding:2px 7px",
        "border:1px solid " +
          (active ? "#86e2ff" : "rgba(134,226,255,0.3)"),
        "background:" + (active ? "rgba(134,226,255,0.22)" : "transparent"),
        "color:" + (active ? "#bff0ff" : "#9fc4d6"),
        "font:inherit",
      ].join(";");
      b.addEventListener("click", () => reloadWith(patch));
      grp.appendChild(b);
    }
    bar.appendChild(grp);
  }

  // Keep the query string visible so a screenshot self-documents its settings.
  const url = document.createElement("span");
  url.textContent = q.toString() ? "?" + q.toString() : "(defaults)";
  url.style.cssText = "opacity:0.5;margin-left:4px;flex-basis:100%";
  bar.appendChild(url);

  document.body.appendChild(bar);
}
