#!/usr/bin/env python3
"""Turn video files into a deck-ready clip collection.

The deck decodes clips in software on a Zero 2W, so source material has to
arrive already cut down: 320x240, 30fps, a fixed-length excerpt, and a small
enough bitrate that decode never competes with the shader chain. Doing that
by hand for eighty files is how mistakes get in, so this does it the same way
every time and matches the encoding your existing collections already use.

    python3 tools/ingest_clips.py lotto ~/Videos/lotto/*.mov
    python3 tools/ingest_clips.py lotto ~/Videos/*.mp4 --seconds 60 --start 30
    python3 tools/ingest_clips.py lotto ~/Videos/*.mp4 --deploy retropie.local

A collection is just a folder under packs/<pack>/clips/, which the loader
picks up as its own entry beside 80_s_90_s_mtv_videos and hawks_crew.

Bring your own footage: material you shot, material you licensed, material
the artist gave you, or public-domain archives. This tool deliberately has no
downloader in it.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys

# matched to the existing clips: 320x240 h264, 30fps, aac 96k stereo
WIDTH, HEIGHT, FPS = 320, 240, 30
VBITRATE, ABITRATE, ARATE = "320k", "96k", "44100"
NAME_LEN = 32           # existing filenames are slugged and cut to 32 chars
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def slug(path):
    """Reproduce the naming already on the card: lowercase, every run of
    non-alphanumerics collapsed to one underscore, cut to 32 characters."""
    stem = os.path.splitext(os.path.basename(path))[0]
    s = re.sub(r"[^a-z0-9]+", "_", stem.lower()).strip("_")
    return s[:NAME_LEN].rstrip("_") or "clip"


def ffmpeg_bin():
    for cand in (shutil.which("ffmpeg"), os.path.expanduser("~/bin/ffmpeg")):
        if cand and os.path.exists(cand):
            return cand
    sys.exit("ffmpeg not found — brew install ffmpeg")


def encode(ff, src, dst, seconds, start):
    """Letterbox rather than crop: a VJ clip that has been silently
    centre-cropped loses whatever was at the edges of the frame, and you
    cannot get it back once it is on the card."""
    vf = ("scale=%d:%d:force_original_aspect_ratio=decrease,"
          "pad=%d:%d:(ow-iw)/2:(oh-ih)/2,fps=%d"
          % (WIDTH, HEIGHT, WIDTH, HEIGHT, FPS))
    cmd = [ff, "-hide_banner", "-loglevel", "error", "-y"]
    if start:
        cmd += ["-ss", str(start)]
    cmd += ["-i", src]
    if seconds:
        cmd += ["-t", str(seconds)]
    cmd += ["-vf", vf, "-c:v", "libx264", "-preset", "medium",
            "-b:v", VBITRATE, "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", ABITRATE, "-ar", ARATE, "-ac", "2",
            "-movflags", "+faststart", dst]
    return subprocess.call(cmd) == 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("collection", help="folder name, e.g. lotto")
    ap.add_argument("files", nargs="+", help="source videos")
    ap.add_argument("--pack", default="demo")
    ap.add_argument("--seconds", type=int, default=90,
                    help="excerpt length; 0 keeps the whole thing (default 90)")
    ap.add_argument("--start", type=int, default=0, help="seek before cutting")
    ap.add_argument("--deploy", metavar="HOST",
                    help="rsync the finished collection to the deck")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    ff = ffmpeg_bin()
    out = os.path.join(ROOT, "packs", a.pack, "clips", a.collection)
    missing = [f for f in a.files if not os.path.exists(f)]
    if missing:
        sys.exit("no such file: " + missing[0])

    print("%d file(s) -> %s" % (len(a.files), out))
    if a.dry_run:
        for f in a.files:
            print("   %-46s -> %s.mp4" % (os.path.basename(f)[:46], slug(f)))
        return 0

    os.makedirs(out, exist_ok=True)
    done, failed, seen = 0, [], {}
    for n, src in enumerate(a.files, 1):
        name = slug(src)
        seen[name] = seen.get(name, 0) + 1
        if seen[name] > 1:            # two sources slugging the same: keep both
            name = "%s_%d" % (name[:NAME_LEN - 2], seen[name])
        dst = os.path.join(out, name + ".mp4")
        print("  [%d/%d] %s" % (n, len(a.files), name))
        if encode(ff, src, dst, a.seconds, a.start):
            done += 1
        else:
            failed.append(os.path.basename(src))
            if os.path.exists(dst):
                os.remove(dst)        # never leave a half clip for the loader

    print("\nencoded %d, failed %d" % (done, len(failed)))
    for f in failed:
        print("   failed:", f)

    if a.deploy and done:
        dest = "pi@%s:/home/pi/handheld-video-synth/packs/%s/clips/" % (
            a.deploy, a.pack)
        print("\n-> %s" % dest)
        if subprocess.call(["rsync", "-az", "-v", out, dest]) == 0:
            print("done — the loader picks it up on the next rescan "
                  "(switch source, or relaunch)")
        else:
            print("rsync failed — is the deck on this network?")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
