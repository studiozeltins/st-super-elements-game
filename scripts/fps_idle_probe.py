"""Fast idle-only FPS probe for bisecting city/plaza frame cost.

Reuses the perfbot persistent profile. Samples SAMPLE_SECONDS of idle frames at
the plaza under a URL query flag (?nograss / ?noshadow / ?nofx / ?nobend) passed
via FPS_QUERY, and optionally forces reduce-motion ON to zero all phase-13
camera-feel per-frame work.

Usage:
    FPS_QUERY=?nograss python scripts/fps_idle_probe.py
    REDUCE_MOTION=1 python scripts/fps_idle_probe.py
"""

import os
import statistics
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:4173" + os.environ.get("FPS_QUERY", "")
REDUCE_MOTION = os.environ.get("REDUCE_MOTION") == "1"
SAMPLE_SECONDS = 12
PROFILE_DIR = Path(__file__).resolve().parent.parent / ".perfbot-profile"

FPS_SAMPLER = """
(() => {
  window.__fpsFrames = [];
  window.__fpsRecord = false;
  const loop = prev => requestAnimationFrame(ts => {
    if (window.__fpsRecord) window.__fpsFrames.push(ts - prev);
    loop(ts);
  });
  loop(performance.now());
})();
"""


def stats(label, deltas):
    deltas = [d for d in deltas if 0 < d < 1000]
    if len(deltas) < 30:
        print(f"{label}: not enough samples ({len(deltas)})")
        return
    s = sorted(deltas)
    avg = 1000 / statistics.mean(deltas)
    p99 = s[int(len(s) * 0.99) - 1]
    p95 = s[int(len(s) * 0.95) - 1]
    print(f"\n=== {label} ===")
    print(f"frames        : {len(deltas)}")
    print(f"average FPS   : {avg:.1f}")
    print(f"5% low FPS    : {1000 / p95:.1f}  (p95 {p95:.1f}ms)")
    print(f"1% low FPS    : {1000 / p99:.1f}  (p99 {p99:.1f}ms)")
    print(f"worst frame   : {s[-1]:.1f}ms  ({1000 / s[-1]:.1f} fps)")


def main():
    label = os.environ.get("FPS_QUERY", "(baseline)")
    if REDUCE_MOTION:
        label += " +reduceMotion"
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PROFILE_DIR), headless=False,
            viewport={"width": 1280, "height": 800},
            args=["--window-size=1320,900"],
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        if REDUCE_MOTION:
            page.add_init_script(
                "try{const s=JSON.parse(localStorage.getItem('settings')||'{}');"
                "s.reduceMotion=true;localStorage.setItem('settings',JSON.stringify(s));}catch(e){}"
            )
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")
        time.sleep(3)
        page.evaluate(FPS_SAMPLER)
        page.evaluate("window.__fpsFrames = []; window.__fpsRecord = true;")
        time.sleep(SAMPLE_SECONDS)
        page.evaluate("window.__fpsRecord = false;")
        stats(f"idle plaza {label}", page.evaluate("window.__fpsFrames"))
        ctx.close()


if __name__ == "__main__":
    main()
