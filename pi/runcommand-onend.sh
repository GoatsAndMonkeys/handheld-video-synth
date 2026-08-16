#!/bin/bash
# HVS-80 gameplay capture — RetroPie's post-emulator hook.
#
# Installed by pi/emurec_setup.sh to /opt/retropie/configs/all/runcommand-onend.sh
# and run by runcommand.sh every time an emulator exits, with
#   $1 system  $2 emulator  $3 rom  $4 command
# (none of which this needs — the staging folder is the whole interface).
#
# Its one job: turn whatever RetroArch just recorded into a clip the synth
# can play, and get out of the way. Anything that goes wrong here has to be
# invisible, because the user is watching EmulationStation come back and has
# not asked this script for an opinion.
#
# HVS_EMUREC_MARKER — pi/emurec_setup.sh greps for this line to tell its own
# hook from one the user wrote, so leave it alone.

APP="${HVS_APP:-/home/pi/handheld-video-synth}"
LOG="${HVS_EMUREC_LOG:-/home/pi/emurec.log}"

# Chain first, ours second. RetroPie only allows one onend hook, so if the
# user already had one it was moved aside at install time and must still run
# — and it must run BEFORE we start eating CPU, not alongside. Found relative
# to this script so it works wherever the hook was installed.
PREV="$(dirname "$0")/runcommand-onend.hvs-prev.sh"
[ -x "$PREV" ] && "$PREV" "$@"

# Background and nice'd. The transcode is minutes of work on this machine for
# a long session, and EmulationStation is redrawing its menus right now; the
# user should be back on the shelf immediately, with the clip appearing when
# it appears. setsid detaches it from runcommand's process group so nothing
# downstream can take it down with a stray kill.
[ -f "$LOG" ] && [ "$(stat -c%s "$LOG")" -gt 500000 ] && mv -f "$LOG" "$LOG.1"
{
    echo "=== onend $(date +%H:%M:%S) system=$1 rom=$3"
} >> "$LOG" 2>&1
SETSID=$(command -v setsid || true)
$SETSID nice -n 19 python3 "$APP/tools/emurec.py" --verbose \
    >> "$LOG" 2>&1 < /dev/null &
disown 2>/dev/null || true

exit 0
