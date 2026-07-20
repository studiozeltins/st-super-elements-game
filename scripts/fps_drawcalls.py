"""Count GL draw calls per frame at the plaza — the decisive render-bound metric.

Wraps drawElements/drawArrays before the page loads, snapshots the per-frame
count each rAF, and reports the distribution after SAMPLE_SECONDS of idle.
"""
import os, statistics, time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:4173" + os.environ.get("FPS_QUERY", "")
PROFILE_DIR = Path(__file__).resolve().parent.parent / ".perfbot-profile"
SAMPLE_SECONDS = 10

HOOK = """
(() => {
  window.__dc = [];
  let n = 0;
  const wrap = (proto, name) => {
    const orig = proto[name]; if (!orig || orig.__wrapped) return;
    proto[name] = function (...a) { n++; return orig.apply(this, a); };
    proto[name].__wrapped = true;
  };
  for (const C of [self.WebGLRenderingContext, self.WebGL2RenderingContext]) {
    if (!C) continue;
    wrap(C.prototype, "drawElements");
    wrap(C.prototype, "drawArrays");
    wrap(C.prototype, "drawElementsInstanced");
    wrap(C.prototype, "drawArraysInstanced");
  }
  const loop = () => { if (window.__rec) window.__dc.push(n); n = 0; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
})();
"""

def main():
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PROFILE_DIR), headless=False,
            viewport={"width": 1280, "height": 800}, args=["--window-size=1320,900"])
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.add_init_script(HOOK)
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")
        time.sleep(3)
        page.evaluate("window.__dc = []; window.__rec = true;")
        time.sleep(SAMPLE_SECONDS)
        page.evaluate("window.__rec = false;")
        dc = [x for x in page.evaluate("window.__dc") if x > 0]
        ctx.close()
    if not dc:
        print("no draw-call samples"); return
    dc.sort()
    print(f"\n=== draw calls / frame {os.environ.get('FPS_QUERY','(baseline)')} — {len(dc)} frames ===")
    print(f"  median : {statistics.median(dc):.0f}")
    print(f"  mean   : {statistics.mean(dc):.0f}")
    print(f"  p95    : {dc[int(len(dc)*0.95)-1]:.0f}")
    print(f"  max    : {dc[-1]:.0f}")

if __name__ == "__main__":
    main()
