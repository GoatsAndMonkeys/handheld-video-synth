#!/usr/bin/env python3
"""HVS-80 Pocket Computer (Handheld Video Synth) — a pocket computer for video effects.

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
import struct
import time

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
        pygame.display.set_caption("HVS-80 Pocket Computer")
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

    def text_image(self, lines, w, h):
        """Returns bottom-up RGB bytes. Line 0 highlighted, rest dim."""
        pg = self.pygame
        surf = pg.Surface((w, h))
        surf.fill((10, 10, 14))
        for i, line in enumerate(lines):
            if i == 0:
                surf.blit(self._font14.render(line, True, (120, 255, 150)), (8, 4))
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

    def text_image(self, lines, w, h):
        return self.backend.text_image(lines, w, h)

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


def make_bayer_texture():
    b = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
    raw = bytes(v for cell in b
                for v in [int((cell + 0.5) / 16.0 * 255)] * 3)
    return make_texture(4, 4, raw, nearest=True, repeat=True)


# --------------------------------------------------------------------------
# Sources
# --------------------------------------------------------------------------
RADIO_STATIONS = [
    ("off", None),
    ("clip", "__CLIP__"),   # sound of the current video clip
    ("NTS1", "https://stream-relay-geo.ntslive.net/stream"),
    ("NTS2", "https://stream-relay-geo.ntslive.net/stream2"),
]


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
        name, url = RADIO_STATIONS[self.station_idx]
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
            return
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

    def __init__(self, ffmpeg, w, h, fps, audio_src, dest):
        import subprocess
        import fcntl
        self.frame_size = w * h * 3
        cmd = [ffmpeg, "-loglevel", "error",
               "-f", "rawvideo", "-pix_fmt", "rgb24",
               "-s", "%dx%d" % (w, h), "-r", str(fps), "-i", "pipe:0"]
        if audio_src is not None:
            src, is_file = audio_src
            cmd += (["-stream_loop", "-1", "-re"] if is_file else []) + ["-i", src]
        else:
            cmd += ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]
        vcodec = (["-c:v", "h264_v4l2m2m"] if IS_PI
                  else ["-c:v", "libx264", "-preset", "veryfast"])
        cmd += (["-map", "0:v", "-map", "1:a", "-vf", "vflip"] + vcodec +
                ["-b:v", "1200k", "-g", str(fps * 2), "-pix_fmt", "yuv420p",
                 "-c:a", "aac", "-b:a", "96k", "-ar", "44100", "-shortest"])
        if dest.startswith("rtmp"):
            cmd += ["-f", "flv", dest]
        elif dest.startswith(("udp:", "srt:")):
            cmd += ["-f", "mpegts", "-flush_packets", "1", dest]
        else:
            cmd += ["-y", dest]
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        self.dead = False
        # frames are ~1MB — far beyond a pipe buffer — so a writer thread
        # does blocking whole-frame writes; push() drops when it's behind
        import queue
        import threading
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
            except (BrokenPipeError, OSError):
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

    def close(self):
        try:
            self._q.put(None, timeout=1)
            self._thread.join(timeout=3)
            self.proc.wait(timeout=8)
        except Exception:
            try:
                self.proc.kill()
            except Exception:
                pass


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


class _FFClip:
    """Looping realtime rawvideo pipe from ffmpeg — clip decode without
    OpenCV. -re paces decode to wall-clock so clip video stays in step with
    its audio; we read non-blocking and show the newest complete frame,
    dropping any we're too slow for."""

    def __init__(self, path, w, h, ffmpeg):
        import subprocess
        import fcntl
        self.frame_size = w * h * 3
        vf = ("scale=%d:%d:force_original_aspect_ratio=increase,"
              "crop=%d:%d,vflip" % (w, h, w, h))
        self.proc = subprocess.Popen(
            [ffmpeg, "-loglevel", "quiet", "-skip_loop_filter", "all",
             "-re", "-i", path,
             "-f", "rawvideo", "-pix_fmt", "rgb24", "-vf", vf, "pipe:1"],
            stdout=subprocess.PIPE, bufsize=self.frame_size * 4)
        fl = fcntl.fcntl(self.proc.stdout, fcntl.F_GETFL)
        fcntl.fcntl(self.proc.stdout, fcntl.F_SETFL, fl | os.O_NONBLOCK)
        self._buf = b""

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
        frame = self._buf[(nf - 1) * self.frame_size:nf * self.frame_size]
        self._buf = self._buf[nf * self.frame_size:]
        return frame

    def done(self):
        """Video ended: decoder exited and no whole frame remains buffered."""
        return (self.proc.poll() is not None
                and len(self._buf) < self.frame_size)

    def close(self):
        try:
            self.proc.kill()
            self.proc.wait(timeout=2)
            self.proc.stdout.close()
        except Exception:
            pass


