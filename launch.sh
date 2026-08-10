#!/bin/bash
# Handheld Video Synth launcher — called by EmulationStation with the .vsb ROM path.
# Clears any stale instance/decoders first so sessions can never stack.
pkill -f "handheld-video-synth/main.py" 2>/dev/null
pkill -x ffmpeg 2>/dev/null
cd /home/pi/handheld-video-synth
exec python3 main.py --rom "$1" >> /tmp/videosynth.log 2>&1
