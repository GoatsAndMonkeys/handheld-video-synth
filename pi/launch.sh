#!/bin/bash
# HVS-80 launcher — called by EmulationStation with the .vsb ROM path.
# Clears any stale instance/decoders first so sessions can never stack.
pkill -f "python3 main.py --rom" 2>/dev/null
pkill -x ffmpeg 2>/dev/null
cd /home/pi/handheld-video-synth
# log on the SD card, not /tmp — a hard lockup reboots the Pi and takes
# /tmp with it, losing exactly the evidence we need
LOG=/home/pi/videosynth.log
[ -f "$LOG" ] && [ "$(stat -c%s "$LOG")" -gt 2000000 ] && mv -f "$LOG" "$LOG.1"
echo "=== launch $(date +%H:%M:%S) rom=$1" >> "$LOG"
exec python3 -u main.py --rom "$1" >> "$LOG" 2>&1
