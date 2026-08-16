#!/bin/bash
# HVS-80 gameplay capture — turn RetroArch's own recorder on, once.
# Run ON the Pi. Idempotent, and reversible with --undo.
#
#   bash /home/pi/handheld-video-synth/pi/emurec_setup.sh
#   bash /home/pi/handheld-video-synth/pi/emurec_setup.sh --undo
#   EMUREC_BTN=3 bash .../emurec_setup.sh     # force the toggle button number
#
# This touches the user's *emulator* configuration, which is why it is not
# part of pi/install.sh: installing the synth should never quietly change how
# your games play. Everything it writes into retroarch.cfg sits between
# marker comments, any line it displaces is kept commented in place, and
# --undo puts both back.
set -e

# All overridable, which is not decoration: it is the only way to exercise
# this script anywhere other than the one device it is for, and that device
# is an instrument that may be mid-performance.
APP="${HVS_APP:-/home/pi/handheld-video-synth}"
RP="${HVS_RP:-/opt/retropie}"
RA_CFG="$RP/configs/all/retroarch.cfg"
RA_BIN="${HVS_RA_BIN:-$RP/emulators/retroarch/bin/retroarch}"
JOYPADS="$RP/configs/all/retroarch-joypads"
HOOK_DIR="$RP/configs/all"
STAGE="${HVS_EMUREC_STAGE:-/home/pi/gameplay}"
REC_CFG="$APP/pi/hvs_record.cfg"

UNDO=
[ "${1:-}" = "--undo" ] && UNDO=1

if [ ! -f "$RA_CFG" ]; then
    echo "no $RA_CFG — this is not a RetroPie install" >&2
    exit 1
fi

# ---------------------------------------------------------------- undo ----
if [ -n "$UNDO" ]; then
    python3 - "$RA_CFG" <<'EOF'
import sys
path = sys.argv[1]
with open(path) as f:
    lines = f.read().splitlines()
out, skipping = [], False
for ln in lines:
    if ln.startswith("# >>> HVS-80 gameplay capture"):
        skipping = True
        continue
    if ln.startswith("# <<< HVS-80 gameplay capture"):
        skipping = False
        continue
    if skipping:
        continue
    if ln.startswith("#hvs-was# "):
        out.append(ln[len("#hvs-was# "):])   # put the user's line back
        continue
    out.append(ln)
while out and not out[-1].strip():
    out.pop()
with open(path, "w") as f:
    f.write("\n".join(out) + "\n")
print("retroarch.cfg: HVS-80 block removed, displaced settings restored")
EOF
    for f in "$HOOK_DIR/runcommand-onend.sh"; do
        if [ -f "$f" ] && grep -q HVS_EMUREC_MARKER "$f"; then
            rm -f "$f"
            if [ -f "$HOOK_DIR/runcommand-onend.hvs-prev.sh" ]; then
                mv "$HOOK_DIR/runcommand-onend.hvs-prev.sh" "$f"
                echo "runcommand-onend.sh: your original hook restored"
            else
                echo "runcommand-onend.sh: removed"
            fi
        fi
    done
    echo "done — captures already staged in $STAGE are untouched"
    exit 0
fi

# ------------------------------------------------- is this even possible --
# RetroArch's --help lists --record whether or not the recorder was compiled
# in (the getopt entry has no #ifdef around it), so the flag proves nothing.
# --features is the only honest answer.
echo "== does this RetroArch have the ffmpeg recorder? =="
FEAT=
[ -x "$RA_BIN" ] && FEAT=$("$RA_BIN" --features 2>/dev/null | grep -i ffmpeg || true)
if [ -z "$FEAT" ]; then
    echo "  could not ask $RA_BIN --features"
elif echo "$FEAT" | grep -qi ": *yes"; then
    echo "  yes — $FEAT"
else
    echo "  NO — $FEAT"
    echo
    echo "  This build cannot record. RetroPie 4.8 on Buster normally builds"
    echo "  RetroArch with ffmpeg (scriptmodules/emulators/retroarch.sh only"
    echo "  passes --disable-ffmpeg on Debian older than 9), so this is most"
    echo "  likely a pre-compiled binary install. Rebuild from source:"
    echo "      sudo ~/RetroPie-Setup/retropie_setup.sh"
    echo "      -> Manage packages -> core -> retroarch -> Install from source"
    echo "  Nothing has been changed. Re-run this script afterwards."
    exit 1
fi

# --------------------------------------------------------- which button --
# The recording toggle ships UNBOUND in every RetroArch default keybind set,
# so there is nothing to inherit — it has to be named here. Button numbers
# are per-controller, and the GPi's pad enumerates as an Xbox 360 pad, so the
# number is read out of whatever autoconfig RetroPie generated rather than
# guessed. Y is the pick because RetroPie's own hotkey table leaves it free
# (Select+Start exit, Select+L/R load/save, Select+X menu, Select+B reset,
# Select+←/→ state slot).
BTN="${EMUREC_BTN:-}"
PAD=
if [ -z "$BTN" ] && [ -d "$JOYPADS" ]; then
    for f in "$JOYPADS"/*.cfg; do
        [ -f "$f" ] || continue
        if grep -q '^input_enable_hotkey_btn' "$f" && \
           grep -q '^input_player1_y_btn' "$f"; then
            BTN=$(grep '^input_player1_y_btn' "$f" | head -1 |
                  sed 's/.*= *"\{0,1\}\([^"]*\)"\{0,1\}.*/\1/')
            PAD=$(basename "$f")
            break
        fi
    done
