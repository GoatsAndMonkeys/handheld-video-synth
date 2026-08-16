#!/bin/bash
# Push the engine to the deck. Usage: ./deploy.sh [host]
#
# Engine modules only by default — packs are large and change rarely, so
# pass --packs when you have actually added or edited effects.
#
# decks.json is never sent. That file is the machine's own, it is the one
# thing here that cannot be rebuilt from this repo, and overwriting someone's
# setlist from a laptop is precisely the accident this project already had
# once. Use deckvault.py to move setlists around deliberately.
set -eu
HOST="${1:-retropie.local}"
DEST="/home/pi/handheld-video-synth"
shift || true

if ! ssh -o ConnectTimeout=8 -o BatchMode=yes "pi@$HOST" true 2>/dev/null; then
    echo "cannot reach pi@$HOST — is the deck on the same network?" >&2
    exit 1
fi

echo "-> $HOST: engine"
rsync -az -v \
    main.py battery.py deckvault.py glshim.py pi_backend.py launch.sh \
    midi.py jellyfin.py \
    "pi@$HOST:$DEST/"

# The gameplay-capture helpers live in tools/ and pi/, so they need their own
# hop — rsync would otherwise flatten them into the app root. Editing
# pi/runcommand-onend.sh or pi/hvs_record.cfg does NOT re-install them; the
# hook and the retroarch.cfg block are placed by pi/emurec_setup.sh, and the
# hook is a copy. Re-run that on the device after changing either.
echo "-> $HOST: capture helpers"
rsync -az tools/emurec.py "pi@$HOST:$DEST/tools/"
rsync -az pi/emurec_setup.sh pi/runcommand-onend.sh pi/hvs_record.cfg \
    "pi@$HOST:$DEST/pi/"

if [ "${1:-}" = "--packs" ]; then
    echo "-> $HOST: packs (excluding clips and setlists)"
    rsync -az -v --delete \
        --exclude 'clips/' --exclude 'decks.json*' --exclude 'deck_history/' \
        packs/ "pi@$HOST:$DEST/packs/"
fi

echo "-> syntax check on the device"
ssh "pi@$HOST" "cd $DEST && python3 -m py_compile main.py battery.py deckvault.py && echo ok"
echo "done. restart the synth to pick it up."
