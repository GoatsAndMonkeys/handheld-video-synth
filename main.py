#!/usr/bin/env python3
"""HVS-80 (Handheld Video Synth) — a pocket computer for video effects.

Runs on desktop (pygame + OpenGL 2.1) and on the GPi Case's Pi Zero 2W
(dispmanx EGL + GLES2 via pi_backend). Shaders speak the recurBOY/glslViewer
convention: u_tex0 (source), u_tex1 (prev frame), u_time, u_resolution,
u_x0/u_x1/u_x2 (0..1 params). Shader files carry no #version/precision —
glshim prepends the per-platform preamble. Python 3.7 compatible.

Logical controls (GPi buttons / desktop keys):
  L/R shoulders (A/S) . prev/next effect  |  d-pad up/down (arrows) . param row
  d-pad left/right .... adjust param      |  Select (F1) ........... overlay
  Start (Tab) ......... cycle source      |  Select+Start (Esc) .... quit
"""
import argparse
import json
import os
import shutil
import struct
import time

import battery
import deckvault

try:
    import numpy as np  # desktop only (cv2 frames); the Pi path avoids it
except ImportError:
    np = None

from glshim import GL, PREAMBLE, IS_PI

ROOT = os.path.dirname(os.path.abspath(__file__))

VERT_SRC = """
attribute vec2 a_pos;
varying vec2 v_texcoord;
void main() {
    v_texcoord = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
}
"""

ASCII_CHARS = " .:-=+*#%@"

# One size for everything the menus and the patch view draw. There is no
# reason for a row you read while performing to be smaller than the title
# above it, and 320px carries 39 columns of it.
HEAD_ROW_PX = 18    # ~11px cell, 58 columns across the 640px surface.
                    # Up from 16: most rows still carry full labels, and
                    # the fitting ladder trims the few that no longer do.
ROW_STEP = HEAD_ROW_PX + 5   # bigger type needs more than the old 15px
                             # pitch, or rows lap the ones either side


# --------------------------------------------------------------------------
# Platforms: window/input/text live here; GL calls are shared engine code
# --------------------------------------------------------------------------
class DesktopPlatform:
    def __init__(self, w, h):
        os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
        import pygame
        self.pygame = pygame
        pygame.init()
        pygame.display.gl_set_attribute(pygame.GL_CONTEXT_MAJOR_VERSION, 2)
        pygame.display.set_mode((w, h), pygame.OPENGL | pygame.DOUBLEBUF)
        pygame.display.set_caption("HVS-80")
        pygame.key.set_repeat(230, 35)
        for i in range(pygame.joystick.get_count()):
            pygame.joystick.Joystick(i).init()
        self.width, self.height = w, h
        self._v_down = False
        self._v_used = False
        self._clock = pygame.time.Clock()
        pygame.font.init()
        self._font14 = pygame.font.SysFont("Menlo", 14)
        self._font11 = pygame.font.SysFont("Menlo", 11)

    def tick(self, fps):
        return self._clock.tick(fps) / 1000.0

    def flip(self):
        self.pygame.display.flip()

    KEYMAP = {"a": "prev", "s": "next", "tab": "src"}

    def poll(self):
        pg = self.pygame
        out = []
        for e in pg.event.get():
            if e.type == pg.QUIT:
                out.append("quit")
            elif e.type == pg.KEYDOWN:
                k = e.key
                if k == pg.K_ESCAPE:
                    out.append("quit")
                elif k == pg.K_a:
                    out.append("prev")
                elif k == pg.K_s:
                    out.append("next")
                elif k == pg.K_UP:
                    if self._v_down:
                        out.append("lfoband_up")
                        self._v_used = True
                    else:
                        out.append("up")
                elif k == pg.K_DOWN:
                    if self._v_down:
                        out.append("lfoband_down")
                        self._v_used = True
                    else:
                        out.append("down")
                elif k == pg.K_LEFT:
                    out.append("left")
                elif k == pg.K_RIGHT:
                    out.append("right")
                elif k == pg.K_TAB:
                    out.append("src")
                elif k == pg.K_F1:
                    out.append("ui")
                elif k == pg.K_F5:
                    out.append("shot")
                elif k == pg.K_z:
                    out.append("punch_on")
                elif k == pg.K_x:
                    out.append("randomize")
                elif k == pg.K_c:
                    out.append("freeze")
                elif k == pg.K_v:
                    self._v_down = True
                    self._v_used = False
                elif k == pg.K_m:
                    out.append("mode_toggle")
                elif k == pg.K_l:
                    out.append("layer_add")
                elif k == pg.K_BACKSPACE:
                    out.append("layer_clear")
                elif k == pg.K_RIGHTBRACKET:
                    out.append("layer_focus_up")
                elif k == pg.K_LEFTBRACKET:
                    out.append("layer_focus_down")
            elif e.type == pg.KEYUP:
                if e.key == pg.K_z:
                    out.append("punch_off")
                elif e.key == pg.K_v:
                    if not self._v_used:
                        out.append("lfo")
                    self._v_down = False
            elif e.type == pg.JOYBUTTONDOWN:
                if e.button == 4:
                    out.append("prev")
                elif e.button == 5:
                    out.append("next")
            elif e.type == pg.JOYHATMOTION:
                hx, hy = e.value
                if hy == 1:
                    out.append("up")
                elif hy == -1:
                    out.append("down")
                if hx == -1:
                    out.append("left")
                elif hx == 1:
                    out.append("right")
        return out

    def text_image(self, lines, w, h, body_px=None, header=True,
                   row_step=15, scroll=None):
        """Returns bottom-up RGB bytes. Line 0 highlighted, rest dim;
        the [selected] span of line 0 pops in amber. The styling arguments
        are honoured on the Pi renderer; the desktop build keeps its own
        look, but must accept them all or every caller breaks."""
        pg = self.pygame
        surf = pg.Surface((w, h))
        surf.fill((10, 10, 14))
        for i, line in enumerate(lines):
            if i == 0 and "[" in line and "]" in line:
                pre, rest = line.split("[", 1)
                mid, post = rest.split("]", 1)
                x = 8
                for seg, col in ((pre, (120, 255, 150)),
                                 ("[" + mid + "]", (255, 200, 60)),
                                 (post, (120, 255, 150))):
                    if seg:
                        r = self._font14.render(seg, True, col)
                        surf.blit(r, (x, 4))
                        x += r.get_width()
            elif i == 0:
                surf.blit(self._font14.render(line, True, (120, 255, 150)),
                          (8, 4))
            else:
                surf.blit(self._font11.render(line, True, (150, 150, 170)),
                          (8, 26 + (i - 1) * 15))
        return pg.image.tostring(surf, "RGB", True)

    def glyph_atlas(self, chars):
        """Returns (bottom-up RGB bytes, width, height)."""
        pg = self.pygame
        font = pg.font.SysFont("Menlo", 28)
        cw, ch = font.size("@")
        surf = pg.Surface((cw * len(chars), ch))
        surf.fill((0, 0, 0))
        for i, c in enumerate(chars):
            surf.blit(font.render(c, True, (255, 255, 255)), (i * cw, 0))
        return pg.image.tostring(surf, "RGB", True), cw * len(chars), ch

    def save_png(self, raw_topdown, w, h, path):
        pg = self.pygame
        surf = pg.image.frombuffer(raw_topdown, (w, h), "RGB")
        pg.image.save(surf, path)

    def quit(self):
        self.pygame.quit()


class PiPlatform:
    def __init__(self):
        import pi_backend
        self.backend = pi_backend
        self.window = pi_backend.PiWindow()
        pi_backend.init_gl(self.window)
        self.width, self.height = self.window.width, self.window.height
        try:
            self.input = pi_backend.PiInput()
        except Exception as exc:  # no gamepad / no evdev: still render
            print("input unavailable:", exc)
            self.input = None
        self._last = time.time()

    def tick(self, fps):
        now = time.time()
        dt = now - self._last
        wait = (1.0 / fps) - dt
        if wait > 0:
            time.sleep(wait)
            now = time.time()
            dt = now - self._last
        self._last = now
        return dt

    def flip(self):
        self.window.flip()

    def poll(self):
        return self.input.poll() if self.input else []

    def text_image(self, lines, w, h, body_px=None, header=True,
                   row_step=15, scroll=None):
        return self.backend.text_image(lines, w, h, body_px, header,
                                       row_step, scroll)

    def glyph_atlas(self, chars):
        return self.backend.glyph_atlas(chars)

    def save_png(self, raw_topdown, w, h, path):
        self.backend.save_png(raw_topdown, w, h, path)

    def quit(self):
        pass


# --------------------------------------------------------------------------
# GL helpers
# --------------------------------------------------------------------------
def compile_shader(src, kind):
    sid = GL.glCreateShader(kind)
    GL.glShaderSource(sid, src)
    GL.glCompileShader(sid)
    if not GL.glGetShaderiv(sid, GL.GL_COMPILE_STATUS):
        log = GL.glGetShaderInfoLog(sid)
        raise RuntimeError("shader compile failed:\n" +
                           log.decode(errors="replace"))
    return sid


class Program:
    def __init__(self, frag_path):
        with open(frag_path) as f:
            frag_body = f.read()
        vs = compile_shader(PREAMBLE + VERT_SRC, GL.GL_VERTEX_SHADER)
        fs = compile_shader(PREAMBLE + frag_body, GL.GL_FRAGMENT_SHADER)
        self.pid = GL.glCreateProgram()
        GL.glAttachShader(self.pid, vs)
        GL.glAttachShader(self.pid, fs)
        GL.glBindAttribLocation(self.pid, 0, "a_pos")
        GL.glLinkProgram(self.pid)
        if not GL.glGetProgramiv(self.pid, GL.GL_LINK_STATUS):
            raise RuntimeError(GL.glGetProgramInfoLog(self.pid).decode(errors="replace"))
        self._locs = {}
        # static effects (no clock) get their speed slot hidden in the UI,
        # and only shaders that declare u_x3 show a 4th param slot
        self.uses_time = ("u_time" in frag_body) or ("ftime" in frag_body)
        self.uses_x3 = "u_x3" in frag_body
        # u_a0/u_a1/u_a2 are bass/level/highs — a shader that reads any of
        # them moves with the music, which is worth knowing before you stack
        # it. Only 12 of the ~100 effects do, so the mark stays meaningful.
        self.uses_audio = any(u in frag_body for u in ("u_a0", "u_a1", "u_a2"))

    def loc(self, name):
        if name not in self._locs:
            self._locs[name] = GL.glGetUniformLocation(self.pid, name)
        return self._locs[name]

    def use(self):
        GL.glUseProgram(self.pid)

    def set1f(self, name, v):
        l = self.loc(name)
        if l >= 0:
            GL.glUniform1f(l, v)

    def set2f(self, name, x, y):
        l = self.loc(name)
        if l >= 0:
            GL.glUniform2f(l, x, y)

    def set4f(self, name, a, b, c, d):
        l = self.loc(name)
        if l >= 0:
            GL.glUniform4f(l, a, b, c, d)

    def set_tex(self, name, unit, tex):
        l = self.loc(name)
        if l >= 0:
            GL.glActiveTexture(GL.GL_TEXTURE0 + unit)
            GL.glBindTexture(GL.GL_TEXTURE_2D, tex)
            GL.glUniform1i(l, unit)


def make_texture(w, h, data=None, nearest=False, repeat=False):
    tex = GL.glGenTextures(1)
    GL.glBindTexture(GL.GL_TEXTURE_2D, tex)
    filt = GL.GL_NEAREST if nearest else GL.GL_LINEAR
    wrap = GL.GL_REPEAT if repeat else GL.GL_CLAMP_TO_EDGE
    GL.glTexParameteri(GL.GL_TEXTURE_2D, GL.GL_TEXTURE_MIN_FILTER, filt)
    GL.glTexParameteri(GL.GL_TEXTURE_2D, GL.GL_TEXTURE_MAG_FILTER, filt)
    GL.glTexParameteri(GL.GL_TEXTURE_2D, GL.GL_TEXTURE_WRAP_S, wrap)
    GL.glTexParameteri(GL.GL_TEXTURE_2D, GL.GL_TEXTURE_WRAP_T, wrap)
    GL.glPixelStorei(GL.GL_UNPACK_ALIGNMENT, 1)
    GL.glTexImage2D(GL.GL_TEXTURE_2D, 0, GL.GL_RGB, w, h, 0,
                    GL.GL_RGB, GL.GL_UNSIGNED_BYTE, data)
    return tex


def upload_raw(tex, w, h, raw):
    """raw: bottom-up RGB bytes."""
    GL.glBindTexture(GL.GL_TEXTURE_2D, tex)
    GL.glPixelStorei(GL.GL_UNPACK_ALIGNMENT, 1)
    GL.glTexSubImage2D(GL.GL_TEXTURE_2D, 0, 0, 0, w, h,
                       GL.GL_RGB, GL.GL_UNSIGNED_BYTE, raw)


def _migrate_slots(step):
    """Bring a step up to 4 params + speed. Saved files from the 3-param
    era keep the speed flag in slot 3, which is now x3's — move it along
    rather than silently turning someone's speed LFO into an x3 LFO."""
    step["x"] = [float(v) for v in step["x"]]
    while len(step["x"]) < 4:
        step["x"].append(0.5)
    for key, fill in (("lfo", False), ("lfoband", 3)):
        vals = list(step.get(key, []))
        if len(vals) == 4:                  # old [x0, x1, x2, speed]
            vals.insert(3, fill)
        while len(vals) < 5:
            vals.append(fill)
        step[key] = vals[:5]