fi
if [ -z "$BTN" ]; then
    echo "== could not read a pad autoconfig — falling back to button 3 =="
    echo "   (if Select+Y does nothing in a game, find your pad's Y number in"
    echo "    $JOYPADS and re-run with EMUREC_BTN=<n>)"
    BTN=3
elif [ -n "$PAD" ]; then
    echo "== toggle button: $BTN (Y, from $PAD) =="
else
    echo "== toggle button: $BTN (from EMUREC_BTN) =="
fi

mkdir -p "$STAGE"

# ------------------------------------------------------ patch the config --
echo "== retroarch.cfg =="
[ -f "$RA_CFG.hvs-bak" ] || cp "$RA_CFG" "$RA_CFG.hvs-bak"
python3 - "$RA_CFG" "$REC_CFG" "$STAGE" "$BTN" <<'EOF'
import sys
path, rec_cfg, stage, btn = sys.argv[1:5]

# Every key this feature owns. Any existing line for one of them is commented
# out rather than deleted: RetroArch's config parser has no documented
# last-one-wins guarantee, so leaving a duplicate above our block is a coin
# flip, and silently destroying somebody's setting is worse than either.
SETTINGS = [
    ("record_driver", '"ffmpeg"',
     "the wav driver is what a no-ffmpeg build falls back to, and it writes"
     " audio-only bytes into a .mkv without complaining"),
    ("video_record_quality", '"0"',
     "0 = CUSTOM. THIS IS THE LOAD-BEARING ONE: every other value makes"
     " RetroArch ignore video_record_config entirely and use a hardcoded"
     " preset (libretro/RetroArch#17559)"),
    ("video_record_config", '"%s"' % rec_cfg, "the ffmpeg preset, see that file"),
    ("recording_output_directory", '"%s/"' % stage,
     "staging only — tools/emurec.py moves finished captures into the pack"),
    ("video_gpu_record", '"false"',
     "record the core's framebuffer, not the screen. A glReadPixels of the"
     " viewport every frame is a pipeline stall this GPU cannot spare, it"
     " would bake in the emulator's own shaders and overlays, and the"
     " dispmanx driver this device uses has no read_viewport at all"),
    ("video_post_filter_record", '"false"', "no CPU softfilter in the capture"),
    ("video_record_scale_factor", '"1"', "native core resolution"),
    ("video_record_threads", '"2"', "two cores encode, two run the game"),
    ("input_recording_toggle_btn", '"%s"' % btn,
     "hotkey-enable (Select) + this button starts/stops a take"),
    ("input_recording_toggle", '"f10"', "same, for a USB keyboard"),
]
OWNED = set(k for k, _, _ in SETTINGS)
BEGIN = "# >>> HVS-80 gameplay capture (pi/emurec_setup.sh) — do not edit"
END = "# <<< HVS-80 gameplay capture"

with open(path) as f:
    lines = f.read().splitlines()

out, skipping, displaced = [], False, 0
for ln in lines:
    if ln.startswith(BEGIN[:32]):        # our own previous block: drop it
        skipping = True
        continue
    if ln.startswith(END):
        skipping = False
        continue
    if skipping:
        continue
    key = ln.split("=")[0].strip()
    if key in OWNED and not ln.lstrip().startswith("#"):
        out.append("#hvs-was# " + ln)
        displaced += 1
        continue
    out.append(ln)

while out and not out[-1].strip():
    out.pop()
out.append("")
out.append(BEGIN)
for key, val, why in SETTINGS:
    out.append("# %s" % why)
    out.append("%s = %s" % (key, val))
out.append(END)
with open(path, "w") as f:
    f.write("\n".join(out) + "\n")

print("  wrote %d settings (%d existing line(s) commented out as #hvs-was#)"
      % (len(SETTINGS), displaced))

# config_save_on_exit rewrites this whole file when RetroArch quits. The
# values survive that; the marker comments do not, and --undo needs them.
save_on_exit = [l for l in lines
                if l.split("=")[0].strip() == "config_save_on_exit"]
if save_on_exit and "true" in save_on_exit[-1].lower():
    print("  WARNING config_save_on_exit is true — RetroArch will rewrite")
    print("          this file on exit and lose the markers --undo needs.")
    print("          RetroPie ships it false; consider putting it back.")
EOF

# --------------------------------------------------------- the ingest hook --
echo "== runcommand-onend hook =="
HOOK="$HOOK_DIR/runcommand-onend.sh"
if [ -f "$HOOK" ] && ! grep -q HVS_EMUREC_MARKER "$HOOK"; then
    mv "$HOOK" "$HOOK_DIR/runcommand-onend.hvs-prev.sh"
    chmod +x "$HOOK_DIR/runcommand-onend.hvs-prev.sh"
    echo "  your existing hook moved to runcommand-onend.hvs-prev.sh (still runs)"
fi
cp "$APP/pi/runcommand-onend.sh" "$HOOK"
chmod +x "$HOOK"
echo "  installed $HOOK"

# ------------------------------------------------------------------ done --
cat <<MSG

== done ==
  In any game:  hotkey (Select) + Y  starts a recording, again stops it.
                RetroArch says "Recording to ..." on screen when it starts.
  Captures stage in:  $STAGE
  Quit the game and they become 320x240 mp4 clips in
      $APP/packs/hvs80-synth/clips/emulator/
  which the Loader lists as the "emulator" collection. The *Gameplay* cart
  sweeps and boots straight onto the last session.

  Check what is waiting:  python3 $APP/tools/emurec.py --list
  Ingest log:             /home/pi/emurec.log
  Undo all of this:       bash $APP/pi/emurec_setup.sh --undo
MSG
