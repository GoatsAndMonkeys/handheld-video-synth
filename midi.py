"""USB MIDI input for the HVS-80: class-compliant controllers -> parsed tuples.

Two backends, chosen at init by what the machine offers, both zero-install:

  * Linux/Pi (anything with /dev/snd): ALSA rawmidi character devices
    (/dev/snd/midiC*D*) read directly with os.open/os.read in non-blocking
    mode. The kernel's snd-usb-audio driver claims any class-compliant
    controller with no userspace help, so this path needs no python packages
    at all — which is the point on the Zero 2W (237MB RAM, Buster, no easy
    pip installs). The raw byte stream is parsed here: running status, 2-
    and 3-byte channel messages, SysEx skipped, and realtime bytes
    (0xF8-0xFF) honoured even when they land mid-message, as the wire
    format allows.

  * Desktop: pygame.midi (pygame is already a dependency). portmidi frames
    messages for us, so its packets are decoded directly rather than fed
    through the byte parser — portmidi zero-pads each 4-byte packet, and
    pushing the padding through a running-status parser would fabricate
    messages out of it.

No controller, no pygame.midi, no /dev/snd permissions: MidiIn() still
succeeds, prints one line, and poll() returns [] forever — the instrument
must run exactly as it does today when nothing is plugged in. Hotplug
follows PiInput's shape: when nothing is open, rescan every ~3s; a read
error drops that one device and the rest keep playing.

poll() is called once per rendered frame (~20fps) so it must stay cheap:
one non-blocking read per open device, no allocation beyond the message
tuples themselves. MIDI's wire rate is 3125 bytes/s, so a single 4KB read
per frame can never fall behind a real controller.

Messages (raw MIDI ints 0-127 — the caller scales):

    ("cc",       channel, controller, value)
    ("note_on",  channel, note, velocity)      velocity-0 note-ons arrive
    ("note_off", channel, note, velocity)      as note_off, as they mean
    ("pc",       channel, program)
    ("bend",     channel, value)               14-bit: 0..16383, centre 8192
    ("clock",) ("start",) ("continue",) ("stop",)

channel is 0-based (wire channel 1 == 0). Aftertouch is consumed so the
stream stays in sync but not surfaced — nothing in the instrument wants it.

midi.json (optional, next to this file) overrides DEFAULT_MAPPING:

    {
      "channel": 1,
      "cc":    {"21": "x0", "22": "x1", "23": "x2", "24": "x3",
                "25": "speed"},
      "notes": {"36": "next", "35": "prev"}
    }

  channel — 1-16 to listen to a single channel (poll() then drops channel
            messages from the others); omit or null for omni.
  cc      — CC number (as a JSON string key) -> target name.
  notes   — note number -> event name.

The target/event strings are opaque here: main.py owns what they mean.
MidiIn just carries the table (`mapping` attribute, `channel` attribute)
and answers lookups: cc_target(n) / note_target(n) -> str or None.

Discover a controller's numbers by running `python3 midi.py` and moving
its controls. Python 3.7 compatible; stdlib + (on desktop) pygame only.
"""
import json
import os
import time

DEFAULT_MAPPING = {
    # A guess at a generic controller — anything real gets a midi.json.
    # Mod wheel because every keyboard has one; 71/74/76 because they are
    # the filter/resonance CCs most knobby boxes ship sending; 7 (volume)
    # is usually the fader.
    "channel": None,
    "cc": {"1": "x0", "71": "x1", "74": "x2", "76": "x3", "7": "speed"},
    "notes": {},
}

# Realtime bytes we surface. 0xF9/0xFD are undefined, 0xFE (active sensing)
# and 0xFF (reset) are chatter — all four are swallowed silently.
_REALTIME = {0xF8: ("clock",), 0xFA: ("start",),
             0xFB: ("continue",), 0xFC: ("stop",)}


def _channel_msg(status, d1, d2):
    """One channel-voice message -> tuple, or None for the kinds we drop."""
    kind = status & 0xF0
    ch = status & 0x0F
    if kind == 0x90:
        # velocity-0 note-on is the wire's other spelling of note-off
        # (running status makes it cheaper to send); callers should never
        # have to know that
        return ("note_on", ch, d1, d2) if d2 else ("note_off", ch, d1, 0)
    if kind == 0x80:
        return ("note_off", ch, d1, d2)
    if kind == 0xB0:
        return ("cc", ch, d1, d2)
    if kind == 0xC0:
        return ("pc", ch, d1)
    if kind == 0xE0:
        # the one message wider than 7 bits: the halves are meaningless
        # apart, so combine here. 0..16383, centre 8192.
        return ("bend", ch, d1 | (d2 << 7))
    return None  # 0xA0/0xD0 aftertouch: consumed, not surfaced


