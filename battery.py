#!/usr/bin/env python3
"""A battery gauge for hardware that has no battery gauge.

The Pi Zero 2W in a GPi Case cannot see the cell. There is no ADC, no PMIC
ADC (`vcgencmd pmic_read_adc` is not even a registered command on this
firmware), and no free I2C pins for a fuel gauge chip — dtoverlay=dpi24 puts
GPIO 0-27 into the display interface, and GPIO 2/3 are VSYNC/HSYNC in every
DPI mode. So a true percentage is off the table.

What the machine *can* see is the kernel's under-voltage alarm. That turns
out to be more useful than it first looks. A lithium cell's internal
resistance climbs as it empties, so load spikes — GPU, wifi, video decode —
start pulling the 5V rail briefly under threshold long before it stays
there. Those transient dips are real measurement, and they get more frequent
as the pack goes down.

So the gauge runs on two legs:

  * a clock  — elapsed uptime against how long a pack is known to last,
               which interpolates smoothly but starts from an assumption
  * the dips — which know nothing about time but are physically true, and
               which override the clock upward whenever they disagree

And it calibrates itself: the uptime at which the alarm first goes solid is
a direct measurement of this pack's life under this load, so every flat
battery makes the next estimate better.

Honest limits, stated plainly because a gauge that lies is worse than none:
it assumes you started from a full charge, and it cannot detect charging.
A reboot mid-session resets the clock leg (the dips leg still holds).
"""
import glob
import json
import os
import time

CONF = os.path.expanduser("~/.vfxdeck/battery.json")
DEFAULT_LIFE = 4.5 * 3600.0    # seconds; replaced by measurement over time
SAMPLES = 5                    # calibration runs to average
POLL = 0.25                    # seconds between alarm reads (a sysfs int)
DIP_WINDOW = 60.0              # rolling window for counting transients
SOLID = 8.0                    # alarm held this long = genuinely flat


def _sensor():
    """Path to the under-voltage alarm, or None when not on a Pi."""
    for name in glob.glob("/sys/class/hwmon/hwmon*/name"):
        try:
            if open(name).read().strip() == "rpi_volt":
                p = os.path.join(os.path.dirname(name), "in0_lcrit_alarm")
                if os.path.exists(p):
                    return p
        except OSError:
            pass
    return None


def _uptime():
    """Seconds since boot. Boot is the best proxy for 'battery went in' that
    this machine has — it has no RTC, so wall clock is meaningless here."""
    try:
        with open("/proc/uptime") as f:
            return float(f.read().split()[0])
    except (OSError, ValueError):
        return time.monotonic()


class Gauge(object):

    def __init__(self):
        self.path = _sensor()
        self.life = self._learned()
        self.dips = []
        self.stage = 0          # 0 fine, 1 getting low, 2 low, 3 critical
        self.frac = 1.0
        self.low = False        # the old binary flag, still driven from here
        self._prev = False
        self._solid_since = None
        self._next_poll = 0.0
        self._calibrated = False
        self._last_low = 0.0

    # ------------------------------------------------------------- learning
    def _learned(self):
        try:
            with open(CONF) as f:
                s = [float(v) for v in json.load(f).get("runs", [])]
            if s:
                return sum(s[-SAMPLES:]) / len(s[-SAMPLES:])
        except (OSError, ValueError, TypeError):
            pass
        return DEFAULT_LIFE

    def _calibrate(self, secs):
        """The alarm has gone solid: this run's uptime is a measurement of
        how long the pack actually lasts. Keep it and sharpen the estimate."""
        if self._calibrated or secs < 900:     # too short to be a real run
            return
        self._calibrated = True
        runs = []
        try:
            with open(CONF) as f:
                runs = [float(v) for v in json.load(f).get("runs", [])]
        except (OSError, ValueError, TypeError):
            pass
        runs.append(secs)
        runs = runs[-SAMPLES:]
        try:
            os.makedirs(os.path.dirname(CONF), exist_ok=True)
            tmp = CONF + ".tmp"
            with open(tmp, "w") as f:
                json.dump({"runs": runs}, f)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, CONF)
        except OSError:
            pass
        self.life = sum(runs) / len(runs)
        print("battery: pack measured at %.1f h, estimate updated"
              % (self.life / 3600.0))

    # ---------------------------------------------------------------- poll
    def poll(self, now):
        """Cheap enough for the render loop: one small sysfs read, 4x/sec."""
        if not self.path or now < self._next_poll:
            return
        self._next_poll = now + POLL
        try:
            alarm = open(self.path).read().strip() == "1"
        except OSError:
            return

        if alarm:
            if not self._prev:                 # rising edge = one transient
                self.dips.append(now)
            if self._solid_since is None:
                self._solid_since = now
            elif now - self._solid_since > SOLID:
                self._calibrate(_uptime())
        else:
            self._solid_since = None
        self._prev = alarm

        cut = now - DIP_WINDOW
        self.dips = [t for t in self.dips if t > cut]

        up = _uptime()
        self.frac = max(0.0, min(1.0, 1.0 - up / max(600.0, self.life)))

        # the clock interpolates; the dips are ground truth and win ties
        if self.frac > 0.50:
            by_time = 0
        elif self.frac > 0.25:
            by_time = 1
        elif self.frac > 0.10:
            by_time = 2
        else:
            by_time = 3
        n = len(self.dips)
        by_dips = 0 if n == 0 else 1 if n <= 2 else 2 if n <= 5 else 3
        if self._solid_since and now - self._solid_since > SOLID:
            by_dips = 3
        self.stage = max(by_time, by_dips)
        if self.stage >= 2:
            self._last_low = now
        self.low = now - self._last_low < 30.0    # latch, as before

    # --------------------------------------------------------------- label
    def remaining(self):
        """Seconds left by the clock leg, pulled in when the dips say the
        pack is further gone than uptime alone suggests."""
        left = self.frac * self.life
        if self.stage >= 2:
            left = min(left, 0.12 * self.life)
        if self.stage >= 3:
            left = min(left, 0.04 * self.life)
        return left

    def label(self):
        """Compact enough to sit in the HUD's flag area."""
        if not self.path:
            return ""
        bars = 4 - self.stage
        out = "  BATT " + "#" * bars + "." * (4 - bars)
        if self.stage == 3:
            return out + "  !"      # a countdown this close to flat is noise
        if self.stage >= 1:
            secs = self.remaining()
            out += "  ~%dh%02d" % (secs // 3600, (secs % 3600) // 60)
        return out
