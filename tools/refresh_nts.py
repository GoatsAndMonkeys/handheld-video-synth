#!/usr/bin/env python3
"""Print an up-to-date NTS block for RADIO_STATIONS in main.py.

NTS retires and adds Infinite Mixtapes from time to time. Rather than let the
list quietly rot, ask them: /api/v2/mixtapes is the same endpoint their own
site reads, so it is authoritative by construction.

The one-line blurbs are ours — the API subtitles are full sentences and the
loader has about twenty characters to play with — so existing blurbs are
preserved by name and anything new is flagged for a human to write.

    python3 tools/refresh_nts.py            # print the block
    python3 tools/refresh_nts.py --check    # exit 1 if main.py is stale
"""
import json
import os
import re
import sys
import urllib.request

API = "https://www.nts.live/api/v2/mixtapes"
LIVE = [("NTS 1", "https://stream-relay-geo.ntslive.net/stream",
         "live channel 1"),
        ("NTS 2", "https://stream-relay-geo.ntslive.net/stream2",
         "live channel 2")]
MAIN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "main.py")


def existing_blurbs():
    """Keep the hand-written blurbs across refreshes."""
    src = open(MAIN).read()
    return dict(re.findall(r'\("([^"]+)", "https://stream-[^"]+",\s*'
                           r'"NTS", "([^"]*)"\)', src))


def fetch():
    with urllib.request.urlopen(API, timeout=25) as r:
        data = json.loads(r.read().decode())
    return [(m["title"], m["audio_stream_endpoint"])
            for m in data.get("results", [])]


def main():
    blurbs = existing_blurbs()
    try:
        mixtapes = fetch()
    except Exception as exc:
        print("could not reach NTS:", exc, file=sys.stderr)
        return 2

    rows = [(n, u, blurbs.get(n, d)) for n, u, d in LIVE]
    rows += [(t, u, blurbs.get(t, "")) for t, u in mixtapes]
    missing = [n for n, _, b in rows if not b]
    gone = [n for n in blurbs if n not in {r[0] for r in rows}]

    if "--check" in sys.argv:
        stale = missing or gone
        for n in missing:
            print("new stream, needs a blurb:", n)
        for n in gone:
            print("retired upstream, still in main.py:", n)
        print("up to date" if not stale else "main.py is stale")
        return 1 if stale else 0

    for name, url, blurb in rows:
        print('    ("%s", "%s",\n     "NTS", "%s"),' % (name, url, blurb))
    for n in missing:
        print("#   ^ NEW: %s needs a blurb (<= 24 chars)" % n, file=sys.stderr)
    for n in gone:
        print("#   RETIRED upstream: %s" % n, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
