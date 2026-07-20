"""CDP CPU + heap-allocation profiler for the FPS hitch.

Reuses the perfbot persistent profile. Captures a Chrome DevTools Protocol CPU
sampling profile AND a heap allocation-sampling profile while the game runs,
then aggregates self-time and self-allocation by function so the hot / allocating
call is named directly (GC pressure = allocation source).

MODE=idle    : 14s idle at plaza (city hitch)
MODE=combat  : grant loadout, spawn goliaths at plaza, fight ~18s (combat stall)

Usage:
    MODE=idle   python scripts/fps_cpu_profile.py
    MODE=combat python scripts/fps_cpu_profile.py
"""

import os
import subprocess
import time
from collections import defaultdict
from pathlib import Path

from playwright.sync_api import sync_playwright

DB = "2d-impact-game-fr9ti"
BASE_URL = "http://localhost:4173"
USERNAME = "perfbot"
MODE = os.environ.get("MODE", "idle")
PROFILE_DIR = Path(__file__).resolve().parent.parent / ".perfbot-profile"
CAMP = (6.0, 6.0)  # spawn goliaths right on the plaza so no walking is needed


def run_cli(*args):
    subprocess.run(["spacetime", *args, "--server", "local"],
                   capture_output=True, text=True)


def sql(query):
    r = subprocess.run(["spacetime", "sql", DB, query, "--server", "local"],
                       capture_output=True, text=True)
    lines = [l for l in r.stdout.splitlines() if l.strip() and "WARNING" not in l]
    return [[c.strip() for c in l.split("|")] for l in lines[2:]] if len(lines) >= 3 else []


def frame_label(cf):
    name = cf.get("functionName") or "(anonymous)"
    url = cf.get("url", "")
    short = url.rsplit("/", 1)[-1] if url else "?"
    line = cf.get("lineNumber", -1)
    return f"{name}  @{short}:{line + 1}"


def top_cpu(profile, n=18):
    nodes = {node["id"]: node for node in profile["nodes"]}
    self_ms = defaultdict(float)
    total_samples = len(profile.get("samples", []))
    interval_us = profile.get("_interval_us", 100)
    per_sample_ms = interval_us / 1000.0
    hit = defaultdict(int)
    for node in profile["nodes"]:
        hit[frame_label(node["callFrame"])] += node.get("hitCount", 0)
    total_hits = sum(hit.values()) or 1
    print(f"\n=== TOP CPU self-time ({MODE}) — {total_samples} samples ===")
    for label, h in sorted(hit.items(), key=lambda x: -x[1])[:n]:
        pct = 100 * h / total_hits
        print(f"  {pct:5.1f}%  {h*per_sample_ms:7.1f}ms  {label}")


def top_heap(profile, n=18):
    # HeapProfiler sampling profile: tree of nodes, each with selfSize + callFrame.
    agg = defaultdict(float)
    def walk(node):
        cf = node["callFrame"]
        agg[frame_label(cf)] += node.get("selfSize", 0)
        for c in node.get("children", []):
            walk(c)
    walk(profile["head"])
    total = sum(agg.values()) or 1
    print(f"\n=== TOP heap self-allocation ({MODE}) — {total/1e6:.1f} MB sampled ===")
    for label, b in sorted(agg.items(), key=lambda x: -x[1])[:n]:
        pct = 100 * b / total
        print(f"  {pct:5.1f}%  {b/1024:9.0f} KB  {label}")


def main():
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PROFILE_DIR), headless=False,
            viewport={"width": 1280, "height": 800},
            args=["--window-size=1320,900"],
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        run_cli("sql", DB, "DELETE FROM goliath")
        run_cli("sql", DB, f"UPDATE player SET positionX = 6, positionZ = 6 WHERE name = '{USERNAME}'")
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")
        time.sleep(3)

        cdp = ctx.new_cdp_session(page)
        cdp.send("Profiler.enable")
        cdp.send("Profiler.setSamplingInterval", {"interval": 100})  # 100us = fine
        cdp.send("HeapProfiler.enable")
        cdp.send("HeapProfiler.startSampling", {"samplingInterval": 8192})
        cdp.send("Profiler.start")

        if MODE == "combat":
            player = sql(f"SELECT identity FROM player WHERE name = '{USERNAME}'")
            ident = player[0][0] if player else None
            if ident:
                run_cli("call", DB, "debug_grant_loadout", f'["0x{ident.removeprefix("0x")}"]')
                time.sleep(2)
            run_cli("call", DB, "debug_spawn_goliaths", str(CAMP[0]), str(CAMP[1]))
            time.sleep(1)
            started = time.time()
            step = 0
            while time.time() - started < 18:
                page.keyboard.press("j")
                if step % 30 == 0:
                    page.keyboard.press("q")
                for k in ("a", "d"):
                    page.keyboard.down(k); time.sleep(0.12); page.keyboard.up(k)
                step += 1
        else:
            time.sleep(14)

        cpu = cdp.send("Profiler.stop")["profile"]
        cpu["_interval_us"] = 100
        heap = cdp.send("HeapProfiler.stopSampling")["profile"]
        ctx.close()

    top_cpu(cpu)
    top_heap(heap)


if __name__ == "__main__":
    main()
