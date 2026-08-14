#!/usr/bin/env python3
"""Pull YouTube videos (single or playlist) into an HVS-80 pack.

Usage:
    .venv/bin/python ytget.py <url> [--name clipname] [--pack packs/hvs80-synth]
                              [--max-seconds 90] [--count 3] [--push]

Videos are normalized to 320x240 30fps mp4 WITH audio (aac), sized for the
Pi's software decoder. Playlist URLs grab the first --count entries.
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
PI_DEST = "pi@retropie.local:/home/pi/handheld-video-synth/%s/clips/"
YT_EXTRA = []


def slug(title):
    return re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")[:32] or "clip"


def grab_one(url, name, clips_dir, max_seconds, res=240):
    if name is not None:                      # re-runs are incremental
        done = os.path.join(clips_dir, name + ".mp4")
        if os.path.exists(done):
            print("already have:", done)
            return done
    with tempfile.TemporaryDirectory() as tmp:
        tmp_file = os.path.join(tmp, "dl.mp4")
        subprocess.run(
            [sys.executable, "-m", "yt_dlp", "--no-playlist"] + YT_EXTRA +
            ["-f", "b[height<=480][ext=mp4]/bv*[height<=480][ext=mp4]+ba/b",
             "--merge-output-format", "mp4", "-o", tmp_file, url], check=True)
        if name is None:
            title = subprocess.run(
                [sys.executable, "-m", "yt_dlp", "--no-playlist"] + YT_EXTRA +
                ["--print", "title", url],
                capture_output=True, text=True, check=True).stdout.strip()
            name = slug(title)
        out = os.path.join(clips_dir, name + ".mp4")
        ff = ["ffmpeg", "-y", "-loglevel", "error", "-i", tmp_file]
        if max_seconds:
            ff += ["-t", str(max_seconds)]
        cw, ch = (640, 480) if res == 480 else (320, 240)
        ff += ["-vf",
               "scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d"
               % (cw, ch, cw, ch),
               "-r", "30", "-c:a", "aac", "-b:a", "96k", "-ar", "44100",
               "-pix_fmt", "yuv420p", out]
        subprocess.run(ff, check=True)
    print("clip ready:", out)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--name", default=None)
    ap.add_argument("--pack", default="packs/hvs80-synth")
    ap.add_argument("--max-seconds", type=int, default=90)
    ap.add_argument("--count", type=int, default=3,
                    help="max videos to take from a playlist")
    ap.add_argument("--push", action="store_true",
                    help="also copy clips to the GPi")
    ap.add_argument("--cookies", default=None, metavar="BROWSER",
                    help="use browser cookies for private playlists "
                         "(e.g. chrome, safari, firefox)")
    ap.add_argument("--res", type=int, choices=[240, 480], default=240,
                    help="stored clip height: 240 (Pi-friendly, default) "
                         "or 480 (desktop / fullres experiments)")
    args = ap.parse_args()
    global YT_EXTRA
    YT_EXTRA = ["--cookies-from-browser", args.cookies] if args.cookies else []

    clips_dir = os.path.join(ROOT, args.pack, "clips")
    os.makedirs(clips_dir, exist_ok=True)

    outs = []
    if "list=" in args.url:
        entries = subprocess.run(
            [sys.executable, "-m", "yt_dlp", "--flat-playlist"] + YT_EXTRA +
            ["--playlist-items", "1:%d" % args.count,
             "--print", "%(id)s\t%(title)s\t%(playlist_title)s", args.url],
            capture_output=True, text=True, check=True).stdout.strip()
        lines = entries.splitlines()
        # each playlist becomes its own collection subfolder
        ptitle = lines[0].split("\t")[2] if lines and "\t" in lines[0] else ""
        col = slug(ptitle)[:24] or "playlist"
        clips_dir = os.path.join(clips_dir, col)
        os.makedirs(clips_dir, exist_ok=True)
        print("collection:", col)
        for line in lines:
            parts = line.split("\t")
            vid, title = parts[0], parts[1] if len(parts) > 1 else parts[0]
            u = "https://www.youtube.com/watch?v=" + vid
            try:
                outs.append(grab_one(u, slug(title), clips_dir, args.max_seconds, args.res))
            except subprocess.CalledProcessError as exc:
                print("skipping %s: %s" % (title, exc))
    else:
        outs.append(grab_one(args.url, args.name, clips_dir, args.max_seconds, args.res))

    if args.push and outs:
        src_root = os.path.join(ROOT, args.pack, "clips")
        dest = PI_DEST % args.pack
        subprocess.run(["rsync", "-az", src_root + "/", dest], check=True)
        print("pushed %d clip(s) (collections synced) to %s" % (len(outs), dest))


if __name__ == "__main__":
    main()
