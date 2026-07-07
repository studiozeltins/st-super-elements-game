# -*- coding: utf-8 -*-
"""
Headless test-bot player for local multiplayer testing (party / Bars features).

Drives a real second browser client with Playwright: registers (or logs in to)
an account, comes online as a normal player, and then stays connected — auto-
accepting any party invite it receives. Use it to test invite / roster / kick /
disband from a single machine without a second device.

Prerequisites (one-time):
    pip install playwright
    python -m playwright install chromium

Run (dev server must be up: `pnpm dev`, and local SpacetimeDB running):
    python scripts/party-bot.py
    python scripts/party-bot.py --user Bots2 --minutes 15
    python scripts/party-bot.py --url http://192.168.1.32:5173

The bot connects to whatever SpacetimeDB the page resolves (localhost -> local
STDB), so it lands in the SAME database as your own client. Stop with Ctrl+C.
"""
import argparse
import sys
import time

from playwright.sync_api import sync_playwright


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser(description="Local party test-bot player.")
    ap.add_argument("--url", default="http://localhost:5173", help="App URL (dev server).")
    ap.add_argument("--user", default="PartyBot", help="Bot username (>=3 chars).")
    ap.add_argument("--password", default="botspassword", help="Bot password (>=6 chars).")
    ap.add_argument("--email", default="partybot@playtest.local", help="Email (register only).")
    ap.add_argument("--minutes", type=float, default=10.0, help="How long to stay online.")
    ap.add_argument("--headed", action="store_true", help="Show the browser window.")
    ap.add_argument("--walk-seconds", type=float, default=0.0,
                    help="After coming online, hold a movement key this long (e.g. to leave the safe zone).")
    ap.add_argument("--walk-key", default="KeyD",
                    help="Movement key to hold while walking (KeyW/KeyA/KeyS/KeyD).")
    ap.add_argument("--follow", action="store_true",
                    help="Chase the nearest other online player (polls positions via STDB HTTP).")
    ap.add_argument("--stdb-url", default="http://127.0.0.1:3000", help="SpacetimeDB HTTP base.")
    ap.add_argument("--db", default="2d-impact-game-fr9ti", help="SpacetimeDB database name.")
    ap.add_argument("--follow-stop", type=float, default=2.2, help="Stop distance when following.")
    args = ap.parse_args()

    # Fixed camera yaw (CAMERA_OFFSET = (7,15,11)) — invert it to turn a desired
    # WORLD heading into screen-space WASD input, matching the game's movement.
    import json as _json
    import math as _math
    import urllib.request as _url
    yaw = _math.atan2(7.0, 11.0)
    cos_y, sin_y = _math.cos(yaw), _math.sin(yaw)

    def online_players():
        req = _url.Request(
            f"{args.stdb_url}/v1/database/{args.db}/sql",
            data=b"SELECT name, position_x, position_z FROM player WHERE online = true",
            headers={"Content-Type": "text/plain"},
        )
        with _url.urlopen(req, timeout=3) as r:
            data = _json.loads(r.read().decode())
        return [(row[0], float(row[1]), float(row[2])) for row in data[0]["rows"]]

    def keys_for(dx, dz):
        # world (dx,dz) -> screen input via inverse camera rotation, then to WASD.
        ix = cos_y * dx - sin_y * dz
        iz = sin_y * dx + cos_y * dz
        n = _math.hypot(ix, iz) or 1.0
        ix, iz = ix / n, iz / n
        want = set()
        if ix > 0.35: want.add("KeyD")
        elif ix < -0.35: want.add("KeyA")
        if iz > 0.35: want.add("KeyS")
        elif iz < -0.35: want.add("KeyW")
        return want

    with sync_playwright() as p:
        # Anti-throttle flags: headless Chromium otherwise slows rAF/timers on a
        # "hidden" page, which nearly freezes the game loop (movement barely advances).
        browser = p.chromium.launch(
            headless=not args.headed,
            args=[
                "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding",
                "--disable-backgrounding-occluded-windows",
            ],
        )
        page = browser.new_page()
        page.goto(args.url)
        page.wait_for_load_state("networkidle")

        # Register; if the username already exists, fall back to login.
        try:
            page.wait_for_selector("#auth-username", timeout=20000)
        except Exception:
            log("no auth screen (already logged in?)")

        if page.locator("#auth-username").count() > 0:
            page.get_by_role("button", name="REĢISTRĒTIES").click()
            page.fill("#auth-username", args.user)
            page.fill("#auth-email", args.email)
            page.fill("#auth-password", args.password)
            page.wait_for_timeout(1500)  # let the socket connect so submit enables
            page.get_by_role("button", name="IZVEIDOT KONTU").click()
            page.wait_for_timeout(3000)
            if page.locator("#auth-username").count() > 0:
                log("username taken -> logging in instead")
                page.get_by_role("button", name="IENĀKT").first.click()
                page.fill("#auth-username", args.user)
                page.fill("#auth-password", args.password)
                page.wait_for_timeout(1000)
                page.locator("button.auth__button").click()

        try:
            page.wait_for_selector("#auth-username", state="detached", timeout=25000)
        except Exception:
            pass
        if page.locator("#auth-username").count() > 0:
            err = ""
            if page.locator(".auth__error").count() > 0:
                err = page.locator(".auth__error").first.inner_text()
            log(f"login failed, still on auth screen: '{err}'")
            browser.close()
            return 1

        log(f"ONLINE as {args.user} — auto-accepting invites for {args.minutes} min. Ctrl+C to stop.")

        # Optionally walk out of the safe zone (hold a movement key) so the bot is
        # PVP-hittable. Click the canvas first so window keydown listeners get focus.
        if args.walk_seconds > 0:
            try:
                page.locator("canvas").first.click(position={"x": 40, "y": 40})
            except Exception:
                pass
            page.keyboard.down(args.walk_key)
            page.wait_for_timeout(int(args.walk_seconds * 1000))
            page.keyboard.up(args.walk_key)
            log(f"walked {args.walk_seconds}s holding {args.walk_key}")

        if args.follow:
            try:  # focus the game so keydown reaches the window listener
                page.locator("canvas").first.click(position={"x": 40, "y": 40})
            except Exception:
                pass

        accepts = 0
        held = set()
        deadline = time.time() + args.minutes * 60
        while time.time() < deadline:
            if page.locator(".party-toast").count() > 0:
                try:
                    page.get_by_role("button", name="Pieņemt").first.click()
                    accepts += 1
                    log(f"accepted invite #{accepts}")
                except Exception as e:
                    log(f"accept error: {e}")

            if args.follow:
                want = set()
                try:
                    players = online_players()
                    me = next((p for p in players if p[0] == args.user), None)
                    others = [p for p in players if p[0] != args.user]
                    if me and others:
                        target = min(others, key=lambda p: (p[1] - me[1]) ** 2 + (p[2] - me[2]) ** 2)
                        dx, dz = target[1] - me[1], target[2] - me[2]
                        if _math.hypot(dx, dz) > args.follow_stop:
                            want = keys_for(dx, dz)
                except Exception as e:
                    log(f"follow error: {e}")
                for k in held - want:
                    page.keyboard.up(k)
                for k in want - held:
                    page.keyboard.down(k)
                held = want
                page.wait_for_timeout(250)
            else:
                page.wait_for_timeout(1000)

        for k in held:
            page.keyboard.up(k)
        log(f"done — {accepts} invite(s) accepted")
        browser.close()
        return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nstopped", flush=True)
        sys.exit(0)