def _rss_mb():
    """Resident set size, MB. The Pi has ~237MB to play with before the
    kernel starts killing things, so this is worth watching."""
    try:
        with open("/proc/self/statm") as f:
            return int(f.read().split()[1]) * 4096 // (1024 * 1024)
    except Exception:
        import resource
        rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return rss // (1024 * 1024) if rss > 1 << 20 else rss // 1024


def make_bayer_texture():
    b = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
    raw = bytes(v for cell in b
                for v in [int((cell + 0.5) / 16.0 * 255)] * 3)
    return make_texture(4, 4, raw, nearest=True, repeat=True)


# --------------------------------------------------------------------------
# Sources
# --------------------------------------------------------------------------
# (name, url, group, blurb). A group puts the station behind a submenu so
# twenty of them do not bury "off" and "clip" at the top of one long list.
# The NTS entries came from https://www.nts.live/api/v2/mixtapes — refresh
# with tools/refresh_nts.py if they ever retire or add a channel.
RADIO_STATIONS = [
    ("off", None, None, ""),
    ("clip", "__CLIP__", None, ""),   # sound of the current video clip
    ("NTS 1", "https://stream-relay-geo.ntslive.net/stream",
     "NTS", "live channel 1"),
    ("NTS 2", "https://stream-relay-geo.ntslive.net/stream2",
     "NTS", "live channel 2"),
    ("Poolside", "https://stream-mixtape-geo.ntslive.net/mixtape4",
     "NTS", "balearic & boogie"),
    ("Slow Focus", "https://stream-mixtape-geo.ntslive.net/mixtape",
     "NTS", "ambient, drone, ragas"),
    ("Low Key", "https://stream-mixtape-geo.ntslive.net/mixtape2",
     "NTS", "lo-fi hip-hop & R&B"),
    ("Memory Lane", "https://stream-mixtape-geo.ntslive.net/mixtape6",
     "NTS", "psychedelia"),
    ("4 To The Floor", "https://stream-mixtape-geo.ntslive.net/mixtape5",
     "NTS", "house & techno"),
    ("Island Time", "https://stream-mixtape-geo.ntslive.net/mixtape21",
     "NTS", "reggae & dub"),
    ("The Tube", "https://stream-mixtape-geo.ntslive.net/mixtape26",
     "NTS", "post-punk & minimal"),
    ("Sheet Music", "https://stream-mixtape-geo.ntslive.net/mixtape35",
     "NTS", "classical & modern"),
    ("Feelings", "https://stream-mixtape-geo.ntslive.net/mixtape27",
     "NTS", "soul, gospel, boogie"),
    ("Expansions", "https://stream-mixtape-geo.ntslive.net/mixtape3",
     "NTS", "jazz, expanded"),
    ("Rap House", "https://stream-mixtape-geo.ntslive.net/mixtape22",
     "NTS", "808s & champagne"),
    ("Labyrinth", "https://stream-mixtape-geo.ntslive.net/mixtape31",
     "NTS", "enter the void"),
    ("Sweat", "https://stream-mixtape-geo.ntslive.net/mixtape24",
     "NTS", "global party music"),
    ("Otaku", "https://stream-mixtape-geo.ntslive.net/mixtape36",
     "NTS", "game & anime OSTs"),
    ("The Pit", "https://stream-mixtape-geo.ntslive.net/mixtape34",
     "NTS", "ancient metal bards"),
    ("Field Recordings", "https://stream-mixtape-geo.ntslive.net/mixtape23",
     "NTS", "natural ambience"),
]


def radio_groups():
    """{group name: [station index, ...]} in declaration order."""
    out = {}
    for i, st in enumerate(RADIO_STATIONS):
        if st[2]:
            out.setdefault(st[2], []).append(i)
    return out


