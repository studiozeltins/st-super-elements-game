/**
 * Mobile-friendly bottom-sheet menu for the spike controls.
 *
 * The old layout put a fixed bar top-left AND a fixed panel on the right, which
 * covered the scene on a phone. This collapses BOTH into one sheet that slides
 * up from the bottom, behind a small floating ☰ button. Closed by default, so
 * the scene is fully visible until you tap to tune.
 *
 * It just hosts the existing controls + panel (rendered inline via their
 * `parent` argument). Throwaway spike glue; nothing in src/game imports it.
 */
import { mountSpikeControls } from "./spikeControls";
import { mountSpikePanel, type SpikePanelRefs } from "./spikePanel";

const HIDDEN = "translateY(110%)";
const SHOWN = "translateY(0)";

export function mountSpikeMenu(refs: SpikePanelRefs): void {
  // --- sheet ---
  const sheet = document.createElement("div");
  sheet.style.cssText = [
    "position:fixed",
    "left:0",
    "right:0",
    "bottom:0",
    "z-index:10000",
    "max-height:66vh",
    "display:flex",
    "flex-direction:column",
    "color:#e6f6ff",
    "background:rgba(10,18,26,0.86)",
    "backdrop-filter:blur(9px)",
    "-webkit-backdrop-filter:blur(9px)",
    "border-top:1px solid rgba(134,226,255,0.3)",
    "border-radius:12px 12px 0 0",
    "box-shadow:0 -8px 24px rgba(0,0,0,0.4)",
    "transform:" + HIDDEN,
    "transition:transform 0.22s ease",
    "will-change:transform",
  ].join(";");

  // header (sticky within the sheet)
  const header = document.createElement("div");
  header.style.cssText = [
    "flex:0 0 auto",
    "display:flex",
    "align-items:center",
    "justify-content:space-between",
    "padding:10px 14px",
    "font:600 13px ui-monospace,Menlo,Consolas,monospace",
    "border-bottom:1px solid rgba(134,226,255,0.18)",
  ].join(";");
  const title = document.createElement("span");
  title.textContent = "spike controls";
  const close = document.createElement("button");
  close.textContent = "✕";
  close.setAttribute("aria-label", "close");
  close.style.cssText = [
    "cursor:pointer",
    "border:1px solid rgba(134,226,255,0.35)",
    "background:transparent",
    "color:#bff0ff",
    "font:inherit",
    "border-radius:6px",
    "padding:2px 10px",
    "min-width:40px",
    "min-height:32px",
  ].join(";");
  header.append(title, close);

  // scrollable body — controls + panel rendered inline
  const body = document.createElement("div");
  body.style.cssText = [
    "flex:1 1 auto",
    "overflow-y:auto",
    "-webkit-overflow-scrolling:touch",
    "padding:10px 14px 20px",
  ].join(";");

  sheet.append(header, body);
  mountSpikeControls(body);
  mountSpikePanel(refs, body);

  // --- floating toggle button ---
  const fab = document.createElement("button");
  fab.textContent = "☰ tune";
  fab.style.cssText = [
    "position:fixed",
    "right:12px",
    "bottom:12px",
    "z-index:10001",
    "cursor:pointer",
    "font:600 13px ui-monospace,Menlo,Consolas,monospace",
    "color:#08131b",
    "background:#86e2ff",
    "border:0",
    "border-radius:22px",
    "padding:10px 16px",
    "box-shadow:0 3px 12px rgba(0,0,0,0.4)",
    "min-height:44px",
  ].join(";");

  let open = false;
  const setOpen = (v: boolean) => {
    open = v;
    sheet.style.transform = open ? SHOWN : HIDDEN;
    fab.textContent = open ? "▾ hide" : "☰ tune";
  };
  fab.addEventListener("click", () => setOpen(!open));
  close.addEventListener("click", () => setOpen(false));

  document.body.append(sheet, fab);
}
