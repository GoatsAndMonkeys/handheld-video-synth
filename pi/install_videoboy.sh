#!/bin/bash
# VideoBoy installer — run ON the Pi. Idempotent.
set -e

APP=/home/pi/VideoBoy
ROMS=/home/pi/RetroPie/roms/videoboy
ES_CFG=/etc/emulationstation/es_systems.cfg

echo "== deps =="
python3 - <<'EOF'
missing = []
for m in ("PIL", "numpy", "evdev"):
    try:
        __import__(m)
    except ImportError:
        missing.append(m)
print("MISSING:" + ",".join(missing))
EOF

echo "== dirs =="
mkdir -p "$ROMS"
chmod +x "$APP/pi/launch.sh"
cp "$APP/pi/launch.sh" "$APP/launch.sh"
chmod +x "$APP/launch.sh"

echo "== ES system =="
if grep -q "<name>videoboy</name>" "$ES_CFG"; then
    echo "videoboy system already registered"
else
    sudo cp "$ES_CFG" "$ES_CFG.bak-videoboy"
    sudo python3 - "$ES_CFG" <<'EOF'
import sys
path = sys.argv[1]
entry = """  <system>
    <name>videoboy</name>
    <fullname>VideoBoy</fullname>
    <path>/home/pi/RetroPie/roms/videoboy</path>
    <extension>.vsb .VSB</extension>
    <command>/home/pi/VideoBoy/launch.sh %ROM%</command>
    <platform>videoboy</platform>
    <theme>videoboy</theme>
  </system>
</systemList>"""
with open(path) as f:
    cfg = f.read()
cfg = cfg.replace("</systemList>", entry)
with open(path, "w") as f:
    f.write(cfg)
print("videoboy system registered (backup at %s.bak-videoboy)" % path)
EOF
fi

echo "== done =="