class RadioAudio:
    """Streams a radio station: plays it aloud and analyzes it for reactivity.

    Two processes: one decodes to a non-blocking PCM pipe we analyze each
    frame (level/bass/highs with attack-release envelopes), one plays audio
    out (ALSA on the Pi, ffplay on desktop). Failures never touch rendering.
    """
    RATE = 22050

    def __init__(self, ffmpeg):
        self.ffmpeg = ffmpeg or "ffmpeg"
        self.proc = None
        self.play = None
        self.station_idx = 0
        self.current_path = None
        self._pending = None
        self._deaths = 0
        self.level = 0.0
        self.bass = 0.0
        self.high = 0.0
        self.tap = b""      # raw PCM consumed this tick (streamer mirror)
        self._lp = 0.0
        self._peaks = [1e-4, 1e-4, 1e-4]  # auto-gain per band

    @property
    def active(self):
        return self.proc is not None

    @property
    def label(self):
        return RADIO_STATIONS[self.station_idx][0]

    @property
    def is_clip(self):
        return self.label == "clip"

    @property
    def target_path(self):
        return self._pending[1] if self._pending is not None else self.current_path

    def cycle(self, delta, clip_path=None):
        self.station_idx = (self.station_idx + delta) % len(RADIO_STATIONS)
        self._pending = (time.time() + 0.35, clip_path)

    def retune(self, clip_path):
        if self._pending is not None and self._pending[1] == clip_path:
            return  # already scheduled; don't keep resetting the timer
        self._pending = (time.time() + 0.35, clip_path)

    def _tune(self, clip_path):
        name, url = RADIO_STATIONS[self.station_idx][:2]
        self.stop()
        self.current_path = None
        if name == "clip":
            if clip_path:
                self.start(clip_path, is_file=True)
                self.current_path = clip_path
        elif url:
            self.start(url)

    def start(self, src, is_file=False, with_sound=True):
        import subprocess
        import fcntl
        pre = ["-stream_loop", "-1", "-re"] if is_file else []
        cmd = ([self.ffmpeg, "-loglevel", "quiet"] + pre + ["-i", src,
                "-f", "s16le", "-ac", "1", "-ar", str(self.RATE), "pipe:1"])
        if IS_PI and with_sound:
            # one process, two outputs: analysis pipe + speaker (saves ~a
            # whole ffmpeg on a 237MB machine)
            cmd += ["-f", "alsa", "default"]
        self._src = (src, is_file)
        try:
            self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
            fl = fcntl.fcntl(self.proc.stdout, fcntl.F_GETFL)
            fcntl.fcntl(self.proc.stdout, fcntl.F_SETFL, fl | os.O_NONBLOCK)
        except Exception as exc:
            print("radio analysis failed:", exc)
            self.proc = None
            return
        if not IS_PI:
            try:
                loop = ["-loop", "0"] if is_file else []
                self.play = subprocess.Popen(
                    ["ffplay", "-nodisp", "-loglevel", "quiet"] + loop + [src])
            except Exception:
                self.play = None  # silent but still reactive

    @staticmethod
    def _reap(p):
        try:
            p.kill()
            p.wait(timeout=0.5)
            if p.stdout:
                p.stdout.close()
        except Exception:
            pass

    def pause(self, flag):
        import signal
        for p in (self.proc, self.play):
            if p is not None:
                try:
                    os.kill(p.pid, signal.SIGSTOP if flag else signal.SIGCONT)
                except Exception:
                    pass

    def stop(self):
        self._pending = None
        for p in (self.proc, self.play):
            if p is not None:
                self._reap(p)
        self.proc = None
        self.play = None

    def update(self):
        if self._pending is not None:
            deadline, clip_path = self._pending
            if time.time() >= deadline:
                self._pending = None
                self._deaths = 0
                self._tune(clip_path)
        if self.proc is None:
            self.level *= 0.9
            self.bass *= 0.9
            self.high *= 0.9
            return
        if self.proc.poll() is not None:
            # process died (often the audio device still closing from the
            # previous station): retry with sound before giving it up
            self._reap(self.proc)
            self.proc = None
            src = getattr(self, "_src", None)
            self._deaths += 1
            if src is not None and self._deaths <= 5:
                self.start(src[0], is_file=src[1],
                           with_sound=self._deaths <= 2)
            return
        import array
        try:
            data = self.proc.stdout.read(16384)
        except (BlockingIOError, OSError):
            data = None
        if not data:
            self.tap = b""
            return
        self.tap = data          # this tick's PCM — the streamer mirrors it
        a = array.array("h", data[:len(data) // 2 * 2])
        lp = self._lp
        n = 0
        acc = 0.0
        accb = 0.0
        acch = 0.0
        for i in range(0, len(a), 4):        # analyze every 4th sample
            x = a[i] / 32768.0
            lp += 0.12 * (x - lp)            # one-pole lowpass ~ bass
            hp = x - lp                      # residual ~ highs
            acc += x * x
            accb += lp * lp
            acch += hp * hp
            n += 1
        if not n:
            return
        self._lp = lp
        raw = [(accb / n) ** 0.5, (acc / n) ** 0.5, (acch / n) ** 0.5]
        vals = []
        for i, r in enumerate(raw):          # auto-gain: track slow peaks
            self._peaks[i] = max(self._peaks[i] * 0.9990, r, 1e-4)
            vals.append(min(1.0, r / self._peaks[i]))
        # fast attack, slow release
        self.bass = max(self.bass * 0.88, vals[0])
        self.level = max(self.level * 0.92, vals[1])
        self.high = max(self.high * 0.90, vals[2])


class Streamer:
    """Pushes rendered frames + the current audio to an RTMP endpoint (or a
    file) through one ffmpeg. Video rides the Pi's hardware H.264 encoder;
    audio is decoded from the same source the instrument is playing. Frames
    are dropped rather than ever blocking the render loop."""

    def __init__(self, ffmpeg, w, h, fps, dest):
        import subprocess
        import fcntl
        self.frame_size = w * h * 3
        # wallclock timestamps: frames arrive at render pace, not the
        # nominal fps — stamping arrival time keeps audio/video clocks
        # aligned (nominal stamps made audio drift behind and cut out).
        # It goes on *both* inputs; see the audio pipe below for why.
        # Recording talks: its stderr goes to a log nobody reads mid-set, so
        # verbosity is free there, and "error" told us nothing for a whole
        # evening of zero-byte files. Live output stays quiet — its stderr
        # is the app's own.
        to_file = not dest.startswith(("rtmp", "udp:", "srt:"))
        cmd = [ffmpeg, "-loglevel", "info" if to_file else "error"]
        if to_file:
            cmd += ["-stats", "-stats_period", "2"]
        cmd += ["-f", "rawvideo", "-pix_fmt", "rgb24",
               "-s", "%dx%d" % (w, h), "-r", str(fps),
               "-use_wallclock_as_timestamps", "1", "-i", "pipe:0"]
        # audio = the exact PCM the instrument is playing (clip sound or
        # radio), fed live via push_audio — the stream carries what you hear
        #
        # Both inputs must be stamped the same way. Wallclock stamps put video
        # at Unix epoch seconds; raw PCM with no stamps starts at zero. ffmpeg
        # reads whichever input is furthest behind, so a zero-based audio pipe
        # is chased forever against a video clock 56 years ahead and video's
        # stdin is never drained again — the writer blocks mid-frame, the
        # muxer never opens the output, and the recording is 0 bytes.
        # Measured on the deck: 4 frames drained before the stall with the
        # flag on video alone, 78 with it on both.
        self._ar, self._aw = os.pipe()
        os.set_blocking(self._aw, False)
        cmd += ["-use_wallclock_as_timestamps", "1",
                "-f", "s16le", "-ar", "22050", "-ac", "1",
                "-i", "pipe:%d" % self._ar]
        # the Pi hw encoder emits SPS/PPS + IDR exactly once, so late
        # joiners on a UDP stream can never sync — the mixer path uses
        # software x264 (measured 2x realtime on the Zero 2W). rtmp and
        # file recording keep the free hw encoder.
        udp = dest.startswith(("udp:", "srt:"))
        if IS_PI and udp:
            vcodec = ["-c:v", "libx264", "-preset", "ultrafast",
                      "-tune", "zerolatency"]
        elif IS_PI:
            # the driver's own words: "All capture buffers returned to
            # userspace. Increase num_capture_buffers to prevent device
            # deadlock" — and a deadlock at frame=2 is what a recording
            # died of. The default is 4; give it real headroom.
            vcodec = ["-c:v", "h264_v4l2m2m", "-num_capture_buffers", "64"]
        else:
            vcodec = ["-c:v", "libx264", "-preset", "veryfast"]
        # mixer rides the LAN: quality-targeted, capped at 6mbit. rtmp keeps
        # a fixed upstream-friendly budget. Files answer to nobody's uplink —
        # a recording is the master copy of a set, so it gets bitrate to
        # spare (~35MB/min; the card holds hours).
        if udp and "libx264" in vcodec:
            quality = ["-crf", "16", "-maxrate", "8000k", "-bufsize", "4000k"]
        elif to_file:
            quality = ["-b:v", "4500k"]
        else:
            quality = ["-b:v", "1200k"]
        # Wallclock stamps exist to balance INPUT reading (without them on
        # both pipes, ffmpeg chased one input forever and recordings were
        # 0 bytes). But they are burst-jittered, and letting aresample=async
        # chase them stuffed and dropped samples audibly — recordings came
        # out warbly. So after the inputs are read, both clocks are rebuilt
        # smooth: audio purely from sample count (the PCM is continuous, so
        # counting samples IS the correct clock), video zero-based on its
        # first frame. Nothing is resampled, nothing warbles.
        cmd += (["-map", "0:v", "-map", "1:a",
                 "-vf", "vflip,setpts=PTS-STARTPTS"] + vcodec +
                quality +
                ["-g", str(fps * 2), "-pix_fmt", "yuv420p",
                 "-af", "asetpts=N/SR/TB",
                 "-c:a", "aac", "-b:a", "96k", "-ar", "44100", "-shortest"])
        # -shortest belongs on every destination, file included. It was moved
        # off the file path on the theory that it truncates a recording made
        # with no audio source — and that broke recording outright, because
        # without it the muxer sits waiting on two live pipes that never end
        # and never opens the output at all. Recordings worked with it and
        # stopped working without it; leave it alone.
        if dest.startswith("rtmp"):
            cmd += ["-f", "flv", dest]
        elif dest.startswith(("udp:", "srt:")):
            cmd += ["-f", "mpegts", "-flush_packets", "1", dest]
        else:
            cmd += ["-y", dest]
        # Keep the encoder's own words. Recordings failed silently for a
        # whole evening because nothing captured them: -loglevel error with
        # an inherited stderr printed nothing at all, which left no way to
        # tell a crash from a stall from an empty input.
        self.log_path = "/home/pi/ffmpeg_rec.log" if IS_PI else "/tmp/ffmpeg_rec.log"
        try:
            self._errlog = open(self.log_path, "w")
            self._errlog.write(" ".join(cmd) + "\n\n")
            self._errlog.flush()
        except OSError:
            self._errlog = None
        # one hardware encoder: if the previous take is still finalizing in
        # its background thread, starting now would fight it for /dev/video11
        prev = getattr(Streamer, "_finishing", None)
        if prev is not None and prev.is_alive():
            print("recorder: waiting for the previous take to finalize")
            prev.join(timeout=125)
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE,
                                     stderr=self._errlog or None,
                                     pass_fds=(self._ar,))
        os.close(self._ar)
        self.dead = False
        # frames are ~1MB — far beyond a pipe buffer — so a writer thread
        # does blocking whole-frame writes; push() drops when it's behind
        import queue
        import threading
        self.written = 0
        self._q = queue.Queue(maxsize=2)
        self._thread = threading.Thread(target=self._writer, daemon=True)
        self._thread.start()

    def _writer(self):
        while True:
            raw = self._q.get()
            if raw is None:
                break
            try:
                self.proc.stdin.write(raw)
                self.written += 1
                if self.written in (1, 10, 100):
                    # the one fact never captured: whether frames actually
                    # reach the encoder. Detecting a rawvideo stream proves
                    # nothing — that comes from the -f/-s flags, not data.
                    print("recorder: %d frame(s) written, %d bytes each"
                          % (self.written, len(raw)))
            except (BrokenPipeError, OSError) as exc:
                print("recorder: pipe closed after %d frame(s): %s"
                      % (self.written, exc))
                self.dead = True
                break
            except Exception as exc:
                # anything else killed this thread silently before, which
                # looks identical to the encoder never receiving a frame
                print("recorder: writer died after %d frame(s): %r"
                      % (self.written, exc))
                self.dead = True
                break
        try:
            self.proc.stdin.close()
        except Exception:
            pass

    def push(self, raw):
        if self.dead or self.proc.poll() is not None:
            self.dead = True
            return
        try:
            self._q.put_nowait(raw)
        except Exception:
            pass  # encoder behind: drop the frame, never stall the instrument

    def push_audio(self, pcm):
        if not pcm or self.dead:
            return
        try:
            os.write(self._aw, pcm)
        except (BlockingIOError, BrokenPipeError, OSError):
            pass  # pipe full or encoder gone: drop, never stall

    def close(self):
        try:
            os.close(self._aw)
        except OSError:
            pass
        try:
            self._q.put(None, timeout=1)
        except Exception:
            pass
        # Finalizing is ffmpeg draining its backlog and writing the moov
        # index, and at 0.78x realtime the backlog is real: a 76-second take
        # needed well over the 8 seconds this used to allow, got killed
        # mid-flush, and the file had no index — every byte present, nothing
        # able to play it. Waiting here froze the instrument instead, so the
        # wait moves to a thread and gets a budget that assumes the encoder
        # is behind by a whole song.
        import threading
        proc, thread = self.proc, self._thread

        def _finish():
            thread.join(timeout=5)
            try:
                proc.wait(timeout=120)
                print("recorder: finalized clean")
            except Exception:
                try:
                    proc.kill()
                    proc.wait(timeout=5)
                except Exception:
                    pass
                print("recorder: killed after 120s — recording has no index")

        t = threading.Thread(target=_finish, daemon=True)
        t.start()
        Streamer._finishing = t


def load_stream_cfg():
    """stream.json next to the app: {"url": rtmp base, "key": stream key,
    "mixer": udp destination}. All optional; mixer has a default."""
    cfg = {}
    path = os.path.join(ROOT, "stream.json")
    if os.path.exists(path):
        with open(path) as f:
            cfg = json.load(f)
    url = cfg.get("url", "").rstrip("/")
    key = cfg.get("key", "")
    return {
        "live": (url + "/" + key) if url and key else None,
        "mixer": cfg.get("mixer",
                         "udp://MacBook-Pro-4.local:5001?pkt_size=1316"),
    }


def _find_ffmpeg():
    import shutil
    ff = shutil.which("ffmpeg")
    if ff:
        return ff
    home_ff = os.path.expanduser("~/bin/ffmpeg")
    return home_ff if os.path.exists(home_ff) else None


def _crush_label(level):
    """Name the level by what it does, not by libjpeg's q number."""
    if level <= 0:
        return "off"
    q, gens = _FFClip.CRUSH[level]
    return "q%d" % q if gens == 1 else "q%d, saved %dx" % (q, gens)


class _FFClip:
    """Looping realtime rawvideo pipe from ffmpeg — clip decode without
    OpenCV. -re paces decode to wall-clock so clip video stays in step with
    its audio; we read non-blocking and show the newest complete frame,
    dropping any we're too slow for."""

    # Real JPEG, not an impression of one — libjpeg does the damage in its
    # own process. Each level is (quality, generations). ffmpeg's mjpeg
    # quality bottoms out at 31, so harder levels re-encode what is already
    # a crushed JPEG: generation loss, the way an image looks after being
    # saved and re-saved. Every level stays at full resolution, so what you
    # see is blocking and ringing and not a rescale blur wearing its coat.
    CRUSH = [None, (24, 1), (31, 1), (31, 2), (31, 3), (31, 4)]

    # crushed frames are tiny, and left to probe, the decoder waits to fill
    # its default probesize before emitting anything — which takes most of a
    # minute and looks exactly like the source having died
    JPEG_IN = ["-f", "mjpeg", "-framerate", "30",
               "-probesize", "32", "-analyzeduration", "0"]

    def __init__(self, path, w, h, ffmpeg, crush=0):
        import subprocess
        import fcntl
        self.frame_size = w * h * 3
        self.chain = []          # every process spawned, in spawn order
        vf = ("scale=%d:%d:force_original_aspect_ratio=increase,"
              "crop=%d:%d,vflip" % (w, h, w, h))
        quiet = [ffmpeg, "-loglevel", "quiet", "-skip_loop_filter", "all"]
        step = self.CRUSH[crush] if 0 < crush < len(self.CRUSH) else None

        feed = None
        if step is not None:
            q, gens = step
            # raw mjpeg: literally one JPEG file after another. mpegts takes
            # the mux without complaint and then decodes to nothing at all,
            # which is a quiet way to lose the picture entirely.
            jpeg_out = ["-c:v", "mjpeg", "-q:v", str(q),
                        "-pix_fmt", "yuvj420p", "-f", "mjpeg", "pipe:1"]
            first = subprocess.Popen(quiet + ["-re", "-i", path] + jpeg_out,
                                     stdout=subprocess.PIPE,
                                     bufsize=self.frame_size)
            self.chain.append(first)
            feed = first.stdout
            for _ in range(gens - 1):       # each pass is another real save
                nxt = subprocess.Popen(
                    quiet + self.JPEG_IN + ["-i", "pipe:0"] + jpeg_out,
                    stdin=feed, stdout=subprocess.PIPE,
                    bufsize=self.frame_size)
                feed.close()                # the child owns it now
                self.chain.append(nxt)
                feed = nxt.stdout

        self.proc = subprocess.Popen(
            quiet + (self.JPEG_IN if feed else ["-re"])
            + ["-i", "pipe:0" if feed else path,
               "-f", "rawvideo", "-pix_fmt", "rgb24", "-vf", vf, "pipe:1"],
            stdin=feed, stdout=subprocess.PIPE, bufsize=self.frame_size * 4)
        if feed is not None:
            feed.close()     # holding it open here would keep the pipe from
        self.chain.append(self.proc)              # ever reaching end-of-file
        fl = fcntl.fcntl(self.proc.stdout, fcntl.F_GETFL)
        fcntl.fcntl(self.proc.stdout, fcntl.F_SETFL, fl | os.O_NONBLOCK)
        # a bytearray grows and trims in place; concatenating bytes would
        # copy the whole backlog every frame
        self._buf = bytearray()

    def read(self):
        """Newest complete frame, or None if nothing new arrived."""
        try:
            while True:
                chunk = self.proc.stdout.read(self.frame_size * 2)
                if not chunk:
                    break
                self._buf += chunk
        except (BlockingIOError, OSError):
            pass
        nf = len(self._buf) // self.frame_size
        if nf == 0:
            return None
        end = nf * self.frame_size
        frame = bytes(memoryview(self._buf)[end - self.frame_size:end])
        del self._buf[:end]
        return frame

    def done(self):
        """Video ended: decoder exited and no whole frame remains buffered."""
        return (self.proc.poll() is not None
                and len(self._buf) < self.frame_size)

    def close(self):
        # source end first, then downstream: killing the reader while a
        # writer is still going leaves it blocked on a pipe nobody drains,
        # and it would sit there holding a core until the app exits
        for p in self.chain:
            try:
                p.kill()
                p.wait(timeout=2)
            except Exception:
                pass
        try:
            self.proc.stdout.close()
        except Exception:
            pass


class Sources:
    """Slots: gen (shader pattern), one per clip in the pack, cam (webcam)."""

    def __init__(self, w, h, clips_dir, dims=None):
        # default: decode/capture at half res — GPU upscaling is free, lo-fi
        # is the brand, and half res is what keeps the Zero 2W near 20fps.
        # dims overrides decode res (desktop: engine res; Pi: 480x360 is
        # the measured ceiling — 640x480 saturates a core).
        if dims:
            self.w, self.h = dims
        else:
            self.w, self.h = max(320, w // 2), max(240, h // 2)
        self.clips_dir = clips_dir
        self.tex = make_texture(self.w, self.h)
        self._cap = None
        self._cap_path = None
        self._cam = None
        self._cv2_warned = False
        self._ffmpeg = _find_ffmpeg()
        self._ff = None
        self._ff_path = None
        self.crush = 0          # real-JPEG level applied to clips on the way in
        self._ff_crush = 0
        self.slots = self._scan()
        self.slot_idx = 0
        self._held = False      # freeze holds the picture, not the decoder

    def _cv2(self):
        try:
            import cv2
            return cv2
        except ImportError:
            if not self._cv2_warned:
                print("opencv not available — clip/cam sources disabled")
                self._cv2_warned = True
            return None

    def _scan(self):
        """Every pack's clips, not just the current one — the video library
        is a live choice that outlives whichever effect deck is loaded."""
        import glob
        slots = [("gen", None)]
        has_cv2 = self._cv2() is not None
        if has_cv2 or self._ffmpeg:
            own = os.path.dirname(self.clips_dir.rstrip(os.sep))
            dirs = [self.clips_dir]      # current pack first
            dirs += [d for d in sorted(glob.glob(
                os.path.join(ROOT, "packs", "*", "clips")))
                if os.path.dirname(d.rstrip(os.sep)) != own]
            for d in dirs:
                for p in (sorted(glob.glob(os.path.join(d, "*.mp4"))) +
                          sorted(glob.glob(os.path.join(d, "*", "*.mp4")))):
                    slots.append(("clip", p))
        if has_cv2:
            slots.append(("cam", None))
        return slots

    @staticmethod
    def _collection_of(path):
        folder = os.path.basename(os.path.dirname(path))
        return "misc" if folder == "clips" else folder

    def collections(self):
        """Ordered {collection_name: [slot indices]} — subfolder per
        playlist, loose clips under 'misc'."""
        cols = {}
        for i, (k, p) in enumerate(self.slots):
            if k != "clip":
                continue
            cols.setdefault(self._collection_of(p), []).append(i)
        return cols

    @property
    def mode(self):
        return self.slots[self.slot_idx][0]

    @property
    def label(self):
        kind, path = self.slots[self.slot_idx]
        if kind == "clip":
            return os.path.splitext(os.path.basename(path))[0][:12]
        return kind

    def select(self, kind):
        for i, (k, _) in enumerate(self.slots):
            if k == kind:
                self.slot_idx = i
                return

    def rescan(self):
        """Pick up newly added clips (e.g. fresh recordings)."""
        cur = self.slots[self.slot_idx]
        self.slots = self._scan()
        if cur in self.slots:
            self.slot_idx = self.slots.index(cur)
        else:
            self.slot_idx = min(self.slot_idx, len(self.slots) - 1)

    def _post_switch(self):
        if self.mode != "cam" and self._cam is not None:
            self._cam.release()
            self._cam = None
        if self.mode != "clip" and self._ff is not None:
            self._ff.close()
            self._ff = None
            self._ff_path = None

    def cycle(self, delta=1):
        self.slot_idx = (self.slot_idx + delta) % len(self.slots)
        self._post_switch()

    def hold(self, flag):
        """Hold the picture on the current frame. The decoder keeps running
        and its frames are dropped, so sound never stops and letting go
        rejoins the clip where it actually is now."""
        self._held = flag

    def pause(self, flag):
        """Stop the clip decoder dead (SIGSTOP keeps the exact moment).
        Unused by freeze — that holds the picture instead."""
        import signal
        if self._ff is not None:
            try:
                os.kill(self._ff.proc.pid,
                        signal.SIGSTOP if flag else signal.SIGCONT)
            except Exception:
                pass

    def advance(self):
        """Video finished: play the next one in the same collection."""
        kind, _ = self.slots[self.slot_idx]
        if kind != "clip":
            return
        for idxs in self.collections().values():
            if self.slot_idx in idxs:
                self.slot_idx = idxs[(idxs.index(self.slot_idx) + 1)
                                     % len(idxs)]
                break
        self._post_switch()

    def next_clip(self):
        """Jump between clips only — Start button = video cycler."""
        idxs = [i for i, (k, _) in enumerate(self.slots) if k == "clip"]
        if not idxs:
            self.cycle(1)
            return
        if self.slot_idx in idxs:
            self.slot_idx = idxs[(idxs.index(self.slot_idx) + 1) % len(idxs)]
        else:
            self.slot_idx = idxs[0]
        self._post_switch()

    def update(self):
        kind, path = self.slots[self.slot_idx]
        if kind == "gen":
            return True
        cv2 = self._cv2()
        if kind == "clip" and cv2 is None:
            if self._ffmpeg is None:
                self.slot_idx = 0
                return False
            if (self._ff is None or self._ff_path != path
                    or self._ff_crush != self.crush):
                if self._ff is not None:
                    self._ff.close()
                self._ff = _FFClip(path, self.w, self.h, self._ffmpeg,
                                   self.crush)
                self._ff_path = path
                self._ff_crush = self.crush
            raw = self._ff.read()
            if raw is not None and not self._held:  # None = no new frame yet
                upload_raw(self.tex, self.w, self.h, raw)
            elif self._ff.done():
                self.advance()   # video over: next in the collection
            return True
        if cv2 is None:
            self.slot_idx = 0
            return False
        if kind == "clip":
            if self._cap is None or self._cap_path != path:
                if self._cap is not None:
                    self._cap.release()
                self._cap = cv2.VideoCapture(path)
                self._cap_path = path
                if not self._cap.isOpened():
                    self._cap = None
                    self.slot_idx = 0
                    return False
            ok, frame = self._cap.read()
            if not ok:  # video over: next in the collection
                self.advance()
                return True
        else:
            if self._cam is None:
                self._cam = cv2.VideoCapture(0)
                if not self._cam.isOpened():
                    print("webcam unavailable — falling back to gen")
                    self._cam = None
                    self.slot_idx = 0
                    return False
            ok, frame = self._cam.read()
            if not ok:
                return False
        if self._held:      # decoded and dropped: the picture stays put
            return True
        frame = cv2.resize(frame, (self.w, self.h))
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        upload_raw(self.tex, self.w, self.h,
                   np.ascontiguousarray(np.flipud(rgb)).tobytes())
        return True


def _infra_shader(pack_dir, fname):
    """A pack's own copy of an engine-infrastructure shader, or the house
    pack's. _source_plasma and _overlay are the engine's furniture, not an
    artist's work — requiring every pack to carry copies meant a pack
    without them failed to load with no visible error, which read as a
    menu that closes and does nothing. A pack that wants its own plasma
    still just ships one; everyone else inherits the stock look."""
    own = os.path.join(pack_dir, "shaders", fname)
    if os.path.exists(own):
        return own
    return os.path.join(ROOT, "packs", "hvs80-synth", "shaders", fname)


# --------------------------------------------------------------------------
# Instrument
# --------------------------------------------------------------------------
class Instrument:
    PARAM_ROWS = ["x0", "x1", "x2", "x3", "speed"]
    MAX_LAYERS = 5           # effects in one chain (each costs a full pass)

    def __init__(self, plat, args):
        self.plat = plat
        self.w, self.h = plat.width, plat.height
        GL.glViewport(0, 0, self.w, self.h)

        quad = struct.pack("6f", -1, -1, 3, -1, -1, 3)
        self.vbo = GL.glGenBuffers(1)
        GL.glBindBuffer(GL.GL_ARRAY_BUFFER, self.vbo)
        GL.glBufferData(GL.GL_ARRAY_BUFFER, len(quad), quad, GL.GL_STATIC_DRAW)
        GL.glEnableVertexAttribArray(0)
        GL.glVertexAttribPointer(0, 2, GL.GL_FLOAT, False, 0, None)

        self.pack_rel = args.pack
        self.playlist_name = args.playlist
        self.pack_dir = os.path.join(ROOT, args.pack)
        self.playlist = self.load_playlist(args.playlist)
        self.programs = {}
        for step in self.playlist["steps"]:
            name = step["shader"]
            if name not in self.programs:
                self.programs[name] = Program(
                    os.path.join(self.pack_dir, "shaders", name + ".frag"))
        self.source_prog = Program(_infra_shader(self.pack_dir,
                                                 "_source_plasma.frag"))
        self.overlay_prog = Program(_infra_shader(self.pack_dir,
                                                  "_overlay.frag"))

        self.step_idx = 0
        self.param_row = 0
        self.t = 0.0
        self.punch = False
        self.frozen = False
        self.layers = []      # locked background effects (Sel+A stacks)
        self.layer_focus = 0  # 0 = top of chain; Sel+Up/Down digs deeper

        # decks: named lists of user-saved effect scenes; L/R walks the
        # active one in play mode; persisted per pack (decks.json)
        self.deck_idx = 0
        self.deck_mode = False   # False = build (L/R browses effects),
                                 # True = play (L/R walks saved scenes)
        self.kb = None           # on-screen keyboard state (menu name editor)
        self._load_decks()

        if getattr(args, "srcres", None):
            self.src_dims = args.srcres
        elif getattr(args, "fullres", False):
            self.src_dims = (self.w, self.h)
        else:
            self.src_dims = None
        self.sources = Sources(self.w, self.h,
                               os.path.join(self.pack_dir, "clips"),
                               self.src_dims)
        if args.source:
            self.sources.select(args.source)
        self.radio = RadioAudio(_find_ffmpeg())
        self.radio.station_idx = 1   # default: clips play their own sound
        self.streamer = None
        self.stream_cfg = load_stream_cfg()
        self.output_idx = 0
        self.output_ui = False   # include the UI panels in streams/recordings
        self._aud_t = time.time()
        self._aud_owed = 0.0
        self._aud_buf = bytearray()
        self._frame_no = 0
        self.menu_open = False
        self._del_arm = None    # pending delete awaiting Y confirm
        self.menu_idx = 0
        self.menu_level = 0
        self.menu_cat = 0
        self.menu_col = None
        self.menu_h = 330
        self.menu_tex = make_texture(self.w, self.menu_h)
        self._menu_key = None
        self.prev_tex = make_texture(self.w, self.h, bytes(self.w * self.h * 3))
        self.gen_tex = make_texture(self.w, self.h)
        # two inter-layer buffers, used alternately: with one, a 3-deep chain
        # samples a texture and then copies into it in the same frame, and
        # the driver has to stall or ghost it to resolve the hazard
        self.chain_tex = [make_texture(self.w, self.h),
                          make_texture(self.w, self.h)]
        # delay line: ring of past output frames (u_tex2 tap, ~0.8s reach)
        self.DELAY_N = 16
        self.delay_ring = [make_texture(self.w, self.h,
                                        bytes(self.w * self.h * 3))
                           for _ in range(self.DELAY_N)]
        self.delay_head = 0

        atlas_raw, aw, ah = plat.glyph_atlas(ASCII_CHARS)
        self.atlas = make_texture(aw, ah, atlas_raw)
        self.bayer = make_bayer_texture()

        self.strip_h = 150       # two rows per effect, plus the status line
        self._ov_used = 44
        self.help_h = 196
        self.overlay_tex = make_texture(self.w, self.strip_h)
        self.help_tex = make_texture(self.w, self.help_h)
        self.overlay_mode = 0        # 0 compact, 1 help, 2 hidden
        self._overlay_key = None
        self._help_key = None
        self._toast_until = 0.0     # hidden mode: flash the bar after a change
        self.batt = battery.Gauge()
        self.low_batt = False
        self.fps_w, self.fps_h = 64, 22
        self.fps_tex = make_texture(self.fps_w, self.fps_h)
        self._fps = 0.0
        self._fps_key = None

        self.meta = {}  # shader sidecar metadata, loaded lazily per shader
        self._failed_shaders = set()
        self._credit_cache = {}

    def load_playlist(self, name):
        if name == self.ALL_SET:     # browse every shader in the pack
            import glob
            frs = sorted(glob.glob(os.path.join(self.pack_dir, "shaders",
                                                "*.frag")))
            pl = {"steps": [
                {"shader": os.path.splitext(os.path.basename(f))[0]}
                for f in frs if not os.path.basename(f).startswith("_")]}
        else:
            path = os.path.join(self.pack_dir, "playlists", name + ".json")
            with open(path) as f:
                pl = json.load(f)
        for step in pl["steps"]:
            step.setdefault("x", [0.5, 0.5, 0.5, 0.5])
            step.setdefault("speed", 0.5)
            step.setdefault("lfo", [False, False, False])
            step.setdefault("lfoband", [3, 3, 3, 3])  # 3=ALL, 0/1/2=L/M/H
            _migrate_slots(step)
        return pl

    def cur_step(self):
        if self.deck and self.deck_mode:
            return self.deck[self.deck_idx % len(self.deck)]
        return self.playlist["steps"][self.step_idx]

    def chain(self):
        step = self.cur_step()
        if self.deck and self.deck_mode:
            return list(step.get("layers", [])) + [step]
        return self.layers + [step]

    def edit_step(self):
        """The chain member currently being edited (Sel+Up/Down picks)."""
        ch = self.chain()
        return ch[max(0, len(ch) - 1 - min(self.layer_focus, len(ch) - 1))]

    def _ensure_program(self, name):
        if name in self.programs:
            return True
        if name in self._failed_shaders:
            return False
        # current pack first, then any pack — deck scenes stay playable
        # even when they were built around another pack's effect
        import glob
        paths = [os.path.join(self.pack_dir, "shaders", name + ".frag")]
        paths += sorted(glob.glob(os.path.join(ROOT, "packs", "*",
                                               "shaders", name + ".frag")))
        for p in paths:
            if not os.path.exists(p):
                continue
            try:
                self.programs[name] = Program(p)
                return True
            except Exception as exc:
                print("shader %s failed: %s" % (name, exc))
                break
        else:
            print("shader %s not found in any pack" % name)
        self._failed_shaders.add(name)      # never retry every frame
        return False

    ALL_SET = "* everything"     # synthetic set: every shader in the pack

    def _set_credit(self, pack, name):
        """The set's credit line, cached (menu rebuilds every frame)."""
        key = (pack, name)
        if key not in self._credit_cache:
            credit = None
            if name != self.ALL_SET:
                try:
                    with open(os.path.join(ROOT, pack, "playlists",
                                           name + ".json")) as f:
                        credit = json.load(f).get("credit")
                except Exception:
                    pass
            self._credit_cache[key] = credit
        return self._credit_cache[key]

    def _pack_fx_count(self, pack):
        """How many effects a pack holds, cached. Underscore files are
        engine furniture, not effects, so they do not count."""
        if not hasattr(self, "_fxcount_cache"):
            self._fxcount_cache = {}
        if pack not in self._fxcount_cache:
            import glob
            n = len([p for p in glob.glob(os.path.join(
                        ROOT, pack, "shaders", "*.frag"))
                     if not os.path.basename(p).startswith("_")])
            self._fxcount_cache[pack] = n
        return self._fxcount_cache[pack]

    def list_sets(self):
        import glob
        out = []
        # the instrument's own packs head the menu; guests follow, A-Z
        def order(p):
            b = os.path.basename(p)
            house = ("hvs80-synth", "hvs80-pixel", "hvs80-glitch")
            return (house.index(b), "") if b in house else (len(house), b)
        for pdir in sorted(glob.glob(os.path.join(ROOT, "packs", "*")),
                           key=order):
            rel = os.path.relpath(pdir, ROOT)
            names = [os.path.splitext(os.path.basename(pj))[0]
                     for pj in sorted(glob.glob(os.path.join(
                         pdir, "playlists", "*.json")))]
            names = [n for n in names if n not in ("deck", "decks")]
            # a set named after its pack IS that pack's "everything"
            if os.path.basename(pdir) not in names:
                out.append((rel, self.ALL_SET))
            out.extend((rel, n) for n in names)
        return out

    def load_set(self, pack_rel, name):
        """Live-switch to another setlist, possibly from another pack."""
        old = (self.pack_rel, self.pack_dir, self.playlist,
               self.playlist_name, self.step_idx)
        self.pack_rel = pack_rel
        self.pack_dir = os.path.join(ROOT, pack_rel)
        try:
            self.playlist = self.load_playlist(name)
            self.playlist_name = name
            self.step_idx = 0
            if self.pack_dir != old[1]:      # new pack: fresh shader world
                self.programs = {}
                self._failed_shaders = set()
                self.meta = {}
                self.source_prog = Program(_infra_shader(
                    self.pack_dir, "_source_plasma.frag"))
                self.overlay_prog = Program(_infra_shader(
                    self.pack_dir, "_overlay.frag"))
                # the video library is global and stays put: swapping decks
                # must never take the playing video with it
                self.deck_idx = 0
                self._load_decks()
            for step in self.playlist["steps"]:
                self._ensure_program(step["shader"])
        except Exception as exc:
            # rolling back silently read as "the menu closes and nothing
            # happens" — a broken third-party pack must say what broke
            print("set load failed:", exc)
            self._load_err = ("SET FAILED: %s" % exc, time.time() + 8.0)
            self._toast_until = time.time() + 8.0
            (self.pack_rel, self.pack_dir, self.playlist,
             self.playlist_name, self.step_idx) = old

    def _adopt_pack_decks(self):
        """First run after decks went global: take the richest per-pack file.

        Copied, never moved — if this picks wrong, the originals are still
        sitting where they always were."""
        import glob as _glob
        best, most = None, 0
        for cand in _glob.glob(os.path.join(ROOT, "packs", "*", "playlists",
                                            "decks.json")):
            try:
                with open(cand) as f:
                    d = json.load(f)
                n = sum(len(x.get("scenes", [])) for x in d.get("decks", []))
            except Exception:
                continue
            if n > most:
                best, most = cand, n
        if best:
            try:
                shutil.copy2(best, self.decks_path)
                print("patch decks adopted from %s (%d patches)"
                      % (os.path.relpath(best, ROOT), most))
            except OSError as exc:
                print("could not adopt patch decks:", exc)

    def _load_decks(self):
        """decks.json: {"active": i, "decks": [{"name", "scenes"}]}.
        Migrates the old single-deck deck.json on first sight."""
        # Patch decks belong to the instrument, not to an effect pack. They
        # used to live under the current pack, so switching effect set showed
        # an empty deck list — indistinguishable from having lost the lot.
        # Patches reference shaders across packs anyway, so there was never a
        # reason for them to be filed under one.
        self.decks_path = os.path.join(ROOT, "decks.json")
        if not os.path.exists(self.decks_path):
            self._adopt_pack_decks()
        old_path = os.path.join(self.pack_dir, "playlists", "deck.json")
        self.decks = [{"name": "DECK 1", "scenes": []}]
        self.deck_sel = 0
        self._decks_ok = True
        # an empty setlist is never something anyone asked for — it only
        # happens when a write died partway — so put the newest good copy
        # back before reading, rather than booting into a blank deck
        came_from = deckvault.restore_if_empty(self.decks_path)
        if came_from:
            print("decks restored from", os.path.basename(came_from))
        try:
            # an empty file is "no decks yet", not corruption — otherwise a
            # zero-byte file would lock saving off forever
            if (os.path.exists(self.decks_path)
                    and os.path.getsize(self.decks_path) > 0):
                with open(self.decks_path) as f:
                    text = f.read()
                d = json.loads(text)
                if d.get("decks"):
                    self.decks = d["decks"]
                self.deck_sel = min(d.get("active", 0), len(self.decks) - 1)
                # a copy of what was on disk, taken before the engine has
                # had any chance to write over it
                deckvault.snapshot(self.decks_path, text, force=True)
            elif os.path.exists(old_path):
                with open(old_path) as f:
                    steps = json.load(f).get("steps", [])
                if steps:
                    self.decks = [{"name": "DECK 1", "scenes": steps}]
            self._decks_ok = True
        except Exception as exc:
            # the file exists but we could not read it: never write over it,
            # or a moment's bad parse costs someone their setlist
            print("deck load failed:", exc, "— saves disabled to protect it")
            self._decks_ok = False
        for dk in self.decks:
            dk.setdefault("name", "DECK")
            dk.setdefault("scenes", [])
            for sc in dk["scenes"]:
                # layers are steps too: miss them and they keep 3 params
                # while the engine reads 4 — an IndexError mid-render
                for st in [sc] + list(sc.get("layers", [])):
                    st.setdefault("x", [0.5, 0.5, 0.5, 0.5])
                    st.setdefault("speed", 0.5)
                    _migrate_slots(st)

    @property
    def deck(self):
        """Scenes of the active deck — legacy alias the engine performs on."""
        return self.decks[self.deck_sel]["scenes"]

    @deck.setter
    def deck(self, scenes):
        self.decks[self.deck_sel]["scenes"] = list(scenes)

    def _save_deck(self):
        """Write via a temp file and rename. Opening the real file "w"
        truncates it first, so a crash or a yanked battery between that
        and the write leaves an empty setlist — which is exactly how one
        got lost. Rename is atomic: the old file stands until the new one
        is complete on disk."""
        if not self._decks_ok:
            print("not saving decks: the file on disk did not parse")
            return
        text = json.dumps({"active": self.deck_sel, "decks": self.decks},
                          indent=2)
        tmp = self.decks_path + ".tmp"
        try:
            with open(tmp, "w") as f:
                f.write(text)
                f.flush()
                os.fsync(f.fileno())
            if os.path.exists(self.decks_path):     # keep one generation
                shutil.copy2(self.decks_path, self.decks_path + ".bak")
            os.replace(tmp, self.decks_path)
        except Exception as exc:
            print("deck save failed:", exc)
            return
        # Both are off the hot path: the snapshot is rate-limited to one every
        # few minutes, and the cloud copy hands off to a background thread, so
        # a slow hotspot can never stall the render loop.
        deckvault.snapshot(self.decks_path, text)
        deckvault.cloud_push(os.path.basename(self.pack_dir), text)

    def step(self, delta):
        self.layer_focus = 0
        if self.deck and self.deck_mode:
            self.deck_idx = (self.deck_idx + delta) % len(self.deck)
            self._ensure_program(self.deck[self.deck_idx]["shader"])
        else:
            self.step_idx = (self.step_idx + delta) % len(self.playlist["steps"])
        if not self._row_ok(self.param_row):
            self.param_row = 2      # hopped onto a clockless effect from spd

    def nudge(self, delta):
        s = self.edit_step()
        row = self.PARAM_ROWS[self.param_row]
        if row == "speed":
            s["speed"] = min(1.0, max(0.0, s["speed"] + delta))
        else:
            i = int(row[1])
            s["x"][i] = min(1.0, max(0.0, s["x"][i] + delta))

    TOAST_EVENTS = ("prev", "next", "up", "down", "left", "right",
                    "src", "randomize", "freeze", "lfo", "mode_toggle",
                    "lfoband_up", "lfoband_down")

    MENU_CATS = [("video", "Video source"), ("audio", "Audio source"),
                 ("output", "Output"), ("sets", "FX deck"),
                 ("deck", "Patch decks")]

    def _cat_current(self, key):
        if key == "video":
            return self.sources.label
        if key == "audio":
            return self.radio.label
        if key == "output":
            return ["screen", "mixer", "recording", "LIVE"][self.output_idx]
        if key == "sets":
            return self.playlist_name
        return "%s (%d)%s" % (self.decks[self.deck_sel]["name"],
                              len(self.deck),
                              "  PLAYING" if self.deck_mode else "")

    def _menu_rows(self):
        if self.menu_level == 0:
            return [("cat", i, "%-13s:  %s" % (label, self._cat_current(key)),
                     False) for i, (key, label) in enumerate(self.MENU_CATS)]
        key = self.MENU_CATS[self.menu_cat][0]
        rows = []
        if key == "video":
            cols = self.sources.collections()
            cur = self.sources.slot_idx
            if self.menu_level == 2 and self.menu_col in cols:
                for i in cols[self.menu_col]:
                    label = os.path.splitext(os.path.basename(
                        self.sources.slots[i][1]))[0][:40]
                    rows.append(("src", i, label, i == cur))
                return rows
            for i, (kind, _) in enumerate(self.sources.slots):
                if kind == "gen":
                    rows.append(("src", i, "plasma (generated)", i == cur))
                elif kind == "cam":
                    rows.append(("src", i, "camera", i == cur))
            for name, idxs in cols.items():
                rows.append(("vcol", name, "%s  (%d videos)" %
                             (name, len(idxs)), cur in idxs))
            rows.append(("vcrush", None, "jpeg crush: %s"
                         % _crush_label(self.sources.crush),
                         self.sources.crush > 0))
        elif key == "audio":
            labels = {"off": "no audio", "clip": "video's own sound"}
            groups = radio_groups()
            if self.menu_level == 2 and self.menu_col in groups:
                for i in groups[self.menu_col]:
                    name, _, _, blurb = RADIO_STATIONS[i]
                    rows.append(("aud", i, "%-16s %s" % (name, blurb),
                                 i == self.radio.station_idx))
            else:
                for i, st in enumerate(RADIO_STATIONS):
                    if st[2]:
                        continue            # lives in its own submenu
                    rows.append(("aud", i, labels.get(st[0], st[0]),
                                 i == self.radio.station_idx))
                for g, idxs in groups.items():
                    # mark the folder when the playing station is inside it,
                    # so the current choice is never hidden a level down
                    rows.append(("acol", g, "%s  (%d streams)" % (g, len(idxs)),
                                 self.radio.station_idx in idxs))
        elif key == "output":
            outs = ["screen only", "to mixer (laptop)", "record to SD",
                    "go live (YouTube)" +
                    ("" if self.stream_cfg["live"] else "  [no key]")]
            for i, label in enumerate(outs):
                rows.append(("out", i, label, i == self.output_idx))
            rows.append(("outui", None, "show UI in output: %s"
                         % ("ON (demo mode)" if self.output_ui else "off"),
                         self.output_ui))
        elif key == "sets":
            for i, (pack, name) in enumerate(self.list_sets()):
                active = (pack == self.pack_rel and name == self.playlist_name
                          and not self.deck)
                credit = self._set_credit(pack, name)
                rows.append(("set", i, "%s%s  (%s %d)" %
                             (name, "  — " + credit if credit else "",
                              os.path.basename(pack),
                              self._pack_fx_count(pack)), active))
        else:  # deck manager
            if self.menu_level == 2:      # inside one deck (menu_col = index)
                di = self.menu_col
                for si, sc in enumerate(self.decks[di]["scenes"]):
                    lfo = "~" if any(sc.get("lfo", [])) else ""
                    # full chain in signal order: first layer first, live
                    # effect last, e.g. "waaave+delay+ascii"
                    shads = "+".join(
                        [l["shader"] for l in sc.get("layers", [])] +
                        [sc["shader"]])
                    if sc.get("name"):
                        body = "%s  (%s%s)" % (sc["name"], shads, lfo)
                    else:
                        body = "%s%s  [%.2f %.2f %.2f]" % (
                            shads, lfo,
                            sc["x"][0], sc["x"][1], sc["x"][2])
                    if len(body) > 52:
                        body = body[:49] + "..."
                    rows.append(("deck", (di, si), "%d  %s" % (si + 1, body),
                                 di == self.deck_sel and si == self.deck_idx))
                rows.append(("deckadd", di, "+ save current patch here",
                             False))
                return rows
            if self.deck:
                mode = ("mode: PLAY patch deck  (L/R = patches)" if self.deck_mode
                        else "mode: BUILD  (L/R = effects)")
                rows.append(("deckmode", None, mode, self.deck_mode))
            for di, dk in enumerate(self.decks):
                rows.append(("deckopen", di, "%s  (%d patches)" %
                             (dk["name"], len(dk["scenes"])),
                             di == self.deck_sel))
            rows.append(("decknew", None, "+ new deck", False))
        return rows

    def _menu_move(self, delta):
        rows = self._menu_rows()
        if not rows:
            return
        i = self.menu_idx
        for _ in range(len(rows)):
            i = (i + delta) % len(rows)
            if rows[i][0] != "hdr":
                self.menu_idx = i
                return

    def _delete_target(self, kind, ident):
        if kind == "deckopen":
            di = ident
            if len(self.decks) > 1:
                del self.decks[di]
                if self.deck_sel >= len(self.decks):
                    self.deck_sel = len(self.decks) - 1
                elif self.deck_sel > di:
                    self.deck_sel -= 1
            else:
                self.decks[di]["scenes"] = []   # last deck: just empty it
            self.deck_idx = 0
            if not self.deck:
                self.deck_mode = False
        else:
            di, si = ident
            del self.decks[di]["scenes"][si]
            if di == self.deck_sel:
                if not self.deck:
                    self.deck_mode = False
                    self.deck_idx = 0
                else:
                    self.deck_idx = min(self.deck_idx, len(self.deck) - 1)
        self._save_deck()
        self.menu_idx = max(0, self.menu_idx - 1)

    KB_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"

    def _kb_open(self, target, text):
        self.kb = {"target": target,
                   "text": list((text or "A").upper()[:16]), "pos": 0}

    def _kb_handle(self, ev):
        kb, t, p = self.kb, self.kb["text"], self.kb["pos"]
        if ev in ("up", "down"):
            cur = t[p] if t[p] in self.KB_CHARS else "A"
            step = 1 if ev == "up" else -1
            t[p] = self.KB_CHARS[(self.KB_CHARS.index(cur) + step)
                                 % len(self.KB_CHARS)]
        elif ev == "left":
            kb["pos"] = max(0, p - 1)
        elif ev == "right":
            if p == len(t) - 1 and len(t) < 16:
                t.append("A")
            kb["pos"] = min(len(t) - 1, p + 1)
        elif ev == "freeze":               # Y = delete character
            if len(t) > 1:
                del t[p]
                kb["pos"] = min(p, len(t) - 1)
        elif ev == "punch_on":             # A = save name
            name = "".join(t).strip() or "UNNAMED"
            tgt = kb["target"]
            if tgt[0] == "deck":
                self.decks[tgt[1]]["name"] = name
            else:
                self.decks[tgt[1]]["scenes"][tgt[2]]["name"] = name
            self._save_deck()
            self.kb = None
        elif ev in ("randomize", "src"):   # B / Start = cancel
            self.kb = None
        return True

    def _menu_handle(self, ev):
        if self.kb:
            return self._kb_handle(ev)
        if self._del_arm:
            if ev == "punch_on":       # A = yes, delete it
                kind, ident = self._del_arm
                self._del_arm = None
                self._delete_target(kind, ident)
                return True
            if ev == "freeze":         # Y again does nothing
                return True
            self._del_arm = None       # B (or anything else) = no
            if ev == "randomize":
                return True
        in_decks = self.MENU_CATS[self.menu_cat][0] == "deck"
        if in_decks and self.menu_level > 0 and ev in (
                "lfo", "layer_focus_up", "layer_focus_down", "prev", "next"):
            rows = self._menu_rows()
            row = rows[self.menu_idx] if self.menu_idx < len(rows) else None
            if ev == "lfo" and row:        # X = rename deck / scene
                if row[0] == "deckopen":
                    self._kb_open(("deck", row[1]),
                                  self.decks[row[1]]["name"])
                elif row[0] == "deck":
                    di, si = row[1]
                    sc = self.decks[di]["scenes"][si]
                    self._kb_open(("scene", di, si),
                                  sc.get("name") or sc["shader"])
            elif row and row[0] == "deck":
                di, si = row[1]
                scenes = self.decks[di]["scenes"]
                if ev in ("layer_focus_up", "layer_focus_down"):
                    sj = si - 1 if ev == "layer_focus_up" else si + 1
                    if 0 <= sj < len(scenes):   # Sel+^v = move scene
                        scenes[si], scenes[sj] = scenes[sj], scenes[si]
                        if di == self.deck_sel:
                            if self.deck_idx == si:
                                self.deck_idx = sj
                            elif self.deck_idx == sj:
                                self.deck_idx = si
                        self.menu_idx += sj - si
                        self._save_deck()
                elif ev in ("prev", "next") and len(self.decks) > 1:
                    import copy                  # L/R = copy to other deck
                    dj = (di + (1 if ev == "next" else -1)) % len(self.decks)
                    self.decks[dj]["scenes"].append(
                        copy.deepcopy(scenes[si]))
                    self._save_deck()
            return True
        if ev == "up":
            self._menu_move(-1)
        elif ev == "down":
            self._menu_move(+1)
        elif ev == "punch_on":  # A = enter category / apply item
            rows = self._menu_rows()
            if not rows:
                return True
            self.menu_idx = min(self.menu_idx, len(rows) - 1)
            kind, i = rows[self.menu_idx][0], rows[self.menu_idx][1]
            if kind == "cat":
                self.menu_level = 1
                self.menu_cat = i
                sub = self._menu_rows()
                self.menu_idx = next(
                    (j for j, r in enumerate(sub) if r[3]), 0)
            elif kind in ("vcol", "acol"):
                self.menu_level = 2
                self.menu_col = i          # i is the collection name here
                sub = self._menu_rows()
                self.menu_idx = next(
                    (j for j, r in enumerate(sub) if r[3]), 0)
            elif kind == "src":
                self.sources.slot_idx = i
                self.sources._post_switch()
            elif kind == "aud":
                self.radio.station_idx = i
                self.radio.retune(self.current_clip_path())
            elif kind == "out":
                self._set_output(i)
            elif kind == "outui":
                self.output_ui = not self.output_ui
            elif kind == "vcrush":
                self.sources.crush = ((self.sources.crush + 1)
                                      % len(_FFClip.CRUSH))
            elif kind == "set":
                sets = self.list_sets()
                if i < len(sets):
                    self.load_set(sets[i][0], sets[i][1])
                    self.menu_open = False   # picked a deck: back to video
            elif kind == "deckmode":
                self.deck_mode = not self.deck_mode
            elif kind == "deckopen":
                self.menu_level = 2
                self.menu_col = i          # i = deck index here
                self.menu_idx = 0
            elif kind == "decknew":
                di = len(self.decks)
                self.decks.append({"name": "DECK %d" % (di + 1),
                                   "scenes": []})
                self._save_deck()
                self._kb_open(("deck", di), self.decks[di]["name"])
            elif kind == "deck":
                di, si = i
                self.deck_sel = di
                self.deck_idx = si
                self.deck_mode = True    # picking a scene = play it
                self._ensure_program(self.deck[si]["shader"])
                self._save_deck()        # persists which deck is active
            elif kind == "deckadd":
                import copy
                sc = copy.deepcopy(self.cur_step())
                sc.pop("video", None)    # scenes are effects only —
                sc.pop("aud", None)      # video/audio stay live choices
                sc.pop("name", None)     # name belongs to the original
                if self.layers and not (self.deck and self.deck_mode):
                    sc["layers"] = copy.deepcopy(self.layers)
                self.decks[i]["scenes"].append(sc)
                if i == self.deck_sel:
                    self.deck_idx = len(self.deck) - 1
                self._save_deck()
        elif ev == "freeze":  # Y = arm delete of deck / scene (A confirms)
            rows = self._menu_rows()
            row = (rows[self.menu_idx]
                   if rows and self.menu_idx < len(rows) else None)
            if row and row[0] in ("deckopen", "deck"):
                self._del_arm = (row[0], row[1])
        elif ev == "randomize":  # B = back / close
            if self.menu_level == 2:
                self.menu_level = 1
                back_kind = {"deck": "deckopen", "audio": "acol"}.get(
                    self.MENU_CATS[self.menu_cat][0], "vcol")
                rows = self._menu_rows()
                self.menu_idx = next(
                    (j for j, r in enumerate(rows)
                     if r[0] == back_kind and r[1] == self.menu_col), 0)
            elif self.menu_level == 1:
                self.menu_level = 0
                self.menu_idx = self.menu_cat
            else:
                self.menu_open = False
        elif ev == "src":  # Start = close
            self.menu_open = False
        return True

    def handle(self, ev):
        if ev == "quit":
            return False
        if ev == "src":  # Start = open/close the loader
            self.menu_open = not self.menu_open
            self._del_arm = None
            if self.menu_open:
                self.menu_level = 0
                self.menu_cat = 0
                self.menu_idx = 0
            return True
        if self.menu_open:
            return self._menu_handle(ev)
        if self.overlay_mode == 2 and ev in self.TOAST_EVENTS:
            self._toast_until = time.time() + 2.0   # flash the bar back...
        if ev == "prev":                            # ...and still act on it
            self.step(-1)
        elif ev == "next":
            self.step(+1)
        elif ev in ("left", "right"):
            d = -1 if ev == "left" else 1
            for _ in range(len(self.PARAM_ROWS)):
                self.param_row = (self.param_row + d) % len(self.PARAM_ROWS)
                if self._row_ok(self.param_row):
                    break
        elif ev == "up":
            self.nudge(+0.04)
        elif ev == "down":
            self.nudge(-0.04)
        elif ev == "src":
            self.sources.next_clip()
        elif ev == "ui":
            self.overlay_mode = (self.overlay_mode + 1) % 3
        elif ev == "shot":
            self.screenshot()
        elif ev == "punch_on":
            self.punch = True
        elif ev == "punch_off":
            self.punch = False
        elif ev == "randomize":
            import random
            s = self.edit_step()
            s["x"] = [round(random.random(), 2) for _ in range(4)]
        elif ev == "layer_add":
            import copy
            if self.deck and self.deck_mode:
                # the stack belongs to the scene, exactly as layer_clear
                # already treats it: lock a copy of the scene's top effect
                # so it can keep running while the top diverges. Blocking
                # adds here made every patch feel capped at whatever depth
                # it was saved with.
                sc = self.cur_step()
                lst = sc.setdefault("layers", [])
                lst.append({k: copy.deepcopy(v) for k, v in sc.items()
                            if k != "layers"})
                if len(lst) > self.MAX_LAYERS - 1:
                    lst.pop(0)                # oldest falls off the bottom
            else:
                self.layers.append(copy.deepcopy(self.cur_step()))
                if len(self.layers) > self.MAX_LAYERS - 1:
                    self.layers.pop(0)        # oldest falls off the bottom
            self.layer_focus = 0
        elif ev == "layer_clear":   # Sel+B: remove the focused layer
            # in deck play mode the stack belongs to the scene itself
            lst = (self.cur_step().setdefault("layers", [])
                   if self.deck and self.deck_mode else self.layers)
            if lst:
                focused = self.edit_step()
                for i, l in enumerate(lst):
                    if l is focused:
                        del lst[i]
                        break
                else:   # focus on the live effect: drop it — the newest
                        # layer un-freezes and becomes the live effect
                    live = self.cur_step()
                    top = lst.pop()
                    live["shader"] = top["shader"]
                    live["x"] = top["x"]
                    live["speed"] = top["speed"]
                    live["lfo"] = top.get("lfo", [False] * 5)
                    live["lfoband"] = top.get("lfoband", [3] * 5)
                    self._ensure_program(live["shader"])
                    if not self._row_ok(self.param_row):
                        self.param_row = 2
            self.layer_focus = 0
        elif ev == "layer_focus_up":     # up = toward the top layer,
            self.layer_focus = max(0, self.layer_focus - 1)
        elif ev == "layer_focus_down":   # down = deeper — matches the rows
            self.layer_focus = min(self.layer_focus + 1, len(self.chain()) - 1)
        elif ev == "mode_toggle":
            if self.deck:
                self.deck_mode = not self.deck_mode
                if self.deck_mode:  # entering play: land on current scene
                    self._ensure_program(
                        self.deck[self.deck_idx % len(self.deck)]["shader"])
        elif ev == "freeze":
            # the picture holds, the music plays on: the clip keeps decoding
            # underneath, so releasing the freeze lands back in time with it
            self.frozen = not self.frozen
            self.sources.hold(self.frozen)
        elif ev == "lfo":
            if self.param_row < 5:  # any x param or speed ("auto")
                s = self.edit_step()
                s.setdefault("lfo", [False] * 5)
                s["lfo"][self.param_row] = not s["lfo"][self.param_row]
        elif ev in ("lfoband_up", "lfoband_down"):
            if self.param_row < 5:
                s = self.edit_step()
                s.setdefault("lfo", [False] * 5)
                lb = s.setdefault("lfoband", [3] * 5)
                while len(lb) < 5:
                    lb.append(3)
                delta = 1 if ev == "lfoband_up" else -1
                lb[self.param_row] = (lb[self.param_row] + delta) % 4
                s["lfo"][self.param_row] = True  # picking a band arms it
        return True

    def current_clip_path(self):
        kind, path = self.sources.slots[self.sources.slot_idx]
        return path if kind == "clip" else None

    def _set_output(self, i):
        if i == self.output_idx:
            return
        was_recording = self.output_idx == 2 and self.streamer is not None
        if self.streamer is not None:
            self.streamer.close()
            self.streamer = None
        if was_recording:
            self.sources.rescan()   # the recording joins the video list
        if i == 1:
            self.start_stream(self.stream_cfg["mixer"])
        elif i == 2:
            clips = os.path.join(self.pack_dir, "clips")
            # not every pack ships a clips folder — glitch does not — and
            # ffmpeg cannot create one, so it failed to open the output and
            # wrote nothing at all
            try:
                os.makedirs(clips, exist_ok=True)
            except OSError as exc:
                print("cannot make", clips, exc)
            n = 1
            while os.path.exists(os.path.join(clips, "rec_%02d.mp4" % n)):
                n += 1
            self.start_stream(os.path.join(clips, "rec_%02d.mp4" % n))
        elif i == 3:
            if not self.stream_cfg["live"]:
                i = 0
            else:
                self.start_stream(self.stream_cfg["live"])
        self.output_idx = i

    def start_stream(self, dest):
        self.streamer = Streamer(_find_ffmpeg() or "ffmpeg",
                                 self.w, self.h, 15, dest)
        self._aud_t = time.time()
        self._aud_owed = 0.0
        self._aud_buf = bytearray()
        print("streaming to", dest.split("/")[2] if "://" in dest else dest)

    def draw_fullscreen(self):
        GL.glDrawArrays(GL.GL_TRIANGLES, 0, 3)

    def draw_panel(self, tex, x, y, pw, ph, tex_h=None):
        # tex_h: full texture height when only the top ph px are in use —
        # keeps text 1:1 instead of squeezing the whole texture into ph
        th = tex_h or ph
        GL.glEnable(GL.GL_SCISSOR_TEST)
        GL.glScissor(x, y, pw, ph)
        self.overlay_prog.use()
        self.overlay_prog.set4f("u_rect",
                                x / float(self.w),
                                (y + ph - th) / float(self.h),
                                pw / float(self.w), th / float(self.h))
        self.overlay_prog.set_tex("u_tex0", 0, tex)
        self.draw_fullscreen()
        GL.glDisable(GL.GL_SCISSOR_TEST)

    def _push_stream(self):
        self._frame_no += 1
        if self.streamer is not None and self._frame_no % 2 == 0:
            GL.glPixelStorei(GL.GL_PACK_ALIGNMENT, 1)
            raw = GL.glReadPixels(0, 0, self.w, self.h,
                                  GL.GL_RGB, GL.GL_UNSIGNED_BYTE)
            self.streamer.push(raw)

    def draw_fps(self):
        label = "%d fps" % int(self._fps + 0.5)
        if label != self._fps_key:
            self._fps_key = label
            raw = self.plat.text_image([label], self.fps_w, self.fps_h)
            upload_raw(self.fps_tex, self.fps_w, self.fps_h, raw)
        self.draw_panel(self.fps_tex, self.w - self.fps_w, self.h - self.fps_h,
                        self.fps_w, self.fps_h)

    def set_common(self, prog, step, top=True):
        import math
        prog.set1f("u_time", self.t)
        prog.set2f("u_resolution", self.w, self.h)
        lb = step.get("lfoband", [3] * 5)
        for i in range(4):
            v = step["x"][i]
            if step.get("lfo", [False] * 5)[i]:
                b = lb[i] if i < len(lb) else 3
                if self.radio.active:
                    v += 0.55 * self._band_value(b) - 0.1
                else:
                    rate = (0.7, 2.0, 4.5, 1.3)[b]
                    v += 0.25 * math.sin(self.t * rate + i * 2.1)
            if top and self.punch and self.param_row == i:
                v += 0.5
            prog.set1f("u_x%d" % i, min(1.0, max(0.0, v)))
        prog.set1f("u_a0", self.radio.bass)
        prog.set1f("u_a1", self.radio.level)
        prog.set1f("u_a2", self.radio.high)
        # legacy conjur/r_e_c_u_r shader compatibility
        prog.set1f("ftime", self.t - float(int(self.t)))
        prog.set1f("u_time", self.t)
        prog.set4f("fparams", step["x"][0], step["x"][1], step["x"][2],
                   step["speed"])

    def _get_meta(self, name):
        if name not in self.meta:
            meta = {"desc": name,
                    "params": [{"name": "x%d" % i, "help": ""} for i in range(4)]}
            # current pack first, then any pack — the same search order
            # _ensure_program uses, so a shader borrowed from another pack
            # keeps its knob names instead of falling back to x0..x3
            import glob
            sides = [os.path.join(self.pack_dir, "shaders", name + ".json")]
            sides += sorted(glob.glob(os.path.join(ROOT, "packs", "*",
                                                   "shaders", name + ".json")))
            for side in sides:
                if not os.path.exists(side):
                    continue
                try:
                    with open(side) as f:
                        meta.update(json.load(f))
                    break
                except Exception:
                    pass
            self.meta[name] = meta
        return self.meta[name]

    def _param_names(self, step):
        return [p["name"] for p in self._get_meta(step["shader"])["params"]]

    def _band_value(self, b):
        r = self.radio
        if b == 0:
            return r.bass
        if b == 1:  # approximated mid: level minus the band extremes
            return min(1.0, max(0.0, r.level - 0.45 * (r.bass + r.high)) * 2.5)
        if b == 2:
            return r.high
        return r.level  # 3 = ALL frequencies

    def _has_time(self, step):
        prog = self.programs.get(step["shader"])
        return prog is None or getattr(prog, "uses_time", True)

    def _has_x3(self, step):
        """Only shaders that declare u_x3 get a 4th knob — the rest keep
        the 3-param recurBOY layout and show no dead slot."""
        prog = self.programs.get(step["shader"])
        return prog is not None and getattr(prog, "uses_x3", False)

    def _has_audio(self, step):
        """True when this effect listens to the sound that is playing."""
        prog = self.programs.get(step["shader"])
        return prog is not None and getattr(prog, "uses_audio", False)

    def _row_ok(self, idx, step=None):
        """Speed row is skipped for effects that never read the clock.
        Defaults to the focused step, but every layer draws its own row now,
        so it has to be askable about any of them."""
        st = self.edit_step() if step is None else step
        if idx == 3:
            return self._has_x3(st)
        return idx != 4 or self._has_time(st)

    def _step_summary(self, s):
        lfo = "~" if any(s.get("lfo", [])) else ""
        aud = "♪" if self._has_audio(s) else ""     # DejaVuSansMono has
        return "%s%s%s %.2f %.2f %.2f spd %.2f" % (      # it at the same 8px
            s["shader"], lfo, aud,                       # advance as ASCII
            s["x"][0], s["x"][1], s["x"][2], s["speed"])

    # width is measured from the surface now, see _patch_cols

    # label width and decimal places, tried in order until the row fits.
    # 99 means the label is not shortened at all — on a 640px surface the
    # full parameter name fits with room over, and only a narrow display
    # ever needs to start giving letters back.
    PATCH_FITS = ((99, 2), (6, 2), (4, 2), (3, 2), (2, 2), (2, 1))

    def _patch_cols(self):
        """Columns across the real surface. This is 640px wide, not the
        320 of the panel it is scaled onto — assuming the smaller number
        cost half the row and squeezed names that never needed squeezing."""
        return max(20, (self.w - 8) // max(1, int(HEAD_ROW_PX * 0.6)))

    def _patch_rows(self, st, is_focus):
        """One line per effect: its name, then every knob with a label.

        Name, four labelled values and a speed will not all fit in 39
        columns at this size, so the row negotiates instead of always
        sacrificing the same thing. Short-named effects keep four-letter
        labels; longer ones give up label characters, then a decimal place.
        The name only truncates when nothing else is left to give, because
        the name is what you are actually looking for."""
        names = self._param_names(st)
        while len(names) < 4:        # sidecars from the 3-param era
            names.append("x%d" % len(names))
        names.append("spd")
        lf = st.get("lfo", [False] * 5)
        lb = st.get("lfoband", [3] * 5)
        slots = [i for i in range(5) if self._row_ok(i, st)]
        head = st["shader"] + ("♪" if self._has_audio(st) else "")

        def build(width, dp):
            bits = []
            for i in slots:
                val = st["x"][i] if i < 4 else st["speed"]
                lab = ("spd" if i == 4 else names[i])[:width]
                txt = lab + ("%.*f" % (dp, val)).lstrip("0")
                if lf[i]:
                    b = lb[i] if i < len(lb) else 3
                    txt += "~" + ("" if b == 3 else "LMH"[b])
                # only the knob actually being turned is marked, and only on
                # the focused effect. The brackets never draw — the renderer
                # eats them and paints that span red instead
                if is_focus and self.param_row == i:
                    txt = "[%s]" % txt
                bits.append(txt)
            return " ".join(bits)

        cols = self._patch_cols()
        # the two bracket characters are markup, not glyphs — counting them
        # would shrink labels to buy space that is never actually used
        drawn = lambda s: len(s) - (2 if "[" in s else 0)
        for width, dp in self.PATCH_FITS:
            tail = build(width, dp)
            if len(head) + drawn(tail) + 3 <= cols:
                break
        else:
            head = head[:max(3, cols - 3 - drawn(tail))]
        # only the name carries the highlight. The values are reference, not
        # navigation — picking one out competes with the thing you actually
        # need to find at a glance, which is which effect you are standing on
        return ("%s %s %s" % (">" if is_focus else " ", head, tail),)

    def update_overlay(self, step):
        """The patch: every effect in the chain on its own row, the focused
        one picked out by the same green bar the menu uses. No summary line
        on top — it only ever repeated whichever row was already lit."""
        chain = self.chain()
        focused = self.edit_step()
        lines = []
        for li in range(len(chain) - 1, -1, -1):   # screen order: top first
            st = chain[li]
            lines.extend(self._patch_rows(st, st is focused))
        flags = ("  FRZ" if self.frozen else "") + ("  PUNCH" if self.punch else "")
        flags += self.batt.label()
        if self.streamer is not None and not self.streamer.dead:
            flags += {1: "  MIX", 2: "  REC", 3: "  LIVE"}.get(self.output_idx, "")
        if self.deck and self.deck_mode:
            pos = "D%d/%d" % (self.deck_idx + 1, len(self.deck))
        else:
            pos = "%d/%d" % (self.step_idx + 1, len(self.playlist["steps"]))
        lines.append("  %s%s" % (pos, flags))
        err = getattr(self, "_load_err", None)
        if err and time.time() < err[1]:
            lines.append(("  " + err[0])[:self._patch_cols()])

        cap = max(2, (self.strip_h - 10) // ROW_STEP)  # scroll like the menu,
        total, top = len(lines), 0               # so a deep chain still shows
        if total > cap:
            # keep the focused pair together: anchor on its name row, never
            # scroll to a position that shows values with no effect above them
            fi = next((i for i, r in enumerate(lines) if r.startswith(">")), 0)
            top = max(0, min(fi - (cap // 2 - cap % 2), total - cap))
            lines = lines[top:top + cap]
        key = tuple(lines)
        self._ov_used = 4 + ROW_STEP * len(lines) + 6
        if key != self._overlay_key:
            self._overlay_key = key
            raw = self.plat.text_image(lines, self.w, self.strip_h,
                                       body_px=HEAD_ROW_PX, header=False,
                                       row_step=ROW_STEP,
                                       scroll=(top, total))
            upload_raw(self.overlay_tex, self.w, self.strip_h, raw)

    def update_menu(self):
        if self.kb:
            disp = "".join("[%s]" % c if i == self.kb["pos"] else c
                           for i, c in enumerate(self.kb["text"]))
            lines = ["NAME IT   ^v: letter   </>: cursor   Y: delete",
                     "", "   %s" % disp, "",
                     "A: save   B: cancel"]
            key = tuple(lines)
            if key != self._menu_key:
                self._menu_key = key
                raw = self.plat.text_image(lines, self.w, self.menu_h,
                                           body_px=HEAD_ROW_PX,
                                           row_step=ROW_STEP)
                upload_raw(self.menu_tex, self.w, self.menu_h, raw)
            return
        in_decks = self.MENU_CATS[self.menu_cat][0] == "deck"
        rows = self._menu_rows()
        self.menu_idx = min(self.menu_idx, max(0, len(rows) - 1))
        max_rows = (self.menu_h - 26 - 6) // ROW_STEP   # from the real pitch
        top = max(0, min(self.menu_idx - max_rows // 2, len(rows) - max_rows))
        if self.menu_level == 0:
            lines = ["LOADER   A: open   Start: close"]
        elif self.menu_level == 2 and in_decks:
            lines = ["%s   A: play  X: name  Y: del  Sel+^v: move  "
                     "L/R: copy>deck"
                     % self.decks[self.menu_col]["name"]]
        elif self.menu_level == 2:
            lines = ["%s   A: play   B: back   Start: close"
                     % str(self.menu_col).upper()]
        elif in_decks:
            lines = ["PATCH DECKS   A: open   X: rename   Y: delete   B: back"]
        else:
            lines = ["%s   A: apply   B: back   Start: close"
                     % self.MENU_CATS[self.menu_cat][1].upper()]
        if self._del_arm:
            kind, ident = self._del_arm
            if kind == "deckopen":
                what = "patch deck '%s' (%d patches)" % (
                    self.decks[ident]["name"],
                    len(self.decks[ident]["scenes"]))
            else:
                di, si = ident
                sc = self.decks[di]["scenes"][si]
                what = "patch %d '%s'" % (si + 1,
                                          sc.get("name") or sc["shader"])
            lines[0] = "DELETE %s?   [A: yes   B: no]" % what
        for i, (kind, _, label, active) in enumerate(rows[top:top + max_rows]):
            ri = top + i
            cur = ">" if ri == self.menu_idx else " "
            on = "*" if active else " "
            lines.append("%s %s %s" % (cur, on, label))
        key = tuple(lines)
        if key != self._menu_key:
            self._menu_key = key
            raw = self.plat.text_image(lines, self.w, self.menu_h,
                                       body_px=HEAD_ROW_PX,
                                       row_step=ROW_STEP,
                                       scroll=(top, len(rows)))
            upload_raw(self.menu_tex, self.w, self.menu_h, raw)

    def update_help(self, step):
        meta = self._get_meta(step["shader"])
        marker = lambda i: ">" if self.param_row == i else " "
        lines = ["%s%s — %s" % (step["shader"],
                                "♪" if self._has_audio(step) else "",
                                meta["desc"])]
        # browsing the knobs, the one you are on goes red — the same mark the
        # patch view uses, so the two screens agree about where you are
        def name(i, text):
            return "[%-7s]" % text if self.param_row == i else " %-7s " % text

        for i, p in enumerate(meta["params"][:4]):
            if i == 3 and not self._has_x3(step):
                continue        # sidecar lists a 4th param the shader lacks
            lfo = "  (LFO on)" if step["lfo"][i] else ""
            lines.append("%s%s %s%s" % (marker(i), name(i, p["name"]),
                                        p["help"], lfo))
        if self._has_time(step):
            lines.append("%s%s effect animation speed"
                         % (marker(4), name(4, "spd")))
        else:
            lines.append("  %-7s (this effect has no clock — slot hidden)"
                         % "spd")
        if self._has_audio(step):   # explain the mark where it is first met
            lines.append("  %-7s moves with the sound that is playing"
                         % "♪")
        lines.append("dpad </>: pick control   dpad ^/v: turn it")
        lines.append("A hold: punch  B: dice  Y: freeze picture  X: LFO")
        lines.append("hold X + ^v: LFO band all/low/mid/high (~ ~L ~M ~H)")
        lines.append("L/R: prev/next effect    Start: video/audio loader")
        lines.append("Sel+A: stack layer   Sel+B: remove focused layer")
        lines.append("Select: hide UI   Sel+L/R: build<->play   Sel+Start: quit")
        key = tuple(lines)
        if key != self._help_key:
            self._help_key = key
            raw = self.plat.text_image(lines, self.w, self.help_h,
                                       body_px=HEAD_ROW_PX,
                                       row_step=ROW_STEP)
            upload_raw(self.help_tex, self.w, self.help_h, raw)

    def render(self, dt):
        import math
        if dt > 0:
            self._fps += (1.0 / dt - self._fps) * 0.08
        now = time.time()
        was_stage = self.batt.stage
        self.batt.poll(now)
        if self.batt.stage > was_stage >= 1:    # each step down: say so even
            self._toast_until = now + 6.0       # with the UI hidden
        self.low_batt = self.batt.low
        if now - getattr(self, "_hb_t", 0) > 5.0:
            self._hb_t = now
            ch = self.chain()
            # checksum the pixels we actually drew: if this stops changing
            # while fps stays up, the engine is fine and the picture is not
            try:
                px = GL.glReadPixels(0, self.h // 2, self.w, 4,
                                     GL.GL_RGB, GL.GL_UNSIGNED_BYTE)
                sig = sum(bytearray(px)) & 0xFFFFFF
            except Exception as exc:
                sig = -1
                print("readback failed:", exc, flush=True)
            err = 0
            try:
                err = GL.glGetError()
            except Exception:
                pass
            print("hb fps=%.1f chain=%d [%s] frz=%d src=%s px=%06x glerr=0x%x "
                  "rss=%dMB"
                  % (self._fps, len(ch),
                     "+".join(s["shader"] for s in ch), int(self.frozen),
                     self.sources.label, sig & 0xFFFFFF, err, _rss_mb()),
                  flush=True)
        step = self.cur_step()
        spd = step["speed"]
        if step["lfo"][4]:                   # "auto": music drives the clock
            b = step.get("lfoband", [3] * 5)[4]
            if self.radio.active:
                spd = min(1.0, spd * 0.4 + self._band_value(b) * 0.9)
            else:
                spd = min(1.0, spd + 0.25 * math.sin(
                    self.t * (0.7, 1.3, 2.6, 1.0)[b]))
        if not self.frozen:
            self.t += dt * (0.1 + spd * 1.9)

        if self.radio.is_clip and self.radio.target_path != self.current_clip_path():
            self.radio.retune(self.current_clip_path())
        self.radio.update()
        if self.streamer is not None and not self.streamer.dead:
            # The stream's audio clock is pure sample count, so the only
            # thing keeping sound aligned with the wallclock-stamped video
            # is this governor: exactly (elapsed x rate) bytes out per tick.
            # Tap bursts are real — every clip switch spawns a decoder that
            # pre-rolls ~1.5s ahead of realtime — and pushing a burst
            # straight through shoved all later audio that far off the
            # picture (rec_06: +1.47s after one switch, while the switchless
            # take before it was sample-accurate). Bursts queue here and
            # play out at wallclock rate instead. Silence fills only after
            # the queue has run dry a few ticks, then covers the whole
            # deficit at once so the clock never falls behind by more.
            now = time.time()
            self._aud_owed += (now - self._aud_t) * 44100.0  # 22050 Hz * 2 B
            self._aud_t = now
            if self.radio.tap:
                self._aud_buf += self.radio.tap
                # The queue must stay SHALLOW. Emission is pinned to
                # realtime, so any backlog is a standing delay that never
                # drains — one take came out seconds behind after a few
                # clip switches, each stacking its pre-roll burst and the
                # old clip's never-played tail into the queue. Dropping
                # the oldest surplus keeps sync error bounded at ~0.3s
                # (about the sound path's own latency) instead of growing.
                del self._aud_buf[:-13230]         # cap: 0.3s
            n = int(min(self._aud_owed, 88200.0)) & ~1   # catch-up <= 2s/tick
            take = min(n, len(self._aud_buf))
            if take:
                self.streamer.push_audio(bytes(self._aud_buf[:take]))
                del self._aud_buf[:take]
                self._aud_owed -= take
            if self._aud_owed > 6615:           # dry ~0.15s: it's real silence
                pad = int(self._aud_owed) & ~1
                self.streamer.push_audio(b"\x00" * pad)
                self._aud_owed -= pad

        if self.sources.mode == "gen":
            self.source_prog.use()
            self.set_common(self.source_prog, step)
            self.draw_fullscreen()
            GL.glBindTexture(GL.GL_TEXTURE_2D, self.gen_tex)
            GL.glCopyTexSubImage2D(GL.GL_TEXTURE_2D, 0, 0, 0, 0, 0, self.w, self.h)
            src = self.gen_tex
        else:
            self.sources.update()   # keeps decoding while held, stays in sync
            src = self.sources.tex

        if self.deck and self.deck_mode:
            chain = list(step.get("layers", [])) + [step]
        else:
            chain = self.layers + [step]
        tex_in = src
        target = self.edit_step()
        # delay tap depth follows the top effect's first param
        k = 1 + int(chain[-1]["x"][0] * (self.DELAY_N - 2) + 0.5)
        tap = self.delay_ring[(self.delay_head - k) % self.DELAY_N]
        tap_half = self.delay_ring[(self.delay_head - max(1, k // 2))
                                   % self.DELAY_N]
        for li, ls in enumerate(chain):
            prog = self.programs.get(ls["shader"])
            if prog is None:            # deck-scene layers load lazily here
                self._ensure_program(ls["shader"])
                prog = self.programs.get(ls["shader"])
            if prog is None:            # shader truly broken: last resort
                prog = list(self.programs.values())[0]
            prog.use()
            self.set_common(prog, ls, top=(ls is target))
            prog.set_tex("u_tex0", 0, tex_in)
            prog.set_tex("u_tex1", 1, self.prev_tex)
            prog.set_tex("u_atlas", 2, self.atlas)
            prog.set_tex("u_dither", 3, self.bayer)
            prog.set_tex("u_tex2", 4, tap)
            prog.set_tex("u_tex3", 5, tap_half)   # half-depth ring tap
            self.draw_fullscreen()
            if li < len(chain) - 1:
                dst = self.chain_tex[li & 1]
                GL.glBindTexture(GL.GL_TEXTURE_2D, dst)
                GL.glCopyTexSubImage2D(GL.GL_TEXTURE_2D, 0, 0, 0, 0, 0,
                                       self.w, self.h)
                tex_in = dst
        GL.glBindTexture(GL.GL_TEXTURE_2D, self.prev_tex)
        GL.glCopyTexSubImage2D(GL.GL_TEXTURE_2D, 0, 0, 0, 0, 0, self.w, self.h)
        GL.glBindTexture(GL.GL_TEXTURE_2D, self.delay_ring[self.delay_head])
        GL.glCopyTexSubImage2D(GL.GL_TEXTURE_2D, 0, 0, 0, 0, 0, self.w, self.h)
        self.delay_head = (self.delay_head + 1) % self.DELAY_N

        # stream the clean output (pre-overlay) unless "UI in output" is
        # on — then the tap moves to after the panels are drawn
        if not self.output_ui:
            self._push_stream()

        if self.menu_open:
            self.update_menu()
            self.draw_panel(self.menu_tex, 0, 0, self.w, self.menu_h)
            self.draw_fps()
            if self.output_ui:
                self._push_stream()
            self.plat.flip()
            return

        show_toast = self.overlay_mode == 2 and time.time() < self._toast_until
        if self.overlay_mode != 2 or show_toast:
            if self.overlay_mode == 0 or show_toast:
                self.update_overlay(step)
                strip, tex, th = self._ov_used, self.overlay_tex, self.strip_h
            else:
                self.update_help(self.edit_step())
                strip, tex, th = self.help_h, self.help_tex, self.help_h
            self.draw_panel(tex, 0, 0, self.w, strip, th)
        if self.overlay_mode != 2:      # fps hides with the rest of the UI
            self.draw_fps()
        if self.output_ui:
            self._push_stream()

        self.plat.flip()

    def screenshot(self, path=None):
        if path is None:
            os.makedirs(os.path.join(ROOT, "shots"), exist_ok=True)
            path = os.path.join(ROOT, "shots", "shot_%d.png" % int(time.time()))
        GL.glPixelStorei(GL.GL_PACK_ALIGNMENT, 1)
        raw = GL.glReadPixels(0, 0, self.w, self.h, GL.GL_RGB, GL.GL_UNSIGNED_BYTE)
        stride = self.w * 3
        flipped = b"".join(raw[i * stride:(i + 1) * stride]
                           for i in reversed(range(self.h)))
        self.plat.save_png(flipped, self.w, self.h, path)
        print("saved", path)

    def run(self, frames=None, shot_path=None):
        count = 0
        alive = True
        while alive:
            dt = self.plat.tick(30)
            for ev in self.plat.poll():
                if not self.handle(ev):
                    alive = False
            self.render(min(dt, 0.1))
            count += 1
            if frames is not None:
                if self.radio.active and count % 30 == 0:
                    print("audio lvl %.2f bass %.2f high %.2f" %
                          (self.radio.level, self.radio.bass, self.radio.high))
                if count >= frames:
                    if shot_path:
                        self.screenshot(shot_path)
                    break
        if self.streamer is not None:
            self.streamer.close()
        self.radio.stop()
        self.plat.quit()


def parse_size(s):
    w, h = s.lower().split("x")
    return int(w), int(h)


def main():
    ap = argparse.ArgumentParser(description="HVS-80 (Handheld Video Synth)")
    ap.add_argument("--pack", default="packs/hvs80-synth")
    ap.add_argument("--playlist", default="* everything")
    ap.add_argument("--rom", default=None,
                    help=".vsb ROM file: JSON {pack, playlist}")
    ap.add_argument("--source", choices=["gen", "clip", "cam"], default=None)
    ap.add_argument("--size", type=parse_size, default=(640, 480))
    ap.add_argument("--frames", type=int, default=None,
                    help="render N frames then exit (smoke test)")
    ap.add_argument("--screenshot", default=None,
                    help="with --frames: save final frame here")
    ap.add_argument("--step", type=int, default=None,
                    help="start at playlist step (1-based)")
    ap.add_argument("--ui", type=int, choices=[0, 1, 2], default=0,
                    help="overlay mode: 0 compact, 1 help, 2 hidden")
    ap.add_argument("--radio", type=int, default=0,
                    help="start with audio N (1=clip, 2=NTS1, 3=NTS2)")
    ap.add_argument("--clip", default=None,
                    help="start on the clip whose filename contains this")
    ap.add_argument("--stream", default=None, const="live", nargs="?",
                    help="'live' = RTMP via stream.json, or a file path to record")
    ap.add_argument("--loader", action="store_true",
                    help="start with the loader menu open (testing)")
    ap.add_argument("--deckmode", choices=["build", "play"], default=None,
                    help="force deck mode at boot")
    ap.add_argument("--fullres", action="store_true",
                    help="decode video sources at full engine res. Always on "
                         "for desktop. NOT viable on the Zero 2W (saturates "
                         "a core); reserved for the CM4 build")
    ap.add_argument("--srcres", type=parse_size, default=None,
                    help="explicit source decode res, e.g. 480x360 "
                         "(the Zero 2W's measured ceiling)")
    ap.add_argument("--outui", action="store_true",
                    help="include the UI overlays in streams/recordings")
    args = ap.parse_args()

    if args.rom:
        with open(args.rom) as f:
            rom = json.load(f)
        args.pack = rom.get("pack", args.pack)
        args.playlist = rom.get("playlist", args.playlist)
        rom_stream = rom.get("stream")
        if rom_stream and not args.stream:
            args.stream = rom_stream if isinstance(rom_stream, str) else "live"
        if rom.get("loader"):
            args.loader = True
        if rom.get("deck") in ("build", "play"):
            args.deckmode = rom["deck"]
        if rom.get("fullres"):
            args.fullres = True
        if rom.get("srcres"):
            args.srcres = parse_size(rom["srcres"])
    if not IS_PI:
        args.fullres = True     # desktop always has the headroom

    if IS_PI:
        plat = PiPlatform()
    else:
        plat = DesktopPlatform(*args.size)

    inst = Instrument(plat, args)
    inst.overlay_mode = args.ui
    inst.output_ui = args.outui
    if inst.deck and args.deckmode == "play":
        # only the Setlist cart boots into the deck — the instrument
        # cart always boots browsing effects (deck reachable via Sel+L/R)
        inst.deck_mode = True
        inst._ensure_program(inst.deck[0]["shader"])
    if args.clip:
        for i, (k, p) in enumerate(inst.sources.slots):
            if k == "clip" and args.clip in os.path.basename(p):
                inst.sources.slot_idx = i
                break
    if args.radio:
        inst.radio.cycle(args.radio, inst.current_clip_path())
    if args.stream:
        dest = inst.stream_cfg["live"] if args.stream == "live" else args.stream
        if dest:
            inst.start_stream(dest)
            inst.output_idx = (3 if args.stream == "live"
                               else 1 if dest.startswith(("udp:", "srt:"))
                               else 2)
        else:
            print("no stream.json configured — not streaming")
    if args.step:
        inst.step_idx = (args.step - 1) % len(inst.playlist["steps"])
    if args.loader:
        inst.handle("src")
    inst.run(frames=args.frames, shot_path=args.screenshot)


if __name__ == "__main__":
    main()
