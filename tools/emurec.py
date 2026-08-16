#!/usr/bin/env python3
"""Turn RetroArch gameplay captures into HVS-80 clips.

RetroArch records a session to its own staging folder as a Matroska file at
the core's native framebuffer size (256x240 for NES, 256x224 SNES, 240x160
GBA...) and whatever rate the core runs at. That file is a *capture*, not a
clip: the synth globs `packs/*/clips/**/*.mp4`, decodes at 320x240 and expects
30fps material sized like everything `ytget.py` and `ingest_clips.py` produce.
This sweeps the staging folder and makes clips out of what it finds.

    python3 tools/emurec.py                  # sweep, ingest, delete staged
    python3 tools/emurec.py --list           # what is waiting, nothing else
    python3 tools/emurec.py --keep           # ingest but leave the captures
    python3 tools/emurec.py --deploy retropie.local

Design notes that are not obvious from the flags:

* **Fit, never upscale, then letterbox.** Nearly every core the Zero 2W can
  actually run outputs a frame that already fits inside 320x240, so the
  default path does no resampling at all: the game's pixels land 1:1 in the
  clip, the pad makes up the rest, and the GPU's exact 2x to the 640x480
  screen keeps them square and chunky. Scaling a 256x240 NES frame *up* to
  320 wide would smear every pixel edge for no gain. `--stretch` fills the
  frame instead, for people who would rather lose the edges than see bars.
* **Point sampling.** When something does have to be resized it is nearest
  neighbour, because the material is pixel art and this instrument's whole
  look is built on not blurring it. `--smooth` opts out.
* **Write to `.part`, then rename.** The destination is a folder the running
  synth scans; a half-written `.mp4` sitting in it is a source that opens and
  then dies. The rename is atomic, so the loader only ever sees whole clips.
* **Size-stability, not timestamps.** A capture is skipped while it is still
  growing, decided by sampling its size twice — this Pi has no RTC and its
  clock is not evidence of anything.

Stdlib only, Python 3.7: this runs on the handheld, straight off the
runcommand hook, on a machine with 237MB of RAM and no pip.
"""
import argparse
import errno
import os
import re
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# matched to ingest_clips.py and ytget.py, so an emulator clip encodes and
# decodes exactly like every other clip on the card
WIDTH, HEIGHT, FPS = 320, 240, 30
VBITRATE, ABITRATE, ARATE = "320k", "96k", "44100"
NAME_LEN = 32

# where the setup script points RetroArch's recording_output_directory, and
# where the finished clips go. Both overridable; the defaults are what
# pi/emurec_setup.sh writes into retroarch.cfg.
STAGE_DIR = os.environ.get("HVS_EMUREC_STAGE",
                           os.path.expanduser("~/gameplay"))
DEFAULT_PACK = "hvs80-synth"
DEFAULT_COLLECTION = "emulator"

# RetroArch's own extension is .mkv; the others are here because a user who
# points --stage at a folder of screen grabs should not have to care.
CAPTURE_EXT = (".mkv", ".mp4", ".avi", ".mov", ".webm", ".nut", ".flv")

# RetroArch names an auto-started recording `<content name>-<date>-<time>`.
# The date is worse than useless here: this Pi has no clock battery, so every
# session recorded before the first NTP sync is stamped 1970 or the last-known
# boot time, and two of them collide. Strip it and let free_name() number the
# takes instead. Only date/time-shaped runs (6+ digits, or a dashed date) are
# eaten — "sonic_3" and "final_fantasy_7" have to survive.
TRAILING_STAMP = re.compile(
    r"(?:[_-](?:\d{8}|\d{6}|\d{4}_\d{2}_\d{2}|\d{2}_\d{2}_\d{2}))+$")


def slug(path):
    """The naming already on the card: lowercase, every run of
    non-alphanumerics collapsed to one underscore, cut to 32 characters."""
    stem = os.path.splitext(os.path.basename(path))[0]
    s = re.sub(r"[^a-z0-9]+", "_", stem.lower()).strip("_")
    s = TRAILING_STAMP.sub("", s).strip("_") or s
    return s[:NAME_LEN].rstrip("_") or "gameplay"


