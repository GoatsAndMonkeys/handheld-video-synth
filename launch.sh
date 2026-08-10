#!/bin/bash
# HVS-80 launcher — called by EmulationStation with the .vsb ROM path.
# Clears any stale instance/decoders first so sessions can never stack.
pkill -f "python3 main.py --rom" 2>/dev/null
pkill -x ffmpeg 2>/dev/null
cd /home/pi/handheld-video-synth
exec python3 main.py --rom "$1" >> /tmp/videosynth.log 2>&1
