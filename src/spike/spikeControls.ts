/**
 * On-screen control bar for the WebGPU feasibility spike (waterpro-spike.html).
 *
 * Every control just rewrites a query param and reloads — no live node-graph
 * rebuild. That is deliberate: the spike graph is wired once at boot, and a
 * reload is the robust way to flip a shape/tone/backend without half-rebuilt
 * post chains. Lets the go/no-go be driven from the page (incl. remotely on
 * prod) instead of hand-editing the URL.
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

interface Toggle {
  label: string;
  /** The active option's key for highlighting. */
  current: string;
  /** [buttonLabel, paramsToSet] — null value deletes the param. */
  options: Array<[string, Record<string, string | null>]>;
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

  const toggles: Toggle[] = [
    {
      label: "shape",
      current: shape,
      options: [
        ["final", { shape: null }],
        ["whole", { shape: "whole" }],
      ],
    },
    {
      label: "tone",
      current: tone,
      options: [
        ["aces", { tone: null }],
        ["neutral", { tone: "neutral" }],
      ],
    },
    {
      label: "backend",
      current: backend,
      options: [
        ["webgpu", { forceWebGL: null }],
        ["webgl", { forceWebGL: "1" }],
      ],
    },
    {
      label: "stage",
      current: stage,
      options: [
        ["full", { stage: null }],
        ["nofilter", { stage: "nofilter" }],
        ["comp", { stage: "comp" }],
        ["scene", { stage: "scene" }],
      ],
    },
    {
      label: "rim",
      current: outline,
      options: [
        ["on", { outline: null }],
        ["off", { outline: "0" }],
      ],
    },
    {
      label: "px",
      current: px,
      options: [
        ["1", { px: "1" }],
        ["2", { px: "2" }],
        ["4", { px: null }],
        ["8", { px: "8" }],
      ],
    },
    {
      label: "derisk",
      current: derisk,
      options: [
        ["off", { derisk: null }],
        ["on", { derisk: "1" }],
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

  for (const t of toggles) {
    const grp = document.createElement("span");
    grp.style.cssText = "display:inline-flex;gap:4px;align-items:center";
    const lab = document.createElement("span");
    lab.textContent = t.label;
    lab.style.cssText = "opacity:0.6;margin-right:2px";
    grp.appendChild(lab);
    for (const [name, patch] of t.options) {
      const b = document.createElement("button");
      b.textContent = name;
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
  url.style.cssText = "opacity:0.5;margin-left:4px";
  bar.appendChild(url);

  document.body.appendChild(bar);
}
