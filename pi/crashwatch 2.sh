#!/bin/bash
# Samples the machine once a second to /home/pi/crashwatch.log and fsyncs
# each line, so the last moments survive a hard lockup + reboot.
# Watches the two things a VideoCore wedge shows up in: free relocatable
# GPU memory and the throttled/undervoltage flags.
LOG=/home/pi/crashwatch.log
[ -f "$LOG" ] && mv -f "$LOG" "$LOG.1"
echo "=== crashwatch start $(date +%H:%M:%S) boot_uptime=$(cut -d' ' -f1 /proc/uptime)" >> "$LOG"
while true; do
    p=$(pgrep -f "main.py --rom" | head -1)
    if [ -n "$p" ]; then
        st=$(ps -o state= -p "$p" 2>/dev/null | tr -d ' ')
        cpu=$(awk '{print $14+$15}' "/proc/$p/stat" 2>/dev/null)
    else
        st=NONE
        cpu=-
    fi
    printf '%s up=%s app=%s cpu=%s %s %s %s %s mem=%s\n' \
        "$(date +%H:%M:%S)" "$(cut -d' ' -f1 /proc/uptime)" "$st" "$cpu" \
        "$(vcgencmd get_throttled)" \
        "$(vcgencmd measure_temp)" \
        "$(vcgencmd measure_volts core)" \
        "gpu_reloc=$(vcgencmd get_mem reloc | cut -d= -f2)" \
        "$(free -m | awk '/Mem:/{print $3"/"$2}')" >> "$LOG"
    sync
    sleep 1
done