class Sources:
    """Slots: gen (shader pattern), one per clip in the pack, cam (webcam)."""

    def __init__(self, w, h, clips_dir, fullres=False):
        # default: decode/capture at half res — GPU upscaling is free, lo-fi
        # is the brand, and half res is what keeps the Zero 2W near 20fps.
        # fullres decodes at engine res (desktop default; Pi experiment).
        if fullres:
            self.w, self.h = w, h
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
        self.slots = self._scan()
        self.slot_idx = 0

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
        import glob
        slots = [("gen", None)]
        has_cv2 = self._cv2() is not None
        if has_cv2 or self._ffmpeg:
            clips = (sorted(glob.glob(os.path.join(self.clips_dir, "*.mp4"))) +
                     sorted(glob.glob(os.path.join(self.clips_dir, "*", "*.mp4"))))
            for p in clips:
                slots.append(("clip", p))
        if has_cv2:
            slots.append(("cam", None))
        return slots

    def collections(self):
        """Ordered {collection_name: [slot indices]} — subfolder per
        playlist, loose clips under 'misc'."""
        cols = {}
        for i, (k, p) in enumerate(self.slots):
            if k != "clip":
                continue
            rel = os.path.relpath(p, self.clips_dir)
            col = os.path.dirname(rel) or "misc"
            cols.setdefault(col, []).append(i)
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

    def pause(self, flag):
        """Freeze/unfreeze the clip decoder in place (SIGSTOP keeps the
        exact moment; SIGCONT resumes in sync)."""
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
            if self._ff is None or self._ff_path != path:
                if self._ff is not None:
                    self._ff.close()
                self._ff = _FFClip(path, self.w, self.h, self._ffmpeg)
                self._ff_path = path
            raw = self._ff.read()
            if raw is not None:  # None = no new frame yet; keep the last one
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
        frame = cv2.resize(frame, (self.w, self.h))
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        upload_raw(self.tex, self.w, self.h,
                   np.ascontiguousarray(np.flipud(rgb)).tobytes())
        return True