class _Parser:
    """Stateful MIDI byte-stream parser, one per rawmidi device.

    Per-device because running status is per-stream: a status byte on one
    cable says nothing about the bytes arriving on another.
    """

    def __init__(self):
        self._status = None   # current running status (channel voice only)
        self._need = 0        # data bytes the current message wants
        self._data = []
        self._sysex = False
        self._skip = 0        # data bytes of a system-common to discard

    def feed(self, buf):
        out = []
        for b in buf:
            if b >= 0xF8:
                # realtime may interrupt anything, even mid-message, and
                # must not disturb the message it interrupts — so handle
                # it before any other state is touched
                msg = _REALTIME.get(b)
                if msg:
                    out.append(msg)
                continue
            if self._sysex:
                if b < 0x80:
                    continue          # SysEx payload: not ours
                self._sysex = False   # any status ends an unterminated dump
                if b == 0xF7:
                    continue          # the proper terminator carries nothing
                # other status bytes fall through and start a fresh message
            if b >= 0x80:
                self._data = []
                if b == 0xF0:
                    self._sysex = True
                    self._status = None   # SysEx cancels running status
                    self._skip = 0
                elif b >= 0xF1:
                    # system common: cancels running status; consume its
                    # data bytes so they can't masquerade as a message
                    self._status = None
                    self._skip = {0xF1: 1, 0xF2: 2, 0xF3: 1}.get(b, 0)
                else:
                    self._status = b
                    self._need = 1 if 0xC0 <= b <= 0xDF else 2
                    self._skip = 0
                continue
            # data byte
            if self._skip:
                self._skip -= 1
                continue
            if self._status is None:
                continue   # orphan — e.g. we opened the device mid-message
            self._data.append(b)
            if len(self._data) == self._need:
                msg = _channel_msg(self._status, self._data[0],
                                   self._data[-1])
                if msg:
                    out.append(msg)
                self._data = []   # keep _status: that IS running status
        return out


class _AlsaMidi:
    """Read /dev/snd/midiC*D* directly — the no-dependencies Pi path."""

    def __init__(self):
        self._fds = {}   # path -> (fd, _Parser)
        self._last_scan = time.time()
        self._scan()
        if not self._fds:
            print("midi: no controller yet — watching /dev/snd")

    def _scan(self):
        import glob
        for path in sorted(glob.glob("/dev/snd/midiC*D*")):
            if path in self._fds:
                continue
            try:
                fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
            except OSError:
                continue   # busy or not ours; maybe next scan
            # fresh parser per open: whatever half-message the device was
            # mid-way through before we arrived must not skew this stream
            self._fds[path] = (fd, _Parser())
            print("midi: reading", path)

    def poll(self):
        out = []
        if not self._fds and time.time() - self._last_scan > MidiIn.RESCAN_S:
            self._scan()   # controller came back? reattach (as PiInput does)
            self._last_scan = time.time()
        dead = []
        for path, (fd, parser) in self._fds.items():
            try:
                buf = os.read(fd, 4096)
            except BlockingIOError:
                continue           # no data this frame — the normal case
            except OSError:
                dead.append(path)  # unplugged: ENODEV/EIO, drop just this one
                continue
            if not buf:
                dead.append(path)  # EOF — device went away quietly
                continue
            out.extend(parser.feed(buf))
        for path in dead:
            fd, _ = self._fds.pop(path)
            try:
                os.close(fd)
            except OSError:
                pass
            print("midi: lost", path)
            self._last_scan = time.time()
        return out

    def close(self):
        for fd, _ in self._fds.values():
            try:
                os.close(fd)
            except OSError:
                pass
        self._fds = {}


class _PygameMidi:
    """portmidi via pygame.midi — the desktop path."""

    def __init__(self):
        import pygame.midi
        self.pm = pygame.midi
        self.pm.init()
        self._devs = []   # (Input, name)
        self._last_scan = time.time()
        self._open_all()
        if not self._devs:
            print("midi: no controller yet — will keep looking")

    def _open_all(self):
        for i in range(self.pm.get_count()):
            _, name, is_input, _, opened = self.pm.get_device_info(i)
            if not is_input or opened:
                continue
            try:
                self._devs.append((self.pm.Input(i),
                                   name.decode(errors="replace")))
                print("midi: opened", self._devs[-1][1])
            except Exception:
                continue   # claimed by another app; the rest still count

    def poll(self):
        out = []
        if not self._devs and time.time() - self._last_scan > MidiIn.RESCAN_S:
            # portmidi enumerates devices once at init: the only way to see
            # one plugged in later is to tear the library down and bring it
            # back — safe here precisely because nothing of ours is open
            try:
                self.pm.quit()
                self.pm.init()
                self._open_all()
            except Exception:
                pass
            self._last_scan = time.time()
        dead = []
        for pair in self._devs:
            dev = pair[0]
            try:
                if not dev.poll():
                    continue
                # one bounded read per frame: 256 events at 20fps outruns
                # any controller, and an unbounded drain loop could wedge
                # the render loop on a flooding device
                for ev in dev.read(256):
                    st, d1, d2 = ev[0][0], ev[0][1], ev[0][2]
                    if st >= 0xF8:
                        msg = _REALTIME.get(st)
                    elif 0x80 <= st < 0xF0:
                        msg = _channel_msg(st, d1, d2)
                    else:
                        msg = None   # SysEx chunks / continuation packets
                    if msg:
                        out.append(msg)
            except Exception:
                dead.append(pair)    # unplugged mid-read: drop just this one
        for pair in dead:
            self._devs.remove(pair)
            try:
                pair[0].close()
            except Exception:
                pass
            print("midi: lost", pair[1])
            self._last_scan = time.time()
        return out

    def close(self):
        for dev, _ in self._devs:
            try:
                dev.close()
            except Exception:
                pass
        self._devs = []
        try:
            self.pm.quit()
        except Exception:
            pass


