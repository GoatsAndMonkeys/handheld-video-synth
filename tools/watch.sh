#!/bin/bash
# HVS-80 viewer — a plain low-latency window showing the handheld's
# "to mixer" stream. Share this window in Discord (Go Live), Zoom, etc.
# No OBS needed. On the handheld: Start -> Output -> to mixer.
#
# Usage: tools/watch.sh [port]   (default 5001)
exec ffplay -hide_banner -loglevel error \
    -fflags nobuffer -flags low_delay -framedrop \
    -window_title "HVS-80" \
    "udp://0.0.0.0:${1:-5001}"
