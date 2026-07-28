/**
 * On-screen perf HUD for the WebGPU feasibility spike (SPIKE-03).
 *
 * Draws a live rolling-average FPS number plus the resolved backend
 * (`renderer.backend.isWebGPUBackend`), `water.backend`, and whether
 * `water.spray` exists — all ON TOP of the canvas so a screenshot
 * self-documents which backend produced each FPS number. This is the whole
 * point: headless capture can't run WebGPU compute (RESEARCH Pitfall 2), so
 * the numbers are captured in headed Chrome and the backend must be legible
 * in the frame itself, not inferred.
 *
 * The backend readout MUST be built from values read only AFTER
 * `await renderer.init()` — before that, `isWebGPUBackend` lies (three #30024).
 *
 * No per-frame allocation: frame deltas go into a fixed ring buffer and the
 * FPS text node is rewritten only when the displayed integer actually changes.
 */

export type RendererBackendLabel = "WebGPU" | "WebGL2";

export interface PerfHudBackends {
  /** From `renderer.backend.isWebGPUBackend` (read AFTER renderer.init()). */
  rendererBackend: RendererBackendLabel;
  /** From `water.backend`. */
  waterBackend: "webgpu" | "webgl";
  /** From `water.spray !== null` — null on the WebGL2 fallback. */
  sprayAvailable: boolean;
  /** Whether this run was forced onto WebGL2 via `?forceWebGL=1`. */
  forcedWebGL: boolean;
}

export interface PerfHudHandle {
  /** Call once per rendered frame with `performance.now()`. */
  frame(now: number): void;
  dispose(): void;
}

/** Frames included in the rolling FPS average. */
const WINDOW = 60;

/**
 * True when the spike was launched with `?forceWebGL=1` — the caller uses this
 * to construct `new WebGPURenderer({ forceWebGL: true })` so a second run
 * measures the WebGL2 fallback tier's FPS with the same instrument.
 */
export function forceWebGLRequested(): boolean {
  return /[?&]forceWebGL=1(?:&|$)/.test(window.location.search);
}

/**
 * Create the overlay HUD. Call `frame(performance.now())` every rendered frame.
 */
export function createPerfHud(backends: PerfHudBackends): PerfHudHandle {
  const root = document.createElement("div");
  root.style.cssText = [
    "position:fixed",
    "top:8px",
    "left:8px",
    "z-index:9999",
    "padding:8px 10px",
    "font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace",
    "color:#eaf6ff",
    "background:rgba(6,14,22,0.72)",
    "border:1px solid rgba(134,226,255,0.35)", // Frost accent hairline
    "white-space:pre",
    "pointer-events:none",
    "letter-spacing:0.2px",
  ].join(";");

  const fpsLine = document.createElement("div");
  fpsLine.style.cssText = "font-size:20px;font-weight:600;color:#86e2ff";

  const staticLines = document.createElement("div");
  staticLines.textContent = [
    `renderer : ${backends.rendererBackend}${backends.forcedWebGL ? " (forced)" : ""}`,
    `water    : ${backends.waterBackend}`,
    `spray    : ${backends.sprayAvailable ? "available" : "null (webgl2)"}`,
  ].join("\n");

  root.appendChild(fpsLine);
  root.appendChild(staticLines);
  document.body.appendChild(root);

  const frameTimes = new Float32Array(WINDOW);
  let writeIdx = 0;
  let filled = 0;
  let lastNow = 0;
  let lastShownFps = -1;

  function frame(now: number): void {
    if (lastNow !== 0) {
      frameTimes[writeIdx] = now - lastNow;
      writeIdx = (writeIdx + 1) % WINDOW;
      if (filled < WINDOW) filled++;
    }
    lastNow = now;

    let sum = 0;
    for (let i = 0; i < filled; i++) sum += frameTimes[i];
    const fps = filled > 0 && sum > 0 ? Math.round((filled * 1000) / sum) : 0;
    if (fps !== lastShownFps) {
      lastShownFps = fps;
      fpsLine.textContent = `${fps} FPS`;
    }
  }

  return {
    frame,
    dispose(): void {
      root.remove();
    },
  };
}
