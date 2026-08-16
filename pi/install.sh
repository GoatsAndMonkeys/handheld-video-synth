#!/bin/bash
# HVS-80 installer — run ON the Pi (RetroPie). Idempotent.
# Installs python deps (piwheels), a static ffmpeg, the EmulationStation
# system, the launcher, and the starter carts.
set -e

APP=/home/pi/handheld-video-synth
ROMS=/home/pi/RetroPie/roms/videosynth
ES_CFG=/etc/emulationstation/es_systems.cfg

echo "== python deps =="
python3 - <<'EOF' || NEED_PIP=1
import PIL, evdev  # noqa
print("Pillow + evdev already present")
EOF
if [ -n "$NEED_PIP" ]; then
    pip3 install --user --index-url https://www.piwheels.org/simple \
        "Pillow==9.5.0" evdev
fi

echo "== ffmpeg =="
if [ ! -x /home/pi/bin/ffmpeg ]; then
    mkdir -p /home/pi/bin
    cd /tmp
    curl -sfL -o ffs.tar.xz \
        https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-armhf-static.tar.xz
    tar xf ffs.tar.xz
    cp ffmpeg-*-armhf-static/ffmpeg /home/pi/bin/
    rm -rf ffmpeg-*-armhf-static ffs.tar.xz
fi
/home/pi/bin/ffmpeg -version | head -1

echo "== launcher + carts =="
mkdir -p "$ROMS"
cp "$APP/pi/launch.sh" "$APP/launch.sh"
chmod +x "$APP/launch.sh" "$APP/pi/launch.sh"
cp -n "$APP"/pi/roms/*.vsb "$ROMS/" 2>/dev/null || true

echo "== theme (logo) =="
THEME_DIR=/etc/emulationstation/themes/carbon-2021
if [ -d "$THEME_DIR" ]; then
    sudo mkdir -p "$THEME_DIR/videosynth"
    sudo cp "$APP/pi/theme/theme.xml" "$APP/pi/theme/logo.png" \
        "$THEME_DIR/videosynth/"
    echo "HVS-80 logo installed into carbon-2021"
else
    echo "carbon-2021 theme not found — shelf will use text fallback"
fi

echo "== EmulationStation system =="
if grep -q "<name>videosynth</name>" "$ES_CFG"; then
    echo "videosynth system already registered"
else
    sudo cp "$ES_CFG" "$ES_CFG.bak-videosynth"
    sudo python3 - "$ES_CFG" <<'EOF'
import sys
path = sys.argv[1]
entry = """  <system>
    <name>videosynth</name>
    <fullname>HVS-80</fullname>
    <path>/home/pi/RetroPie/roms/videosynth</path>
    <extension>.vsb .VSB</extension>
    <command>/home/pi/handheld-video-synth/launch.sh %ROM%</command>
    <platform>videoboy</platform>
    <theme>videosynth</theme>
  </system>
</systemList>"""
with open(path) as f:
    cfg = f.read()
cfg = cfg.replace("</systemList>", entry)
with open(path, "w") as f:
    f.write(cfg)
print("HVS-80 system registered (backup at %s.bak-videosynth)" % path)
EOF
fi

echo "== done — restart EmulationStation (or reboot) to see the HVS-80 shelf =="
echo
echo "   Optional: record your emulators and melt the footage —"
echo "     bash $APP/pi/emurec_setup.sh"
echo "   (kept separate on purpose: it edits RetroArch's own config, and"
echo "    installing the synth should not change how your games play.)"
