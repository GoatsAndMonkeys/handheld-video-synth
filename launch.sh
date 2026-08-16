#!/bin/bash
# HVS-80 launcher — called by EmulationStation with the .vsb ROM path.
# Clears any stale instance/decoders first so sessions can never stack.
pkill -f "python3 main.py --rom" 2>/dev/null
pkill -f "webui.py" 2>/dev/null      # the web cart holds port 8080; a second
                                     # launch would fail to bind, and leaving
                                     # it up behind the synth serves files
                                     # from a session the user thinks is over
pkill -x ffmpeg 2>/dev/null
cd /home/pi/handheld-video-synth
# log on the SD card, not /tmp — recovering from a lockup means power-cycling,
# and that takes /tmp (and the evidence) with it
LOG=/home/pi/videosynth.log
[ -f "$LOG" ] && [ "$(stat -c%s "$LOG")" -gt 2000000 ] && mv -f "$LOG" "$LOG.1"
echo "=== launch $(date +%H:%M:%S) rom=$1" >> "$LOG"
# the web console is a cart too: {"mode": "web"} instead of a pack. Its
# output goes to the screen, not the log — the URL is the whole point of it
if grep -q '"mode"[[:space:]]*:[[:space:]]*"web"' "$1" 2>/dev/null; then
    exec python3 -u webui.py 2>&1 | tee -a "$LOG"
fi
# {"mode": "emurec"} — the Gameplay cart. Sweeps whatever RetroArch recorded
# into the emulator collection FIRST, on screen, then boots the synth onto
# the clip that sweep just made. The sweep runs here rather than in the
# background because a transcode competing with the shader chain is a
# dropped-frame set, and because a clip that appears after the loader has
# already scanned is a clip the user cannot select.
EXTRA=()
if grep -q '"mode"[[:space:]]*:[[:space:]]*"emurec"' "$1" 2>/dev/null; then
    echo "sweeping gameplay captures..."
    # --wait-lock: the onend hook very likely started this same sweep in the
    # background when you quit the game. Waiting for it is the point of this
    # cart; stepping aside would boot the synth onto an empty collection.
    python3 -u tools/emurec.py --wait-lock 900 2>&1 | tee -a "$LOG"
    # emurec.py leaves a .latest naming the clip it just made. Globbed across
    # packs rather than hardcoded to hvs80-synth, so pointing the ingest at a
    # different pack does not quietly stop this cart from finding anything.
    LATEST=$(ls packs/*/clips/emulator/.latest 2>/dev/null | head -1)
    [ -n "$LATEST" ] && [ -s "$LATEST" ] && EXTRA=(--clip "$(head -1 "$LATEST")")
fi
exec python3 -u main.py --rom "$1" "${EXTRA[@]}" >> "$LOG" 2>&1