def ffmpeg_bin():
    """The Pi has no system ffmpeg — pi/install.sh drops a static build in
    ~/bin, which is where this has to look before giving up."""
    for cand in (shutil.which("ffmpeg"), os.path.expanduser("~/bin/ffmpeg")):
        if cand and os.path.exists(cand):
            return cand
    return None


def settled(path, dwell=1.5):
    """Has this capture stopped growing?

    RetroArch is very likely still writing the newest file in the staging
    folder — the hook that calls this fires when the *emulator* exits, and
    the muxer takes its own time finishing the index. Ingesting a file
    mid-write produces a clip that ends early, or none at all. Two size
    samples a moment apart answer the question without consulting a clock
    this device does not have.
    """
    try:
        first = os.path.getsize(path)
    except OSError:
        return False
    if first == 0:
        return False
    time.sleep(dwell)
    try:
        return os.path.getsize(path) == first
    except OSError:
        return False


def free_name(dest_dir, base):
    """`mario.mp4`, then `mario_2.mp4` — a second session of the same game is
    a second clip, never an overwrite of the first."""
    cand = os.path.join(dest_dir, base + ".mp4")
    if not os.path.exists(cand):
        return cand
    n = 2
    while True:
        cand = os.path.join(dest_dir, "%s_%d.mp4" % (base[:NAME_LEN - 3], n))
        if not os.path.exists(cand):
            return cand
        n += 1


def video_filter(stretch=False, smooth=False):
    """scale/pad chain. See the module docstring for why it is shaped this
    way; the expressions are the interesting part.

    `force_original_aspect_ratio=decrease` would have done the fitting, but
    it also *upscales* anything smaller than the box — a 240x160 GBA frame
    becomes 320x213 and every pixel edge lands between two output pixels.
    The min() expressions below fit the frame inside 320x240 while refusing
    to make it bigger, so a capture that already fits passes through
    untouched. The `a` (aspect) test picks which axis is the limiting one.
    """
    flags = "bilinear" if smooth else "neighbor"
    if stretch:
        return ("scale=%d:%d:force_original_aspect_ratio=increase"
                ":flags=%s,crop=%d:%d,fps=%d"
                % (WIDTH, HEIGHT, flags, WIDTH, HEIGHT, FPS))
    box = "%d/%d" % (WIDTH, HEIGHT)
    return ("scale=w='if(gt(a,%s),min(%d,iw),-2)'"
            ":h='if(gt(a,%s),-2,min(%d,ih))':flags=%s,"
            "pad=%d:%d:(ow-iw)/2:(oh-ih)/2,fps=%d"
            % (box, WIDTH, box, HEIGHT, flags, WIDTH, HEIGHT, FPS))


def has_hw_encoder():
    """The Pi's V4L2 stateful H.264 encoder. /dev/video11 is the encoder node
    on the Broadcom stack; its presence is the honest test, since a desktop
    ffmpeg will happily list h264_v4l2m2m as a codec it was built with and
    then fail to open a device that is not there."""
    return os.path.exists("/dev/video11")


def _vcodec(hw):
    if not hw:
        # 320x240 at this bitrate, veryfast measured ~43x realtime on one
        # desktop core. On four A53s it is the difference between waiting
        # and waiting a long time — but it is also the only encoder that
        # exists everywhere, so it is the fallback, not the default.
        return ["-c:v", "libx264", "-preset", "veryfast", "-b:v", VBITRATE]
    # Same encoder and the same hard-won flag the instrument's own recorder
    # uses: the default 4 capture buffers deadlock the driver ("All capture
    # buffers returned to userspace"), and a deadlock here is an ingest that
    # never returns. There is only one of these on the chip, which is fine
    # precisely because an ingest never runs while the synth does — the
    # runcommand hook fires after the emulator quits, and launch.sh sweeps
    # before main.py starts.
    return ["-c:v", "h264_v4l2m2m", "-num_capture_buffers", "64",
            "-b:v", VBITRATE]


