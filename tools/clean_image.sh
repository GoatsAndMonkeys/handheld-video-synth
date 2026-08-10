#!/bin/bash
# Clean a captured SD image for public release, then shrink it.
# Removes personal data (videos, decks, stream keys, WiFi credentials,
# histories, logs) and runs PiShrink. Requires Docker.
#
# Usage: tools/clean_image.sh hvs-cart.img
# Output: hvs-cart.img.gz (cleaned, shrunk, auto-expanding)
set -e

IMG="$1"
[ -f "$IMG" ] || { echo "usage: $0 <image.img>"; exit 1; }

docker run --privileged --rm -v "$(cd "$(dirname "$IMG")" && pwd)":/workdir \
    --entrypoint /bin/bash monsieurborges/pishrink -c "
set -e
cd /workdir
IMG='$(basename "$IMG")'
LOOP=\$(losetup -fP --show \"\$IMG\")
mkdir -p /mnt/root /mnt/boot
mount \${LOOP}p2 /mnt/root
mount \${LOOP}p1 /mnt/boot

APP=/mnt/root/home/pi/handheld-video-synth
echo '== removing personal data =='
# downloaded videos (keep the generated test card)
find \$APP/packs/*/clips -name '*.mp4' ! -name 'testcard.mp4' -delete 2>/dev/null || true
find \$APP/packs/*/clips -mindepth 1 -type d -empty -delete 2>/dev/null || true
# saved decks, stream keys
rm -f \$APP/packs/*/playlists/deck.json \$APP/stream.json
# WiFi credentials (recipients add their own via the boot partition)
rm -f /mnt/root/etc/wpa_supplicant/wpa_supplicant.conf
# re-enable ssh for first boot; recipients get the headless flow
touch /mnt/boot/ssh
# histories, logs, ssh host keys (regenerate on first boot via dphys)
rm -f /mnt/root/home/pi/.bash_history /mnt/root/root/.bash_history
rm -rf /mnt/root/var/log/*.log /mnt/root/var/log/*/*.log 2>/dev/null || true
rm -f /mnt/root/home/pi/.ssh/authorized_keys

umount /mnt/boot /mnt/root
losetup -d \$LOOP
echo '== shrinking =='
pishrink -z \"\$IMG\"
"
echo "done: ${IMG}.gz — verify by flashing a spare card before publishing"
