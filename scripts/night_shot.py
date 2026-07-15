"""Night screenshot at the plaza spawn — verifies cobble/roof edge-line brightness.

Loads the built dist (laragon, port 80) with ?time=<phase> to freeze the
day/night cycle, using the persistent perfbot profile (already logged in), and
screenshots. Default phase 0 = deep night.

Usage:
    python scripts/night_shot.py <out.png> [phase]
"""

import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

PROFILE_DIR = Path(__file__).resolve().parent.parent / ".perfbot-profile"


def main() -> None:
    out = sys.argv[1] if len(sys.argv) > 1 else "night.png"
    phase = sys.argv[2] if len(sys.argv) > 2 else "0"
    url = f"http://localhost:4173/?time={phase}"
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            str(PROFILE_DIR),
            headless=False,
            viewport={"width": 1280, "height": 800},
            args=["--window-size=1320,900"],
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(url)
        page.wait_for_load_state("networkidle")
        time.sleep(6)  # let the world render + subscriptions settle
        page.screenshot(path=out)
        print(f"screenshot -> {out} (phase {phase})")
        context.close()


if __name__ == "__main__":
    main()