def encode(ff, src, dst, seconds=0, start=0, stretch=False, smooth=False,
           verbose=False, hw=False):
    """Capture -> clip. Writes `dst + '.part'` and renames on success, so the
    loader never sees a partial file in a folder it is scanning.

    Tries the hardware encoder first where there is one and drops to x264 if
    it refuses, because a V4L2 encoder that will not open is a solved problem
    with a slow answer, not a reason to lose the session.
    """
    part = dst + ".part"
    for use_hw in ([True, False] if hw else [False]):
        cmd = [ff, "-hide_banner", "-loglevel", "info" if verbose else "error",
               "-y", "-nostdin"]
        if start:
            cmd += ["-ss", str(start)]
        cmd += ["-i", src]
        if seconds:
            cmd += ["-t", str(seconds)]
        cmd += (["-vf", video_filter(stretch, smooth)] + _vcodec(use_hw) +
                ["-pix_fmt", "yuv420p",
                 # a core with no sound, or a capture whose audio track never
                 # started, must still produce a clip: the '?' makes the
                 # audio map optional rather than fatal
                 "-map", "0:v:0", "-map", "0:a:0?",
                 "-c:a", "aac", "-b:a", ABITRATE, "-ar", ARATE, "-ac", "2",
                 # -f mp4 is not optional here: the file is written as
                 # `.part` and ffmpeg guesses the container from the
                 # extension, so without it every ingest fails with "Unable
                 # to find a suitable output format for ...mp4.part"
                 "-movflags", "+faststart", "-f", "mp4", part])
        rc = subprocess.call(cmd)
        ok = (rc == 0 and os.path.exists(part) and os.path.getsize(part) > 0)
        if os.path.exists(part) and not ok:
            os.remove(part)
        if ok:
            os.rename(part, dst)
            return True
        if use_hw:
            print("     hardware encoder refused this one — retrying in "
                  "software")
    return False


def captures(stage):
    """Staged files, in a deterministic order that does not consult mtime."""
    if not os.path.isdir(stage):
        return []
    return [os.path.join(stage, f) for f in sorted(os.listdir(stage))
            if f.lower().endswith(CAPTURE_EXT)]


def take_lock(path, wait=0.0):
    """One sweep at a time. The runcommand hook fires on every emulator exit
    and the synth's launcher sweeps too; two ffmpeg transcodes racing each
    other on four little cores is how a device that is about to be played
    ends up unresponsive.

    `wait` seconds of patience for the Gameplay cart, which exists precisely
    to play the session that a background sweep may still be transcoding —
    walking past it to a black `emulator` folder would be the one outcome
    the cart is for. Polled on the monotonic clock, because this device's
    wall clock is not a clock.
    """
    import fcntl
    deadline = time.monotonic() + wait
    said = False
    while True:
        try:
            fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o644)
        except OSError:
            return None
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return fd
        except (IOError, OSError) as exc:
            os.close(fd)
            if exc.errno not in (errno.EACCES, errno.EAGAIN, errno.EWOULDBLOCK):
                return None
        if time.monotonic() >= deadline:
            return None
        if not said:
            print("emurec: a sweep is already running — waiting for it")
            said = True
        time.sleep(1.0)


