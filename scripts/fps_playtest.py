"""Automated combat FPS playtest.

Drives a real browser (Playwright, headed so the GPU renders like a player's
machine) against the built client served by `vite preview`, with the local
SpacetimeDB running the world:

1. logs in (or registers) the reusable `perfbot` account
2. grants it the maxed test loadout (4x 5-star, C6, B10) via debugGrantLoadout
3. walks the player to the nearest enemy camp with scripted WASD steering
4. force-spawns all 3 goliath sizes at the camp via debugSpawnGoliaths
5. fights (attack + skill spam) for FIGHT_SECONDS while sampling every
   requestAnimationFrame delta, then prints avg / 1%-low / worst FPS

Usage:
    pnpm preview --port 4173   (in another terminal, after pnpm build)
    python scripts/fps_playtest.py
"""

import re
import statistics
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

DB = "2d-impact-game-fr9ti"
BASE_URL = "http://localhost:4173"
USERNAME = "perfbot"
EMAIL = "perfbot@test.local"
PASSWORD = "perfbot12345"
# Camp 5 sits ~35u from the plaza spawn — the "quick walk" target.
CAMP = (27.3, 22.0)
WALK_TIMEOUT_SECONDS = 120
FIGHT_SECONDS = 60
PROFILE_DIR = Path(__file__).resolve().parent.parent / ".perfbot-profile"


def run_cli(*args: str) -> str:
    result = subprocess.run(
        ["spacetime", *args, "--server", "local"], capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"spacetime {' '.join(args)} failed:\n{result.stderr}")
    return result.stdout


def sql(query: str) -> list[list[str]]:
    out = run_cli("sql", DB, query)
    lines = [l for l in out.splitlines() if l.strip() and "WARNING" not in l]
    if len(lines) < 3:
        return []
    return [[cell.strip() for cell in line.split("|")] for line in lines[2:]]


def call_reducer(reducer: str, *args: str) -> None:
    run_cli("call", DB, reducer, *args)


def get_player() -> dict | None:
    rows = sql(
        f"SELECT identity, positionX, positionZ, currentHealth FROM player WHERE name = '{USERNAME}'"
    )
    if not rows:
        return None
    identity, x, z, hp = rows[0][:4]
    return {"identity": identity, "x": float(x), "z": float(z), "hp": int(hp)}


def ensure_logged_in(page) -> None:
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    if not page.locator("#auth-username").count():
        print("already logged in (persistent profile)")
        return
    # Try login first — the account persists across runs.
    page.click("button.auth__tab >> text=IENĀKT")
    page.fill("#auth-username", USERNAME)
    page.fill("#auth-password", PASSWORD)
    page.click("button.auth__button")
    try:
        page.wait_for_selector("#auth-username", state="detached", timeout=6000)
        print("logged in")
        return
    except Exception:
        pass
    print("login failed, registering fresh account")
    page.click("button.auth__tab >> text=REĢISTRĒTIES")
    page.fill("#auth-username", USERNAME)
    page.fill("#auth-email", EMAIL)
    page.fill("#auth-password", PASSWORD)
    page.click("button.auth__button")
    page.wait_for_selector("#auth-username", state="detached", timeout=10000)
    print("registered")


FPS_SAMPLER = """
(() => {
  if (window.__fpsInstalled) return;
  window.__fpsInstalled = true;
  window.__fpsFrames = [];
  window.__fpsRecord = false;
  const loop = prev => requestAnimationFrame(ts => {
    if (window.__fpsRecord) window.__fpsFrames.push(ts - prev);
    loop(ts);
  });
  loop(performance.now());
})();
"""


def calibrate_keys(page) -> dict[str, tuple[float, float]]:
    """Measures the world direction each move key produces (camera mapping)."""
    directions: dict[str, tuple[float, float]] = {}
    for key in ("d", "s"):
        before = get_player()
        page.keyboard.down(key)
        time.sleep(1.2)
        page.keyboard.up(key)
        time.sleep(0.6)
        after = get_player()
        directions[key] = (after["x"] - before["x"], after["z"] - before["z"])
    dx, dz = directions["d"]
    sx, sz = directions["s"]
    basis = {
        "d": (dx, dz),
        "a": (-dx, -dz),
        "s": (sx, sz),
        "w": (-sx, -sz),
    }
    print(f"key calibration: d->{basis['d']}, s->{basis['s']}")
    return basis


def steer_keys(basis, desired_x, desired_z):
    """Returns the move keys whose world direction helps toward the target."""
    magnitude = (desired_x**2 + desired_z**2) ** 0.5
    if magnitude < 1e-6:
        return []
    keys = []
    for key, (kx, kz) in basis.items():
        key_mag = (kx**2 + kz**2) ** 0.5
        if key_mag < 1e-3:
            continue
        dot = (kx * desired_x + kz * desired_z) / (key_mag * magnitude)
        if dot > 0.35:
            keys.append(key)
    return keys


