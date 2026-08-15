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
exec python3 -u main.py --rom "$1" >> "$LOG" 2>&1