def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*",
                    help="specific captures; default is the whole staging "
                         "folder")
    ap.add_argument("--stage", default=STAGE_DIR,
                    help="RetroArch's recording_output_directory "
                         "(default %s)" % STAGE_DIR)
    ap.add_argument("--pack", default=DEFAULT_PACK)
    ap.add_argument("--collection", default=DEFAULT_COLLECTION,
                    help="clips subfolder = the name in the Loader")
    ap.add_argument("--seconds", type=int, default=0,
                    help="cut to this many seconds; 0 (default) keeps it whole")
    ap.add_argument("--start", type=int, default=0, help="seek before cutting")
    ap.add_argument("--keep", action="store_true",
                    help="leave the staged capture in place (default is to "
                         "delete it once the clip exists — the card holds "
                         "one copy of a session, not two)")
    ap.add_argument("--stretch", action="store_true",
                    help="fill the frame and lose the edges instead of "
                         "letterboxing the game's own aspect")
    ap.add_argument("--smooth", action="store_true",
                    help="bilinear instead of nearest-neighbour resizing")
    ap.add_argument("--soft", action="store_true",
                    help="force libx264 even where the Pi's hardware H.264 "
                         "encoder is available")
    ap.add_argument("--no-wait", action="store_true",
                    help="do not check whether a capture is still growing")
    ap.add_argument("--wait-lock", type=float, default=0.0, metavar="SECONDS",
                    help="wait this long for a sweep already in progress "
                         "instead of stepping aside (the Gameplay cart)")
    ap.add_argument("--list", action="store_true",
                    help="report what is staged and exit")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true",
                    help="let ffmpeg talk (for the log the hook writes)")
    ap.add_argument("--deploy", metavar="HOST",
                    help="rsync the finished collection to the deck")
    a = ap.parse_args()

    srcs = a.files or captures(a.stage)
    dest_dir = os.path.join(ROOT, "packs", a.pack, "clips", a.collection)

    if a.list:
        if not srcs:
            print("nothing staged in %s" % a.stage)
            return 0
        for s in srcs:
            try:
                mb = os.path.getsize(s) / 1e6
            except OSError:
                mb = 0.0
            print("  %-44s %7.1f MB -> %s.mp4"
                  % (os.path.basename(s)[:44], mb, slug(s)))
        return 0

    if not srcs and not a.wait_lock:
        return 0                      # the common case: nothing was recorded

    ff = ffmpeg_bin()
    if ff is None:
        sys.stderr.write("emurec: no ffmpeg (expected ~/bin/ffmpeg on the "
                         "Pi) — captures left in %s\n" % a.stage)
        return 1

    lock = None
    if not a.dry_run:
        lock = take_lock(os.path.join(a.stage, ".emurec.lock")
                         if os.path.isdir(a.stage)
                         else os.path.join(ROOT, ".emurec.lock"),
                         a.wait_lock)
        if lock is None:
            print("emurec: another sweep is running — leaving it to that one")
            return 0
        # Re-list under the lock: whoever we waited for has been deleting the
        # very files this run was going to work on.
        if not a.files:
            srcs = captures(a.stage)
    if not srcs:
        return 0

    hw = has_hw_encoder() and not a.soft
    print("%d capture(s) -> %s%s"
          % (len(srcs), dest_dir, " (hardware encoder)" if hw else ""))
    if a.dry_run:
        for s in srcs:
            print("   %-44s -> %s.mp4" % (os.path.basename(s)[:44], slug(s)))
        return 0

    try:
        os.makedirs(dest_dir)
    except OSError:
        if not os.path.isdir(dest_dir):
            sys.stderr.write("emurec: cannot create %s\n" % dest_dir)
            return 1

    done, failed, skipped = 0, [], 0
    for n, src in enumerate(srcs, 1):
        name = os.path.basename(src)
        if not a.no_wait and not settled(src):
            print("  [%d/%d] %s — still being written, leaving it"
                  % (n, len(srcs), name[:44]))
            skipped += 1
            continue
        dst = free_name(dest_dir, slug(src))
        print("  [%d/%d] %s -> %s"
              % (n, len(srcs), name[:44], os.path.basename(dst)))
        if encode(ff, src, dst, a.seconds, a.start, a.stretch, a.smooth,
                  a.verbose, hw):
            done += 1
            # A pointer to the newest clip, written by the only process that
            # knows which one that is. The Gameplay cart reads it to boot
            # straight onto the session you just played — and it has to be a
            # file, not a directory listing sorted by mtime, because this Pi
            # has no clock battery and its timestamps are fiction.
            try:
                with open(os.path.join(dest_dir, ".latest"), "w") as fh:
                    fh.write(os.path.basename(dst) + "\n")
            except OSError:
                pass
            if not a.keep:
                try:
                    os.remove(src)
                except OSError as exc:
                    print("     (could not remove capture: %s)" % exc)
        else:
            failed.append(name)
            # Park it. A capture that ffmpeg refuses (the emulator was killed
            # mid-write, the card filled up) will refuse again on every
            # future sweep, and the hook runs on every emulator exit — so
            # without this the device spends a minute failing the same file
            # each time you quit a game, forever. The bytes stay put under a
            # name the sweep no longer picks up.
            try:
                os.rename(src, src + ".failed")
            except OSError:
                pass

    print("ingested %d, failed %d, skipped %d" % (done, len(failed), skipped))
    for f in failed:
        print("   failed:", f)

    if a.deploy and done:
        dest = "pi@%s:/home/pi/handheld-video-synth/packs/%s/clips/" % (
            a.deploy, a.pack)
        print("\n-> %s" % dest)
        if subprocess.call(["rsync", "-az", dest_dir, dest]) != 0:
            print("rsync failed — is the deck on this network?")

    if lock is not None:
        os.close(lock)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