def walk_to(page, basis, target_x, target_z, arrive_within=9.0):
    held: set[str] = set()
    last_pos = None
    stuck_checks = 0
    deadline = time.time() + WALK_TIMEOUT_SECONDS

    def hold(keys):
        nonlocal held
        wanted = set(keys)
        for key in held - wanted:
            page.keyboard.up(key)
        for key in wanted - held:
            page.keyboard.down(key)
        held = wanted

    try:
        while time.time() < deadline:
            player = get_player()
            dx, dz = target_x - player["x"], target_z - player["z"]
            distance = (dx**2 + dz**2) ** 0.5
            print(f"  walking… at ({player['x']:.1f}, {player['z']:.1f}), {distance:.1f}u to go")
            if distance <= arrive_within:
                hold([])
                return True
            if last_pos is not None:
                moved = ((player["x"] - last_pos[0]) ** 2 + (player["z"] - last_pos[1]) ** 2) ** 0.5
                stuck_checks = stuck_checks + 1 if moved < 0.6 else 0
                if stuck_checks >= 2:
                    # Wedged on an obstacle: jump and skew the heading briefly.
                    page.keyboard.press("Space")
                    hold(steer_keys(basis, -dz, dx))
                    time.sleep(0.7)
                    stuck_checks = 0
            last_pos = (player["x"], player["z"])
            hold(steer_keys(basis, dx, dz))
            time.sleep(0.8)
        return False
    finally:
        hold([])


def fight(page, screenshot_path: str) -> list[float]:
    page.evaluate("window.__fpsFrames = []; window.__fpsRecord = true;")
    started = time.time()
    last_skill = 0.0
    respawned_wave = False
    wiggle = ["a", "d", "w", "s"]
    step = 0
    while time.time() - started < FIGHT_SECONDS:
        page.keyboard.press("j")  # basic attack
        if time.time() - last_skill > 8:
            page.keyboard.press("q")  # skill
            last_skill = time.time()
        # Small strafe so grass bending / movement systems stay engaged.
        key = wiggle[step % len(wiggle)]
        page.keyboard.down(key)
        time.sleep(0.25)
        page.keyboard.up(key)
        step += 1
        if not respawned_wave and time.time() - started > FIGHT_SECONDS / 2:
            # Top the wave back up to 3 full-HP goliaths for the second half.
            call_reducer("debug_spawn_goliaths", str(CAMP[0]), str(CAMP[1]))
            respawned_wave = True
        if step == 8:
            page.screenshot(path=screenshot_path)
    page.evaluate("window.__fpsRecord = false;")
    return page.evaluate("window.__fpsFrames")


def print_stats(label: str, frame_deltas: list[float]) -> None:
    # Ignore absurd deltas (tab switches / stalls > 1s would skew everything).
    deltas = [d for d in frame_deltas if 0 < d < 1000]
    if len(deltas) < 30:
        print(f"{label}: not enough samples ({len(deltas)})")
        return
    deltas_sorted = sorted(deltas)
    avg_fps = 1000 / statistics.mean(deltas)
    p99 = deltas_sorted[int(len(deltas_sorted) * 0.99) - 1]
    worst = deltas_sorted[-1]
    print(f"\n=== {label} ===")
    print(f"frames sampled : {len(deltas)}")
    print(f"average FPS    : {avg_fps:.1f}")
    print(f"1% low FPS     : {1000 / p99:.1f}  (p99 frame {p99:.1f}ms)")
    print(f"worst frame    : {worst:.1f}ms  ({1000 / worst:.1f} fps)")


def main() -> None:
    scratch = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    console_errors: list[str] = []
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            str(PROFILE_DIR),
            headless=False,
            viewport={"width": 1280, "height": 800},
            args=["--window-size=1320,900"],
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text) if msg.type == "error" else None,
        )

        ensure_logged_in(page)
        page.evaluate(FPS_SAMPLER)
        player = get_player()
        if not player:
            raise RuntimeError("player row missing after login")
        print(f"player at ({player['x']:.1f}, {player['z']:.1f}), hp {player['hp']}")

        # Idle baseline first: distinguishes "combat is slow" from the browser's
        # own vsync/frame cap for this window.
        page.evaluate("window.__fpsFrames = []; window.__fpsRecord = true;")
        time.sleep(10)
        page.evaluate("window.__fpsRecord = false;")
        print_stats("idle at spawn (10s baseline)", page.evaluate("window.__fpsFrames"))

        identity_arg = f'["0x{player["identity"].removeprefix("0x")}"]'
        call_reducer("debug_grant_loadout", identity_arg)
        print("granted maxed loadout (4x 5-star C6 B10)")
        time.sleep(2)  # live subscription applies the roster/party swap

        basis = calibrate_keys(page)
        print(f"walking to camp at {CAMP}")
        if not walk_to(page, basis, *CAMP):
            print("WARN: walk timed out, fighting from current position")
        camp_player = get_player()
        spawn_at = (camp_player["x"], camp_player["z"])
        call_reducer("debug_spawn_goliaths", str(spawn_at[0]), str(spawn_at[1]))
        print("spawned 3 goliaths — fighting")
        time.sleep(1.5)

        frames = fight(page, str(scratch / "fight.png"))
        print_stats(f"combat vs 3 goliaths ({FIGHT_SECONDS}s)", frames)

        end_player = get_player()
        print(f"\nplayer hp after fight: {end_player['hp']}")
        goliaths = sql("SELECT sizeIndex, health, alive FROM goliath")
        print(f"goliaths after fight: {goliaths}")
        if console_errors:
            print(f"\nconsole errors ({len(console_errors)}):")
            for err in console_errors[:10]:
                print(f"  {err[:200]}")
        context.close()


if __name__ == "__main__":
    main()
