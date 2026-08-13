#!/usr/bin/env python3
"""Test network video sources: reachable, decodable, and fast enough.

Stream URLs rot. A master playlist can answer 200 for years after its media
playlists have gone — NASA's public feed does exactly that — so "the URL
responds" proves nothing. The only test that means anything is decoding real
frames and timing them.

The deck decodes in software on one small core, so a source has to arrive at
better than realtime or the picture stutters. Anything under about 1.2x is
too tight once the shader chain is also running.

    python3 tools/check_streams.py                     # check netsources.json
    python3 tools/check_streams.py URL [URL ...]       # check ad-hoc urls
    python3 tools/check_streams.py --prune             # drop dead entries

Run it on the deck for numbers that mean something — a laptop's CPU and wifi
will flatter every result.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOKMARKS = os.path.join(ROOT, "netsources.json")
W, H = 320, 240
# Long enough that connecting does not dominate. HLS spends seconds fetching
# a playlist and its first segments before it can emit a single frame, and
# over a short sample that startup swamps the steady-state rate — which is
# the number that decides whether playback stutters.
SECONDS = 14
MIN_RATE = 1.2          # realtime multiple below which playback will stutter


def ffmpeg_bin():
    for c in (shutil.which("ffmpeg"), os.path.expanduser("~/bin/ffmpeg")):
        if c and os.path.exists(c):
            return c
    sys.exit("no ffmpeg found")


def probe(ff, url):
    """Resolution and codec of the variant ffmpeg would actually pick."""
    try:
        out = subprocess.run(
            [ff, "-hide_banner", "-user_agent", "Mozilla/5.0",
             "-i", url, "-t", "1", "-f", "null", "-"],
            stderr=subprocess.PIPE, stdout=subprocess.DEVNULL,
            timeout=45).stderr.decode("utf-8", "replace")
    except Exception as exc:
        return None, str(exc)[:60]
    m = re.search(r"Video: (\w+).*?, (\d+)x(\d+)", out)
    if not m:
        err = re.search(r"(HTTP error [^\n]+|Server returned [^\n]+"
                        r"|Invalid data[^\n]*|Connection[^\n]*)", out)
        return None, (err.group(1)[:60] if err else "no video stream")
    return (m.group(1), int(m.group(2)), int(m.group(3))), None


def measure(ff, url):
    """Frames actually decoded per second of wall clock, as a multiple of
    realtime. Pins to one program: left alone, ffmpeg will happily pull
    several renditions at once and look four times slower than it is."""
    vf = ("scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d"
          % (W, H, W, H))
    frame = W * H * 3
    t0 = time.time()
    try:
        p = subprocess.run(
            [ff, "-loglevel", "error", "-user_agent", "Mozilla/5.0",
             "-i", url, "-map", "0:p:0:v?", "-t", str(SECONDS),
             "-f", "rawvideo", "-pix_fmt", "rgb24", "-vf", vf, "pipe:1"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=90)
    except Exception:
        return 0.0, 0
    dt = max(0.001, time.time() - t0)
    n = len(p.stdout) // frame
    # charge the connect once rather than against every second of the sample
    return (n / 30.0) / max(0.001, dt - CONNECT), n


CONNECT = 3.0           # typical HLS playlist + first-segment fetch


def entries(args):
    if args.urls:
        return [{"group": "ad-hoc", "name": u[:40], "url": u}
                for u in args.urls]
    if not os.path.exists(BOOKMARKS):
        sys.exit("no netsources.json — pass URLs instead")
    with open(BOOKMARKS) as f:
        book = json.load(f)
    out = []
    for group, items in book.get("groups", {}).items():
        for it in items:
            out.append(dict(it, group=group))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("urls", nargs="*")
    ap.add_argument("--prune", action="store_true",
                    help="rewrite netsources.json without the dead entries")
    args = ap.parse_args()
    ff = ffmpeg_bin()
    rows = entries(args)
    print("%-10s %-22s %-16s %s" % ("group", "name", "stream", "verdict"))
    print("-" * 78)
    good, dead = [], []
    for e in rows:
        info, err = probe(ff, e["url"])
        if info is None:
            print("%-10s %-22s %-16s DEAD: %s"
                  % (e["group"][:10], e["name"][:22], "-", err))
            dead.append(e)
            continue
        codec, w, h = info
        rate, n = measure(ff, e["url"])
        desc = "%s %dx%d" % (codec, w, h)
        if n == 0:
            verdict, ok = "DEAD: decodes nothing", False
        elif rate < MIN_RATE:
            verdict, ok = "TOO SLOW %.2fx realtime" % rate, False
        else:
            verdict, ok = "ok  %.2fx realtime" % rate, True
        print("%-10s %-22s %-16s %s"
              % (e["group"][:10], e["name"][:22], desc, verdict))
        (good if ok else dead).append(e)

    print("\n%d usable, %d unusable" % (len(good), len(dead)))
    if args.prune and not args.urls:
        book = {"groups": {}}
        for e in good:
            book["groups"].setdefault(e["group"], []).append(
                {"name": e["name"], "url": e["url"]})
        with open(BOOKMARKS, "w") as f:
            json.dump(book, f, indent=2)
        print("pruned netsources.json to the %d that work" % len(good))
    return 0 if not dead else 1


if __name__ == "__main__":
    sys.exit(main())
