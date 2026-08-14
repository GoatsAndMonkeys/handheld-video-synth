#!/usr/bin/env python3
"""Install an effect pack: validate, copy into packs/, sync to the deck.

    python3 tools/packget.py <pack.zip | https://...zip | folder> [options]

The pack is checked with checkpack.py first; ERRORs refuse the install.
Options:
    --deck USER@HOST   deck to rsync to        (default pi@retropie.local)
    --no-deck          install locally only
    --force            replace an already-installed pack of the same name
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DECK = "pi@retropie.local"
DECK_PACKS = "/home/pi/handheld-video-synth/packs/"


def die(msg):
    print("packget: %s" % msg)
    sys.exit(1)


def find_pack_root(top):
    """The folder holding pack.json — at top level or one zip-wrapper down."""
    if os.path.isfile(os.path.join(top, "pack.json")):
        return top
    hits = [os.path.join(top, d) for d in sorted(os.listdir(top))
            if os.path.isfile(os.path.join(top, d, "pack.json"))]
    if len(hits) == 1:
        return hits[0]
    die("no pack.json found in %s" % top if not hits
        else "more than one pack in the archive — install them one at a time")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = [a for a in sys.argv[1:] if a.startswith("--")]
    if len(args) != 1:
        die(__doc__.strip())
    src = args[0]
    deck = DECK
    for o in opts:
        if o.startswith("--deck="):
            deck = o.split("=", 1)[1]
    tmp = tempfile.mkdtemp(prefix="packget_")
    try:
        # ---- obtain -----------------------------------------------------
        if src.startswith(("http://", "https://")):
            print("fetching %s" % src)
            zpath = os.path.join(tmp, "pack.zip")
            urllib.request.urlretrieve(src, zpath)
            src = zpath
        if os.path.isfile(src) and zipfile.is_zipfile(src):
            with zipfile.ZipFile(src) as z:
                z.extractall(os.path.join(tmp, "unzipped"))
            pack = find_pack_root(os.path.join(tmp, "unzipped"))
        elif os.path.isdir(src):
            pack = find_pack_root(src)
        else:
            die("%s is not a zip, folder or URL" % src)

        with open(os.path.join(pack, "pack.json")) as f:
            pj = json.load(f)
        name = pj.get("name") or die("pack.json has no \"name\"")
        if os.path.basename(pack) != name:
            named = os.path.join(tmp, name)
            shutil.copytree(pack, named)
            pack = named

        # ---- validate ---------------------------------------------------
        print("checking %s ..." % name)
        chk = subprocess.run(
            [sys.executable, os.path.join(ROOT, "tools", "checkpack.py"), pack],
            capture_output=True, text=True)
        out = (chk.stdout + chk.stderr).strip()
        if out:
            print(out)
        if chk.returncode != 0 or "0 errors" not in out:
            die("validation failed — not installing")

        # ---- shader-name collisions ------------------------------------
        mine = {os.path.basename(p) for p in
                os.listdir(os.path.join(pack, "shaders"))
                if p.endswith(".frag")}
        for other in sorted(os.listdir(os.path.join(ROOT, "packs"))):
            sdir = os.path.join(ROOT, "packs", other, "shaders")
            if other == name or not os.path.isdir(sdir):
                continue
            clash = mine & set(os.listdir(sdir))
            if clash:
                print("WARN: shader name(s) also in packs/%s: %s"
                      % (other, ", ".join(sorted(clash))))
                print("      shader names are global — first pack wins")

        # ---- install ----------------------------------------------------
        dest = os.path.join(ROOT, "packs", name)
        if os.path.exists(dest):
            if "--force" not in opts:
                die("packs/%s already installed (use --force to replace)" % name)
            shutil.rmtree(dest)
        shutil.copytree(pack, dest)
        print("installed packs/%s" % name)

        # ---- deck -------------------------------------------------------
        if "--no-deck" not in opts:
            print("syncing to %s ..." % deck)
            r = subprocess.run(
                ["rsync", "-az", dest + "/", "%s:%s%s/" % (deck, DECK_PACKS, name)])
            print("on the deck — restart the synth to load it" if r.returncode == 0
                  else "deck unreachable — installed locally; rerun to sync, or use --no-deck")

        # ---- pay the artist --------------------------------------------
        artist = pj.get("artist", "the author")
        for key, label in (("itch", "get/buy"), ("pay", "tip")):
            if pj.get(key):
                print("%s %s: %s" % (label, artist, pj[key]))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