# --------------------------------------------------------------------------
# Instrument
# --------------------------------------------------------------------------
class Instrument:
    PARAM_ROWS = ["x0", "x1", "x2", "speed", "src", "aud"]

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
        self.source_prog = Program(
            os.path.join(self.pack_dir, "shaders", "_source_plasma.frag"))
        self.overlay_prog = Program(
            os.path.join(self.pack_dir, "shaders", "_overlay.frag"))

        self.step_idx = 0
        self.param_row = 0
        self.t = 0.0
        self.punch = False
        self.frozen = False
        self.layers = []      # locked background effects (Sel+A stacks)
        self.layer_focus = 0  # 0 = top of chain; Sel+Up/Down digs deeper

        # deck: user-saved full scenes (effect+params+video+audio), L/R
        # walks it when non-empty; persisted per pack
        self.deck_path = os.path.join(self.pack_dir, "playlists", "deck.json")
        self.deck = []
        self.deck_idx = 0
        self.deck_mode = False   # False = build (L/R browses effects),
                                 # True = play (L/R walks saved scenes)
        if os.path.exists(self.deck_path):
            try:
                with open(self.deck_path) as f:
                    self.deck = json.load(f).get("steps", [])
                for sc in self.deck:
                    sc.setdefault("lfo", [False] * 4)
                    while len(sc["lfo"]) < 4:
                        sc["lfo"].append(False)
            except Exception as exc:
                print("deck load failed:", exc)

        self.fullres = bool(getattr(args, "fullres", False))
        self.sources = Sources(self.w, self.h,
                               os.path.join(self.pack_dir, "clips"),
                               self.fullres)
        if args.source:
            self.sources.select(args.source)
        self.radio = RadioAudio(_find_ffmpeg())
        self.radio.station_idx = 1   # default: clips play their own sound
        self.streamer = None
        self.stream_cfg = load_stream_cfg()
        self.output_idx = 0
        self._frame_no = 0
        self.menu_open = False
        self.menu_idx = 0
        self.menu_level = 0
        self.menu_cat = 0
        self.menu_col = None
        self.menu_h = 330
        self.menu_tex = make_texture(self.w, self.menu_h)
        self._menu_key = None
        self.prev_tex = make_texture(self.w, self.h, bytes(self.w * self.h * 3))
        self.gen_tex = make_texture(self.w, self.h)
        self.chain_tex = make_texture(self.w, self.h)  # inter-layer buffer
        # delay line: ring of past output frames (u_tex2 tap, ~0.8s reach)
        self.DELAY_N = 16
        self.delay_ring = [make_texture(self.w, self.h,
                                        bytes(self.w * self.h * 3))
                           for _ in range(self.DELAY_N)]
        self.delay_head = 0

        atlas_raw, aw, ah = plat.glyph_atlas(ASCII_CHARS)
        self.atlas = make_texture(aw, ah, atlas_raw)
        self.bayer = make_bayer_texture()

        self.strip_h = 76        # tall enough for 3 layer rows + hint
        self._ov_used = 44
        self.help_h = 196
        self.overlay_tex = make_texture(self.w, self.strip_h)
        self.help_tex = make_texture(self.w, self.help_h)
        self.overlay_mode = 0        # 0 compact, 1 help, 2 hidden
        self._overlay_key = None
        self._help_key = None
        self._toast_until = 0.0     # hidden mode: flash the bar after a change
        self.fps_w, self.fps_h = 64, 22
        self.fps_tex = make_texture(self.fps_w, self.fps_h)
        self._fps = 0.0
        self._fps_key = None

        self.meta = {}  # shader sidecar metadata, loaded lazily per shader

    def load_playlist(self, name):
        path = os.path.join(self.pack_dir, "playlists", name + ".json")
        with open(path) as f:
            pl = json.load(f)
        for step in pl["steps"]:
            step.setdefault("x", [0.5, 0.5, 0.5])
            step.setdefault("speed", 0.5)
            step.setdefault("lfo", [False, False, False])
            while len(step["lfo"]) < 4:      # 4th slot = speed ("auto" mode)
                step["lfo"].append(False)
            step.setdefault("lfoband", [3, 3, 3, 3])  # 3=ALL, 0/1/2=L/M/H
            while len(step["lfoband"]) < 4:
                step["lfoband"].append(3)
            step["x"] = [float(v) for v in step["x"]]
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
        try:
            self.programs[name] = Program(
                os.path.join(self.pack_dir, "shaders", name + ".frag"))
            return True
        except Exception as exc:
            print("shader %s failed: %s" % (name, exc))
            return False

    def list_sets(self):
        import glob
        out = []
        for pdir in sorted(glob.glob(os.path.join(ROOT, "packs", "*"))):
            for pj in sorted(glob.glob(os.path.join(pdir, "playlists", "*.json"))):
                name = os.path.splitext(os.path.basename(pj))[0]
                if name != "deck":
                    out.append((os.path.relpath(pdir, ROOT), name))
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
                self.meta = {}
                self.source_prog = Program(os.path.join(
                    self.pack_dir, "shaders", "_source_plasma.frag"))
                self.overlay_prog = Program(os.path.join(
                    self.pack_dir, "shaders", "_overlay.frag"))
                self.sources = Sources(self.w, self.h,
                                       os.path.join(self.pack_dir, "clips"),
                                       self.fullres)
                self.deck_path = os.path.join(self.pack_dir, "playlists",
                                              "deck.json")
                self.deck = []
                self.deck_idx = 0
                if os.path.exists(self.deck_path):
                    try:
                        with open(self.deck_path) as f:
                            self.deck = json.load(f).get("steps", [])
                    except Exception:
                        pass
            for step in self.playlist["steps"]:
                self._ensure_program(step["shader"])
        except Exception as exc:
            print("set load failed:", exc)
            (self.pack_rel, self.pack_dir, self.playlist,
             self.playlist_name, self.step_idx) = old

    def _save_deck(self):
        with open(self.deck_path, "w") as f:
            json.dump({"name": "deck", "steps": self.deck}, f, indent=2)

    def step(self, delta):
        self.layer_focus = 0
        if self.deck and self.deck_mode:
            self.deck_idx = (self.deck_idx + delta) % len(self.deck)
            self._ensure_program(self.deck[self.deck_idx]["shader"])
        else:
            self.step_idx = (self.step_idx + delta) % len(self.playlist["steps"])

    def nudge(self, delta):
        s = self.edit_step()
        row = self.PARAM_ROWS[self.param_row]
        if row == "src":
            self.sources.cycle(1 if delta > 0 else -1)
        elif row == "aud":
            self.radio.cycle(1 if delta > 0 else -1, self.current_clip_path())
        elif row == "speed":
            s["speed"] = min(1.0, max(0.0, s["speed"] + delta))
        else:
            i = int(row[1])
            s["x"][i] = min(1.0, max(0.0, s["x"][i] + delta))

    TOAST_EVENTS = ("prev", "next", "up", "down", "left", "right",
                    "src", "randomize", "freeze", "lfo", "mode_toggle",
                    "lfoband_up", "lfoband_down")

    MENU_CATS = [("video", "Video source"), ("audio", "Audio source"),
                 ("output", "Output"), ("sets", "FX deck"),
                 ("deck", "My deck")]

    def _cat_current(self, key):
        if key == "video":
            return self.sources.label
        if key == "audio":
            return self.radio.label
        if key == "output":
            return ["screen", "mixer", "recording", "LIVE"][self.output_idx]
        if key == "sets":
            return self.playlist_name
        return "%d scenes%s" % (len(self.deck),
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
        elif key == "audio":
            labels = {"off": "no audio", "clip": "video's own sound",
                      "NTS1": "NTS 1 radio", "NTS2": "NTS 2 radio"}
            for i, (name, _) in enumerate(RADIO_STATIONS):
                rows.append(("aud", i, labels.get(name, name),
                             i == self.radio.station_idx))
        elif key == "output":
            outs = ["screen only", "to mixer (laptop)", "record to SD",
                    "go live (YouTube)" +
                    ("" if self.stream_cfg["live"] else "  [no key]")]
            for i, label in enumerate(outs):
                rows.append(("out", i, label, i == self.output_idx))
        elif key == "sets":
            for i, (pack, name) in enumerate(self.list_sets()):
                active = (pack == self.pack_rel and name == self.playlist_name
                          and not self.deck)
                rows.append(("set", i, "%s  (%s)" %
                             (name, os.path.basename(pack)), active))
        else:  # deck
            if self.deck:
                mode = ("mode: PLAY deck  (L/R = scenes)" if self.deck_mode
                        else "mode: BUILD  (L/R = effects)")
                rows.append(("deckmode", None, mode, self.deck_mode))
            for i, sc in enumerate(self.deck):
                lfo = "~" if any(sc.get("lfo", [])) else ""
                label = "%d  %s%s  [%.2f %.2f %.2f]" % (
                    i + 1, sc["shader"], lfo,
                    sc["x"][0], sc["x"][1], sc["x"][2])
                rows.append(("deck", i, label,
                             bool(self.deck) and i == self.deck_idx))
            rows.append(("deckadd", None, "+ save current scene", False))
            if self.deck:
                rows.append(("deckclear", None, "x clear deck", False))
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

    def _menu_handle(self, ev):
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
            elif kind == "vcol":
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
            elif kind == "set":
                sets = self.list_sets()
                if i < len(sets):
                    self.load_set(sets[i][0], sets[i][1])
            elif kind == "deckmode":
                self.deck_mode = not self.deck_mode
            elif kind == "deck":
                self.deck_idx = i
                self.deck_mode = True    # picking a scene = play it
                self._ensure_program(self.deck[i]["shader"])
            elif kind == "deckadd":
                import copy
                sc = copy.deepcopy(self.cur_step())
                sc.pop("video", None)    # scenes are effects only —
                sc.pop("aud", None)      # video/audio stay live choices
                if self.layers and not (self.deck and self.deck_mode):
                    sc["layers"] = copy.deepcopy(self.layers)
                self.deck.append(sc)
                self.deck_idx = len(self.deck) - 1
                self._save_deck()
            elif kind == "deckclear":
                self.deck = []
                self.deck_idx = 0
                self.deck_mode = False
                self._save_deck()
        elif ev == "freeze":  # Y in the deck list = delete scene
            rows = self._menu_rows()
            if (self.menu_level == 1 and rows and
                    self.menu_idx < len(rows) and
                    rows[self.menu_idx][0] == "deck"):
                i = rows[self.menu_idx][1]
                del self.deck[i]
                if not self.deck:
                    self.deck_mode = False
                    self.deck_idx = 0
                else:
                    self.deck_idx = min(self.deck_idx, len(self.deck) - 1)
                self._save_deck()
                self.menu_idx = max(0, self.menu_idx - 1)
        elif ev == "randomize":  # B = back / close
            if self.menu_level == 2:
                self.menu_level = 1
                rows = self._menu_rows()
                self.menu_idx = next(
                    (j for j, r in enumerate(rows)
                     if r[0] == "vcol" and r[1] == self.menu_col), 0)
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
            if self.menu_open:
                self.menu_level = 0
                self.menu_cat = 0
                self.menu_idx = 0
            return True
        if self.menu_open:
            return self._menu_handle(ev)
        if self.overlay_mode == 2 and ev in self.TOAST_EVENTS:
            self._toast_until = time.time() + 2.0
        elif ev == "prev":
            self.step(-1)
        elif ev == "next":
            self.step(+1)
        elif ev == "left":
            self.param_row = (self.param_row - 1) % len(self.PARAM_ROWS)
        elif ev == "right":
            self.param_row = (self.param_row + 1) % len(self.PARAM_ROWS)
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
            s["x"] = [round(random.random(), 2) for _ in range(3)]
        elif ev == "layer_add":
            import copy
            if not (self.deck and self.deck_mode):
                self.layers.append(copy.deepcopy(self.cur_step()))
                if len(self.layers) > 2:      # cap chain at 3 total
                    self.layers.pop(0)
                self.layer_focus = 0
        elif ev == "layer_clear":
            self.layers = []
            self.layer_focus = 0
        elif ev == "layer_focus_up":
            self.layer_focus = min(self.layer_focus + 1, len(self.chain()) - 1)
        elif ev == "layer_focus_down":
            self.layer_focus = max(0, self.layer_focus - 1)
        elif ev == "mode_toggle":
            if self.deck:
                self.deck_mode = not self.deck_mode
                if self.deck_mode:  # entering play: land on current scene
                    self._ensure_program(
                        self.deck[self.deck_idx % len(self.deck)]["shader"])
        elif ev == "freeze":
            self.frozen = not self.frozen
            self.sources.pause(self.frozen)     # hold the video frame
            if self.radio.is_clip:              # and its sound, in sync
                self.radio.pause(self.frozen)   # (live radio keeps playing)
        elif ev == "lfo":
            if self.param_row < 4:  # any x param or speed ("auto")
                s = self.edit_step()
                s.setdefault("lfo", [False] * 4)
                s["lfo"][self.param_row] = not s["lfo"][self.param_row]
        elif ev in ("lfoband_up", "lfoband_down"):
            if self.param_row < 4:
                s = self.edit_step()
                s.setdefault("lfo", [False] * 4)
                lb = s.setdefault("lfoband", [3, 3, 3, 3])
                while len(lb) < 4:
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
        name, url = RADIO_STATIONS[self.radio.station_idx]
        clip = self.current_clip_path()
        if name == "clip" and clip:
            audio_src = (clip, True)
        elif url and url != "__CLIP__":
            audio_src = (url, False)
        else:
            audio_src = None
        self.streamer = Streamer(_find_ffmpeg() or "ffmpeg",
                                 self.w, self.h, 15, audio_src, dest)
        print("streaming to", dest.split("/")[2] if "://" in dest else dest)

    def draw_fullscreen(self):
        GL.glDrawArrays(GL.GL_TRIANGLES, 0, 3)

    def draw_panel(self, tex, x, y, pw, ph):
        GL.glEnable(GL.GL_SCISSOR_TEST)
        GL.glScissor(x, y, pw, ph)
        self.overlay_prog.use()
        self.overlay_prog.set4f("u_rect", x / float(self.w), y / float(self.h),
                                pw / float(self.w), ph / float(self.h))
        self.overlay_prog.set_tex("u_tex0", 0, tex)
        self.draw_fullscreen()
        GL.glDisable(GL.GL_SCISSOR_TEST)

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
        lb = step.get("lfoband", [3, 3, 3, 3])
        for i in range(3):
            v = step["x"][i]
            if step.get("lfo", [False] * 4)[i]:
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
                    "params": [{"name": "x%d" % i, "help": ""} for i in range(3)]}
            side = os.path.join(self.pack_dir, "shaders", name + ".json")
            if os.path.exists(side):
                try:
                    with open(side) as f:
                        meta.update(json.load(f))
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

    def _step_summary(self, s):
        lfo = "~" if any(s.get("lfo", [])) else ""
        return "%s%s %.2f %.2f %.2f spd %.2f" % (
            s["shader"], lfo, s["x"][0], s["x"][1], s["x"][2], s["speed"])

    def update_overlay(self, step):
        chain = self.chain()
        focused = self.edit_step()
        step = focused
        names = self._param_names(step) + ["spd"]
        parts = []
        lb = step.get("lfoband", [3, 3, 3, 3])
        lf = step.get("lfo", [False] * 4)
        for i in range(4):
            label = names[i]
            if lf[i]:
                b = lb[i] if i < len(lb) else 3
                label += "~" + ("" if b == 3 else "LMH"[b])
            val = step["x"][i] if i < 3 else step["speed"]
            fmt = "[%s %.2f]" if self.param_row == i else "%s %.2f"
            parts.append(fmt % (label, val))
        fmt = "[src %s]" if self.param_row == 4 else "src %s"
        parts.append(fmt % self.sources.label)
        fmt = "[aud %s]" if self.param_row == 5 else "aud %s"
        parts.append(fmt % self.radio.label)
        flags = ("  FRZ" if self.frozen else "") + ("  PUNCH" if self.punch else "")
        if self.deck and not self.deck_mode:
            flags += "  BUILD"
        if self.streamer is not None and not self.streamer.dead:
            flags += {1: "  MIX", 2: "  REC", 3: "  LIVE"}.get(self.output_idx, "")
        if self.deck and self.deck_mode:
            pos = "D%d/%d" % (self.deck_idx + 1, len(self.deck))
        else:
            pos = "%d/%d" % (self.step_idx + 1, len(self.playlist["steps"]))
        fidx = len(chain) - 1 - min(self.layer_focus, len(chain) - 1)
        shader = step["shader"]
        if len(chain) > 1:
            shader += "  (layer %d/%d)" % (fidx + 1, len(chain))
        lines = ["%s %s  %s%s" % (pos, shader, "  ".join(parts), flags)]
        for li in range(len(chain) - 1, -1, -1):   # top first, then deeper
            if chain[li] is focused:
                continue
            tag = "top" if li == len(chain) - 1 else "L%d" % (li + 1)
            lines.append("  %s: %s" % (tag, self._step_summary(chain[li])))
        lines.append("Select: what do these knobs do?"
                     + ("   Sel+^v: pick layer" if len(chain) > 1 else ""))
        key = tuple(lines)
        self._ov_used = 26 + 15 * (len(lines) - 1) + 6
        if key != self._overlay_key:
            self._overlay_key = key
            raw = self.plat.text_image(lines, self.w, self.strip_h)
            upload_raw(self.overlay_tex, self.w, self.strip_h, raw)

    def update_menu(self):
        rows = self._menu_rows()
        self.menu_idx = min(self.menu_idx, max(0, len(rows) - 1))
        max_rows = 18
        top = max(0, min(self.menu_idx - max_rows // 2, len(rows) - max_rows))
        if self.menu_level == 0:
            lines = ["LOADER   A: open   Start: close"]
        elif self.menu_level == 2:
            lines = ["%s   A: play   B: back   Start: close"
                     % str(self.menu_col).upper()]
        elif self.MENU_CATS[self.menu_cat][0] == "deck":
            lines = ["MY DECK   A: play   Y: delete   B: back   Start: close"]
        else:
            lines = ["%s   A: apply   B: back   Start: close"
                     % self.MENU_CATS[self.menu_cat][1].upper()]
        for i, (kind, _, label, active) in enumerate(rows[top:top + max_rows]):
            ri = top + i
            cur = ">" if ri == self.menu_idx else " "
            on = "*" if active else " "
            lines.append("%s %s %s" % (cur, on, label))
        key = tuple(lines)
        if key != self._menu_key:
            self._menu_key = key
            raw = self.plat.text_image(lines, self.w, self.menu_h)
            upload_raw(self.menu_tex, self.w, self.menu_h, raw)

    def update_help(self, step):
        meta = self._get_meta(step["shader"])
        marker = lambda i: ">" if self.param_row == i else " "
        lines = ["%s — %s" % (step["shader"], meta["desc"])]
        for i, p in enumerate(meta["params"]):
            lfo = "  (LFO on)" if step["lfo"][i] else ""
            lines.append("%s %-7s %s%s" % (marker(i), p["name"], p["help"], lfo))
        lines.append("%s %-7s effect animation speed" % (marker(3), "spd"))
        lines.append("%s %-7s input: plasma / clip / camera" % (marker(4), "src"))
        lines.append("%s %-7s audio: clip sound / NTS radio (LFOs follow it)"
                     % (marker(5), "aud"))
        lines.append("dpad </>: pick control   dpad ^/v: turn it")
        lines.append("A hold: punch  B: dice  Y: freeze video+time  X: LFO")
        lines.append("hold X + ^v: LFO band all/low/mid/high (~ ~L ~M ~H)")
        lines.append("L/R: prev/next effect    Start: video/audio loader")
        lines.append("Sel+A: stack layer   Sel+B: clear layers")
        lines.append("Select: hide UI   Sel+L/R: build<->play   Sel+Start: quit")
        key = tuple(lines)
        if key != self._help_key:
            self._help_key = key
            raw = self.plat.text_image(lines, self.w, self.help_h)
            upload_raw(self.help_tex, self.w, self.help_h, raw)

    def render(self, dt):
        import math
        if dt > 0:
            self._fps += (1.0 / dt - self._fps) * 0.08
        step = self.cur_step()
        spd = step["speed"]
        if step["lfo"][3]:                   # "auto": music drives the clock
            b = step.get("lfoband", [3, 3, 3, 3])[3]
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

        if self.sources.mode == "gen":
            self.source_prog.use()
            self.set_common(self.source_prog, step)
            self.draw_fullscreen()
            GL.glBindTexture(GL.GL_TEXTURE_2D, self.gen_tex)
            GL.glCopyTexSubImage2D(GL.GL_TEXTURE_2D, 0, 0, 0, 0, 0, self.w, self.h)
            src = self.gen_tex
        else:
            if not self.frozen:
                self.sources.update()
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
        for li, ls in enumerate(chain):
            prog = self.programs.get(ls["shader"])
            if prog is None:
                prog = list(self.programs.values())[0]
            prog.use()
            self.set_common(prog, ls, top=(ls is target))
            prog.set_tex("u_tex0", 0, tex_in)
            prog.set_tex("u_tex1", 1, self.prev_tex)
            prog.set_tex("u_atlas", 2, self.atlas)
            prog.set_tex("u_dither", 3, self.bayer)
            prog.set_tex("u_tex2", 4, tap)
            self.draw_fullscreen()
            if li < len(chain) - 1:
                GL.glBindTexture(GL.GL_TEXTURE_2D, self.chain_tex)
                GL.glCopyTexSubImage2D(GL.GL_TEXTURE_2D, 0, 0, 0, 0, 0,
                                       self.w, self.h)
                tex_in = self.chain_tex
        GL.glBindTexture(GL.GL_TEXTURE_2D, self.prev_tex)
        GL.glCopyTexSubImage2D(GL.GL_TEXTURE_2D, 0, 0, 0, 0, 0, self.w, self.h)
        GL.glBindTexture(GL.GL_TEXTURE_2D, self.delay_ring[self.delay_head])
        GL.glCopyTexSubImage2D(GL.GL_TEXTURE_2D, 0, 0, 0, 0, 0, self.w, self.h)
        self.delay_head = (self.delay_head + 1) % self.DELAY_N

        # stream the clean output (pre-overlay), every other frame
        self._frame_no += 1
        if self.streamer is not None and self._frame_no % 2 == 0:
            GL.glPixelStorei(GL.GL_PACK_ALIGNMENT, 1)
            raw = GL.glReadPixels(0, 0, self.w, self.h,
                                  GL.GL_RGB, GL.GL_UNSIGNED_BYTE)
            self.streamer.push(raw)

        if self.menu_open:
            self.update_menu()
            self.draw_panel(self.menu_tex, 0, 0, self.w, self.menu_h)
            self.draw_fps()
            self.plat.flip()
            return

        show_toast = self.overlay_mode == 2 and time.time() < self._toast_until
        if self.overlay_mode != 2 or show_toast:
            if self.overlay_mode == 0 or show_toast:
                self.update_overlay(step)
                strip, tex = self._ov_used, self.overlay_tex
            else:
                self.update_help(self.edit_step())
                strip, tex = self.help_h, self.help_tex
            self.draw_panel(tex, 0, 0, self.w, strip)
        if self.overlay_mode != 2:      # fps hides with the rest of the UI
            self.draw_fps()

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
    ap = argparse.ArgumentParser(description="HVS-80 Pocket Computer (Handheld Video Synth)")
    ap.add_argument("--pack", default="packs/demo")
    ap.add_argument("--playlist", default="set1")
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
                    help="decode video sources at full engine res "
                         "(always on for desktop; Pi experiment)")
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
    if not IS_PI:
        args.fullres = True     # desktop always has the headroom

    if IS_PI:
        plat = PiPlatform()
    else:
        plat = DesktopPlatform(*args.size)

    inst = Instrument(plat, args)
    inst.overlay_mode = args.ui
    if inst.deck and args.deckmode != "build":
        # boot straight into scene 1 of the deck, in play mode
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