class MidiIn:
    """USB MIDI input that is safe to construct unconditionally.

    __init__ never raises: with no backend available it prints one line and
    stays disabled, and poll() returns []. See the module docstring for the
    message tuples and the midi.json schema.
    """
    RESCAN_S = 3.0   # matches PiInput: a controller that comes back reattaches

    def __init__(self, config_path=None):
        self.enabled = False
        self.backend = None       # "alsa" | "pygame" | None
        self._impl = None
        self.mapping = {}
        self.channel = None       # 0-based, None = omni
        self._cc_map = {}
        self._note_map = {}
        self._load_config(config_path)
        try:
            # /dev/snd means a Linux ALSA stack: take the zero-dependency
            # raw path even on a Linux desktop — it works the same there
            if os.path.isdir("/dev/snd"):
                self._impl = _AlsaMidi()
                self.backend = "alsa"
            else:
                self._impl = _PygameMidi()
                self.backend = "pygame"
            self.enabled = True
        except Exception as exc:
            print("midi: unavailable (%s) — running without it" % exc)
            self._impl = None

    # -- config ------------------------------------------------------------
    def _load_config(self, path):
        if path is None:
            path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "midi.json")
        self.mapping = {k: (dict(v) if isinstance(v, dict) else v)
                        for k, v in DEFAULT_MAPPING.items()}
        try:
            if os.path.exists(path):
                with open(path) as f:
                    user = json.load(f)
                # replace per-section rather than merging keys: a user who
                # writes a cc table wants THEIR table, not theirs plus five
                # leftover defaults grabbing knobs they never mapped
                for key in ("channel", "cc", "notes"):
                    if key in user:
                        self.mapping[key] = user[key]
                print("midi: mapping loaded from", path)
            self._index()
        except Exception as exc:
            # a broken config must not take the instrument down at boot;
            # fall back to defaults and say why
            print("midi: bad midi.json (%s) — using defaults" % exc)
            self.mapping = {k: (dict(v) if isinstance(v, dict) else v)
                            for k, v in DEFAULT_MAPPING.items()}
            self._index()

    def _index(self):
        ch = self.mapping.get("channel")
        self.channel = (int(ch) - 1) if ch else None
        # JSON keys are strings; int-key the lookups once so cc_target is a
        # plain dict hit in the render loop
        self._cc_map = {int(k): v
                        for k, v in (self.mapping.get("cc") or {}).items()}
        self._note_map = {int(k): v
                          for k, v in (self.mapping.get("notes") or {}).items()}

    def cc_target(self, controller):
        """Mapping target for a CC number, or None if unassigned."""
        return self._cc_map.get(controller)

    def note_target(self, note):
        """Mapping event for a note number, or None if unassigned."""
        return self._note_map.get(note)

    # -- runtime -----------------------------------------------------------
    def poll(self):
        """All messages since the last call; [] when disabled or idle."""
        if self._impl is None:
            return []
        try:
            msgs = self._impl.poll()
        except Exception as exc:
            # backends contain their own failures per-device; anything that
            # escapes is the backend itself dying, and a live set must not
            # die with it
            print("midi: backend failed (%s) — disabling" % exc)
            self.close()
            return []
        if self.channel is not None and msgs:
            # realtime tuples have no channel and always pass through
            msgs = [m for m in msgs if len(m) < 2 or m[1] == self.channel]
        return msgs

    def close(self):
        if self._impl is not None:
            try:
                self._impl.close()
            except Exception:
                pass
            self._impl = None
        self.enabled = False


if __name__ == "__main__":
    # CC discovery: run this, move every control, write down the numbers,
    # put them in midi.json
    m = MidiIn()
    if not m.enabled:
        raise SystemExit(1)
    print("midi: backend=%s — move a control to see its messages, "
          "Ctrl-C quits" % m.backend)
    try:
        while True:
            for msg in m.poll():
                if msg[0] == "clock":
                    continue   # 24 per beat would bury everything else
                extra = ""
                if msg[0] == "cc" and m.cc_target(msg[2]):
                    extra = "  -> " + m.cc_target(msg[2])
                elif msg[0] in ("note_on", "note_off") and m.note_target(msg[2]):
                    extra = "  -> " + m.note_target(msg[2])
                print(msg, extra)
            time.sleep(0.05)   # discovery tool, not the render loop
    except KeyboardInterrupt:
        pass
    finally:
        m.close()
