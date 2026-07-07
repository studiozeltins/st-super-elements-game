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
    args = ap.parse_args()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not args.headed)
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

        accepts = 0
        deadline = time.time() + args.minutes * 60
        while time.time() < deadline:
            if page.locator(".party-toast").count() > 0:
                try:
                    page.get_by_role("button", name="Pieņemt").first.click()
                    accepts += 1
                    log(f"accepted invite #{accepts}")
                except Exception as e:
                    log(f"accept error: {e}")
            page.wait_for_timeout(1000)

        log(f"done — {accepts} invite(s) accepted")
        browser.close()
        return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nstopped", flush=True)
        sys.exit(0)
