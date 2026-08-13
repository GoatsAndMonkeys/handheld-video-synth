"""Raspberry Pi legacy-driver backend: dispmanx EGL window + GLES2 via ctypes.

Targets RetroPie/Raspbian Buster on the Broadcom VideoCore stack (/opt/vc) —
the same platform recurBOY and the RetroPie openFrameworks synths use. No X,
no KMS, no SDL: we create a fullscreen dispmanx element and a GLES2 context
on it directly. Python 3.7 compatible.

Exposes:
  GL             — PyOpenGL-lookalike wrapper (just the calls the engine uses)
  GLES_PREAMBLE  — shader preamble for GLES2
  PiWindow       — fullscreen EGL window (init/flip/size)
  PiInput        — evdev gamepad -> logical event strings
  text_image / glyph_atlas / save_png — PIL-based helpers
"""
import ctypes
import os
import time

GLES_PREAMBLE = "precision mediump float;\n"

_VC = "/opt/vc/lib/"


# --------------------------------------------------------------------------
# EGL / dispmanx window
# --------------------------------------------------------------------------
class _EGL_DISPMANX_WINDOW_T(ctypes.Structure):
    _fields_ = [("element", ctypes.c_int32),
                ("width", ctypes.c_int32),
                ("height", ctypes.c_int32)]


class _VC_RECT_T(ctypes.Structure):
    _fields_ = [("x", ctypes.c_int32), ("y", ctypes.c_int32),
                ("width", ctypes.c_int32), ("height", ctypes.c_int32)]


EGL_SURFACE_TYPE = 0x3033
EGL_WINDOW_BIT = 0x0004
EGL_RENDERABLE_TYPE = 0x3040
EGL_OPENGL_ES2_BIT = 0x0004
EGL_RED_SIZE, EGL_GREEN_SIZE, EGL_BLUE_SIZE, EGL_ALPHA_SIZE = 0x3024, 0x3023, 0x3022, 0x3021
EGL_DEPTH_SIZE = 0x3025
EGL_NONE = 0x3038
EGL_CONTEXT_CLIENT_VERSION = 0x3098
EGL_OPENGL_ES_API = 0x30A0


class PiWindow:
    def __init__(self):
        # GLESv2 must load first with RTLD_GLOBAL: libbrcmEGL links its symbols
        self.bcm = ctypes.CDLL(_VC + "libbcm_host.so", mode=ctypes.RTLD_GLOBAL)
        self.glib = ctypes.CDLL(_VC + "libbrcmGLESv2.so", mode=ctypes.RTLD_GLOBAL)
        self.egl = ctypes.CDLL(_VC + "libbrcmEGL.so", mode=ctypes.RTLD_GLOBAL)
        self.bcm.bcm_host_init()

        w, h = ctypes.c_uint32(0), ctypes.c_uint32(0)
        if self.bcm.graphics_get_display_size(0, ctypes.byref(w), ctypes.byref(h)) < 0:
            raise RuntimeError("graphics_get_display_size failed")
        self.width, self.height = int(w.value), int(h.value)

        e = self.egl
        e.eglGetDisplay.restype = ctypes.c_void_p
        e.eglCreateContext.restype = ctypes.c_void_p
        e.eglCreateWindowSurface.restype = ctypes.c_void_p
        self.display = e.eglGetDisplay(ctypes.c_void_p(0))
        if not self.display:
            raise RuntimeError("eglGetDisplay failed")
        if not e.eglInitialize(ctypes.c_void_p(self.display), None, None):
            raise RuntimeError("eglInitialize failed")

        cfg_attribs = (ctypes.c_int32 * 13)(
            EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8,
            EGL_ALPHA_SIZE, 8, EGL_SURFACE_TYPE, EGL_WINDOW_BIT,
            EGL_RENDERABLE_TYPE, EGL_OPENGL_ES2_BIT, EGL_NONE)
        config = ctypes.c_void_p()
        ncfg = ctypes.c_int32()
        if not e.eglChooseConfig(ctypes.c_void_p(self.display), cfg_attribs,
                                 ctypes.byref(config), 1, ctypes.byref(ncfg)) or ncfg.value < 1:
            raise RuntimeError("eglChooseConfig failed")
        e.eglBindAPI(EGL_OPENGL_ES_API)

        ctx_attribs = (ctypes.c_int32 * 3)(EGL_CONTEXT_CLIENT_VERSION, 2, EGL_NONE)
        self.context = e.eglCreateContext(ctypes.c_void_p(self.display), config,
                                          ctypes.c_void_p(0), ctx_attribs)
        if not self.context:
            raise RuntimeError("eglCreateContext failed")

        dst = _VC_RECT_T(0, 0, self.width, self.height)
        src = _VC_RECT_T(0, 0, self.width << 16, self.height << 16)
        disp = self.bcm.vc_dispmanx_display_open(0)
        update = self.bcm.vc_dispmanx_update_start(0)
        element = self.bcm.vc_dispmanx_element_add(
            update, disp, 2000,  # layer above ES
            ctypes.byref(dst), 0, ctypes.byref(src),
            0, 0, 0, 0)
        self.bcm.vc_dispmanx_update_submit_sync(update)

        self._nativewindow = _EGL_DISPMANX_WINDOW_T(element, self.width, self.height)
        self.surface = e.eglCreateWindowSurface(ctypes.c_void_p(self.display), config,
                                                ctypes.byref(self._nativewindow), None)
        if not self.surface:
            raise RuntimeError("eglCreateWindowSurface failed")
        if not e.eglMakeCurrent(ctypes.c_void_p(self.display), ctypes.c_void_p(self.surface),
                                ctypes.c_void_p(self.surface), ctypes.c_void_p(self.context)):
            raise RuntimeError("eglMakeCurrent failed")

    def flip(self):
        ok = self.egl.eglSwapBuffers(ctypes.c_void_p(self.display),
                                     ctypes.c_void_p(self.surface))
        # a lost surface makes every later swap a silent no-op: the picture
        # sticks while the engine happily runs on, so say so out loud
        if not ok:
            self._swap_fails = getattr(self, "_swap_fails", 0) + 1
            if self._swap_fails in (1, 10, 100, 1000):
                print("eglSwapBuffers FAILED (x%d) eglGetError=0x%x"
                      % (self._swap_fails, self.egl.eglGetError()), flush=True)


# --------------------------------------------------------------------------
# GLES2 wrapper (PyOpenGL-flavored: same names/semantics as the calls we use)
# --------------------------------------------------------------------------
class _GLES2:
    GL_FRAGMENT_SHADER = 0x8B30
    GL_VERTEX_SHADER = 0x8B31
    GL_COMPILE_STATUS = 0x8B81
    GL_LINK_STATUS = 0x8B82
    GL_TEXTURE_2D = 0x0DE1
    GL_TEXTURE0 = 0x84C0
    GL_NEAREST = 0x2600
    GL_LINEAR = 0x2601
    GL_TEXTURE_MIN_FILTER = 0x2801
    GL_TEXTURE_MAG_FILTER = 0x2800
    GL_TEXTURE_WRAP_S = 0x2802
    GL_TEXTURE_WRAP_T = 0x2803
    GL_CLAMP_TO_EDGE = 0x812F
    GL_REPEAT = 0x2901
    GL_UNPACK_ALIGNMENT = 0x0CF5
    GL_PACK_ALIGNMENT = 0x0D05
    GL_RGB = 0x1907
    GL_UNSIGNED_BYTE = 0x1401
    GL_ARRAY_BUFFER = 0x8892
    GL_STATIC_DRAW = 0x88E4
    GL_FLOAT = 0x1406
    GL_TRIANGLES = 0x0004
    GL_SCISSOR_TEST = 0x0C11
    GL_NO_ERROR = 0

    def __init__(self, lib):
        self._g = lib
        self._g.glCreateShader.restype = ctypes.c_uint32
        self._g.glCreateProgram.restype = ctypes.c_uint32
        self._g.glGetUniformLocation.restype = ctypes.c_int32

    @staticmethod
    def _ptr(data):
        # GL only reads these, so borrow the caller's buffer instead of
        # copying it: a copy here is a whole video frame per upload, which
        # on the Pi is megabytes a second of garbage
        if data is None:
            return None
        if isinstance(data, bytes):
            return ctypes.c_char_p(data)
        if isinstance(data, bytearray):
            return (ctypes.c_char * len(data)).from_buffer(data)
        return ctypes.c_char_p(data.tobytes())  # numpy array or similar

    def glCreateShader(self, kind):
        return self._g.glCreateShader(kind)

    def glShaderSource(self, sid, src):
        buf = ctypes.create_string_buffer(src.encode("utf-8"))
        arr = (ctypes.c_char_p * 1)(ctypes.cast(buf, ctypes.c_char_p))
        self._g.glShaderSource(sid, 1, arr, None)

    def glCompileShader(self, sid):
        self._g.glCompileShader(sid)

    def glGetShaderiv(self, sid, pname):
        v = ctypes.c_int32(0)
        self._g.glGetShaderiv(sid, pname, ctypes.byref(v))
        return v.value

    def glGetShaderInfoLog(self, sid):
        buf = ctypes.create_string_buffer(4096)
        ln = ctypes.c_int32(0)
        self._g.glGetShaderInfoLog(sid, 4096, ctypes.byref(ln), buf)
        return buf.raw[:ln.value]

    def glCreateProgram(self):
        return self._g.glCreateProgram()

    def glAttachShader(self, pid, sid):
        self._g.glAttachShader(pid, sid)

    def glBindAttribLocation(self, pid, idx, name):
        self._g.glBindAttribLocation(pid, idx, name.encode())

    def glLinkProgram(self, pid):
        self._g.glLinkProgram(pid)

    def glGetProgramiv(self, pid, pname):
        v = ctypes.c_int32(0)
        self._g.glGetProgramiv(pid, pname, ctypes.byref(v))
        return v.value

    def glGetProgramInfoLog(self, pid):
        buf = ctypes.create_string_buffer(4096)
        ln = ctypes.c_int32(0)
        self._g.glGetProgramInfoLog(pid, 4096, ctypes.byref(ln), buf)
        return buf.raw[:ln.value]

    def glGetUniformLocation(self, pid, name):
        return self._g.glGetUniformLocation(pid, name.encode())

    def glUseProgram(self, pid):
        self._g.glUseProgram(pid)

    def glUniform1f(self, loc, v):
        self._g.glUniform1f(loc, ctypes.c_float(v))

    def glUniform2f(self, loc, x, y):
        self._g.glUniform2f(loc, ctypes.c_float(x), ctypes.c_float(y))

    def glUniform1i(self, loc, v):
        self._g.glUniform1i(loc, v)

    def glUniform4f(self, loc, a, b, c, d):
        self._g.glUniform4f(loc, ctypes.c_float(a), ctypes.c_float(b),
                            ctypes.c_float(c), ctypes.c_float(d))

    def glActiveTexture(self, unit):
        self._g.glActiveTexture(unit)

    def glGenTextures(self, n):
        v = ctypes.c_uint32(0)
        self._g.glGenTextures(1, ctypes.byref(v))
        return v.value

    def glBindTexture(self, target, tex):
        self._g.glBindTexture(target, int(tex))

    def glTexParameteri(self, target, pname, val):
        self._g.glTexParameteri(target, pname, val)

    def glPixelStorei(self, pname, val):
        self._g.glPixelStorei(pname, val)

    def glTexImage2D(self, target, level, internal, w, h, border, fmt, typ, data):
        self._g.glTexImage2D(target, level, internal, w, h, border, fmt, typ,
                             self._ptr(data))

    def glTexSubImage2D(self, target, level, x, y, w, h, fmt, typ, data):
        self._g.glTexSubImage2D(target, level, x, y, w, h, fmt, typ, self._ptr(data))

    def glCopyTexSubImage2D(self, target, level, xo, yo, x, y, w, h):
        self._g.glCopyTexSubImage2D(target, level, xo, yo, x, y, w, h)

    def glGenBuffers(self, n):
        v = ctypes.c_uint32(0)
        self._g.glGenBuffers(1, ctypes.byref(v))
        return v.value

    def glBindBuffer(self, target, buf):
        self._g.glBindBuffer(target, int(buf))

    def glBufferData(self, target, nbytes, data, usage):
        self._g.glBufferData(target, nbytes, self._ptr(data), usage)

    def glEnableVertexAttribArray(self, idx):
        self._g.glEnableVertexAttribArray(idx)

    def glVertexAttribPointer(self, idx, size, typ, normalized, stride, offset):
        self._g.glVertexAttribPointer(idx, size, typ, 1 if normalized else 0,
                                      stride, offset)

    def glDrawArrays(self, mode, first, count):
        self._g.glDrawArrays(mode, first, count)

    def glViewport(self, x, y, w, h):
        self._g.glViewport(x, y, w, h)

    def glEnable(self, cap):
        self._g.glEnable(cap)

    def glDisable(self, cap):
        self._g.glDisable(cap)

    def glScissor(self, x, y, w, h):
        self._g.glScissor(x, y, w, h)

    def glReadPixels(self, x, y, w, h, fmt, typ):
        buf = ctypes.create_string_buffer(w * h * 3)
        self._g.glReadPixels(x, y, w, h, fmt, typ, buf)
        return buf.raw

    def glGetError(self):
        return self._g.glGetError()


class _GLProxy:
    """Engine imports GL before the EGL context exists; delegate lazily."""
    _real = None

    def __getattr__(self, name):
        if _GLProxy._real is None:
            raise RuntimeError("GL not initialized — create PiWindow + init_gl first")
        return getattr(_GLProxy._real, name)


GL = _GLProxy()


def init_gl(window):
    _GLProxy._real = _GLES2(window.glib)
    return GL


# --------------------------------------------------------------------------
# Input: evdev gamepad -> logical events
# --------------------------------------------------------------------------
class PiInput:
    """Maps any attached gamepad to the instrument's logical events.

    BTN_TL/BTN_TR -> prev/next effect; d-pad (hat or digital sticks) ->
    param row select / nudge; SELECT -> ui toggle; START -> source cycle;
    SELECT+START held together -> quit.
    """
    REPEAT_S = 0.13

    def __init__(self):
        import evdev
        self.evdev = evdev
        self.devices = []
        self._scan()
        self.held = {}          # code -> True for buttons
        self.axis = {"x": 0, "y": 0}
        self._absinfo = {}
        self._select_used = False  # Select acted as shift this hold
        self._north_used = False   # X (LFO) acted as shift this hold
        self._next_repeat = 0.0  # typematic: first repeat waits, then ticks
        self._last_scan = time.time()

    def _scan(self):
        self.devices = []
        for path in self.evdev.list_devices():
            try:
                d = self.evdev.InputDevice(path)
                if self.evdev.ecodes.EV_KEY in d.capabilities():
                    self.devices.append(d)
            except OSError:
                pass

    def _digital(self, dev, code, value):
        """Normalize any axis range (0..255, -32k..32k, ...) to -1/0/1."""
        info = self._absinfo.get((dev.path, code))
        if info is None:
            info = dict(dev.capabilities().get(self.evdev.ecodes.EV_ABS, [])).get(code)
            self._absinfo[(dev.path, code)] = info
        if info is None or info.max == info.min:
            return 0
        norm = (value - info.min) / float(info.max - info.min)
        return -1 if norm < 0.25 else (1 if norm > 0.75 else 0)

    def _axis_state(self, dev, code, value):
        ec = self.evdev.ecodes
        if code in (ec.ABS_HAT0X, ec.ABS_X):
            if code == ec.ABS_X:
                value = self._digital(dev, code, value)
            self.axis["x"] = value
            return True
        if code in (ec.ABS_HAT0Y, ec.ABS_Y):
            if code == ec.ABS_Y:
                value = self._digital(dev, code, value)
            self.axis["y"] = value
            return True
        return False

    def poll(self):
        ec = self.evdev.ecodes
        events = []
        dead = []
        if not self.devices and time.time() - self._last_scan > 3.0:
            self._scan()          # controller came back? reattach
            self._last_scan = time.time()
        for d in self.devices:
            try:
                while True:
                    e = d.read_one()
                    if e is None:
                        break
                    if e.type == ec.EV_KEY:
                        self.held[e.code] = bool(e.value)
                        if e.code == ec.BTN_SOUTH:
                            if e.value == 1 and self.held.get(ec.BTN_SELECT):
                                events.append("layer_add")
                                self._select_used = True
                            else:
                                events.append("punch_on" if e.value
                                              else "punch_off")
                        elif e.code == ec.BTN_SELECT:
                            # Select is a shift key: fires "ui" only on a
                            # clean release with no combo used
                            if e.value == 0:
                                if not self._select_used:
                                    events.append("ui")
                                self._select_used = False
                        elif e.code == ec.BTN_NORTH and e.value == 0:
                            # X is also a shift: clean release = LFO toggle
                            if not self._north_used:
                                events.append("lfo")
                            self._north_used = False
                        elif e.value == 1:  # press
                            sel = self.held.get(ec.BTN_SELECT)
                            if e.code == ec.BTN_TL or e.code == ec.BTN_TR:
                                if sel:
                                    events.append("mode_toggle")
                                    self._select_used = True
                                else:
                                    events.append("prev" if e.code == ec.BTN_TL
                                                  else "next")
                            elif e.code == ec.BTN_START:
                                if sel:
                                    self._select_used = True  # quit combo
                                else:
                                    events.append("src")
                            elif e.code == ec.BTN_EAST:
                                if sel:
                                    events.append("layer_clear")
                                    self._select_used = True
                                else:
                                    events.append("randomize")
                            elif e.code == ec.BTN_WEST:
                                events.append("freeze")
                            elif e.code == ec.BTN_NORTH:
                                pass  # LFO fires on release (hold = shift)
                    elif e.type == ec.EV_ABS:
                        old = dict(self.axis)
                        if self._axis_state(d, e.code, e.value):
                            fresh = False
                            north = self.held.get(ec.BTN_NORTH)
                            sel = self.held.get(ec.BTN_SELECT)
                            if self.axis["y"] == -1 and old["y"] != -1:
                                if sel:
                                    events.append("layer_focus_up")
                                    self._select_used = True
                                elif north:
                                    events.append("lfoband_up")
                                    self._north_used = True
                                else:
                                    events.append("up")
                                fresh = True
                            elif self.axis["y"] == 1 and old["y"] != 1:
                                if sel:
                                    events.append("layer_focus_down")
                                    self._select_used = True
                                elif north:
                                    events.append("lfoband_down")
                                    self._north_used = True
                                else:
                                    events.append("down")
                                fresh = True
                            if self.axis["x"] == -1 and old["x"] != -1:
                                events.append("left")
                            elif self.axis["x"] == 1 and old["x"] != 1:
                                events.append("right")
                            if fresh:  # hold-repeat only after a grace period
                                self._next_repeat = time.time() + 0.35
            except OSError:
                dead.append(d)
        if dead:
            self.devices = [d for d in self.devices if d not in dead]
            self._last_scan = time.time()

        # auto-repeat held up/down for continuous value sweeps
        now = time.time()
        if (self.axis["y"] != 0 and now >= self._next_repeat
                and not self.held.get(ec.BTN_NORTH)
                and not self.held.get(ec.BTN_SELECT)):
            events.append("up" if self.axis["y"] == -1 else "down")
            self._next_repeat = now + self.REPEAT_S

        ecodes = self.evdev.ecodes
        if self.held.get(ecodes.BTN_SELECT) and self.held.get(ecodes.BTN_START):
            events.append("quit")
        return events


# --------------------------------------------------------------------------
# PIL text helpers (top-down HxWx3 uint8 arrays)
# --------------------------------------------------------------------------
_FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"


def _font(size):
    from PIL import ImageFont
    try:
        return ImageFont.truetype(_FONT_PATH, size)
    except OSError:
        return ImageFont.load_default()


# Pixel-doubling a tiny font was tried and looked awful: DejaVu is not drawn
# for 5px, and thresholding at that size destroys the glyph shapes rather
# than squaring them off. The hard-edged look survives without it — killing
# the anti-aliasing is what does the work, not making the pixels bigger.
SCALE = 1
HEAD_PX = 14
BODY_PX = 11                # 7px advance: 44 columns, as before the restyle
BG = (26, 112, 196)         # set-top blue, the bright saturated one
FG = (245, 245, 250)        # body copy
ACCENT = (255, 222, 60)     # yellow: the row you are on, and anything live
SEL_BAR = (255, 222, 60)    # the knob in play, as a block
SEL_TEXT = (26, 112, 196)   # knocked back out to the ground colour
HOT = (255, 78, 58)         # the one value you are turning, service-menu red
RAIL = (14, 56, 130)        # the darker gutter down the left edge
RAIL_THUMB = (130, 190, 240)
RAIL_W = 5


def _blit(img, xy, text, font, colour, thresh=90):
    """Draw text as solid blocks rather than anti-aliased grey.

    At this size almost every pixel of a glyph is partial coverage, so
    filling with white lands around mid grey and doubling it gives mush.
    Rendering to a mask and cutting each pixel fully on or fully off is what
    a real bitmap font would have given us, and it is where the hard
    staircase edges come from."""
    from PIL import Image, ImageDraw
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).text(xy, text, fill=255, font=font)
    img.paste(colour, mask=mask.point(lambda v: 255 if v >= thresh else 0))


def _row(img, x0, y, line, font, fg, px, span=None):
    """Draw a row, rendering any [span] as a solid block of colour.

    Two separate things get highlighted and they must not be the same mark:
    the effect you are on is a bar across its whole name, the knob you are
    turning is a block around that value alone. Both in yellow, one wide and
    one narrow, so a glance tells you which is which."""
    from PIL import ImageDraw
    if span is None or "[" not in line or "]" not in line:
        _blit(img, (x0, y), line, font, fg)
        return
    block, text = span
    pre, rest = line.split("[", 1)
    mid, post = rest.split("]", 1)
    x = x0
    if pre:
        _blit(img, (x, y), pre, font, fg)
        x += int(font.getlength(pre))
    if mid:
        wpx = int(font.getlength(mid))
        if block is not None:            # a solid chip behind the value
            ImageDraw.Draw(img).rectangle([x - 2, y - 1, x + wpx, y + px + 1],
                                          fill=block)
        _blit(img, (x, y), mid, font, text)
        x += wpx
    if post:
        _blit(img, (x, y), post, font, fg)


def text_image(lines, w, h, body_px=None, header=True, row_step=15,
               scroll=None):
    """Bottom-up RGB bytes, in the manner of a 2000s set-top menu: black
    ground, white text, green for the header and for anything playing, and
    the row under the cursor as a solid inverse bar.

    The retro edge comes from thresholding every pixel fully on or off, so
    nothing is anti-aliased and the glyphs have hard staircase corners. That
    is the part that reads as old hardware; shrinking the font on top of it
    only made the text unreadable.
    """
    from PIL import Image, ImageDraw
    sw, sh = max(1, w // SCALE), max(1, h // SCALE)
    img = Image.new("RGB", (sw, sh), BG)
    # The menu can afford bigger type than the parameter strip: its rows are
    # short, where the strip has to fit a shader name and five numbers.
    head, body = _font(HEAD_PX), _font(body_px or BODY_PX)
    x0 = 8 // SCALE
    # gutter down the left, carrying a proportional thumb when there is more
    # to see than fits. scroll is (first visible row, total rows).
    ImageDraw.Draw(img).rectangle([0, 0, RAIL_W - 1, sh], fill=RAIL)
    if scroll:
        top, total = scroll
        if total > len(lines) > 0:
            th = max(6, int(sh * len(lines) / float(total)))
            ty = int((sh - th) * top / float(max(1, total - len(lines))))
            ImageDraw.Draw(img).rectangle(
                [0, ty, RAIL_W - 1, ty + th], fill=RAIL_THUMB)
    for i, line in enumerate(lines):
        if i == 0 and header:
            y = 4 // SCALE
            if "[" in line and "]" in line:
                pre, rest = line.split("[", 1)
                mid, post = rest.split("]", 1)
                x = x0
                for seg, col in ((pre, ACCENT),
                                 ("[" + mid + "]", FG),   # the live choice
                                 (post, ACCENT)):         # inverts the pair
                    if seg:
                        _blit(img, (x, y), seg, head, col)
                        x += int(head.getlength(seg))
            else:
                _blit(img, (x0, y), line, head, ACCENT)
            continue
        # keep the old spacing arithmetic and halve it, so the strip height
        # main.py reserves per line still lines up with what gets drawn.
        # Without a header every row is equal, so they start from the top.
        y = ((26 + (i - 1) * row_step) if header
             else (4 + i * row_step)) // SCALE
        px = body_px or BODY_PX
        # red text rather than a chip: on a row that has already gone yellow,
        # a solid block reads as a second cursor and fights the row itself
        span = (None, HOT)
        if line.startswith(">"):
            # the row you are on simply goes yellow. A full-width bar is the
            # wrong mark here — it would compete with the block that shows
            # which single value you are about to change
            _row(img, x0, y, line, body, ACCENT, px, span)
        elif "*" in line[:3]:                    # marked as currently live
            _row(img, x0, y, line, body, ACCENT, px, span)
        else:
            _row(img, x0, y, line, body, FG, px, span)
    img = img.resize((w, h), Image.NEAREST)
    return img.transpose(Image.FLIP_TOP_BOTTOM).tobytes()


def glyph_atlas(chars):
    """Returns (bottom-up RGB bytes, width, height)."""
    from PIL import Image, ImageDraw
    font = _font(28)
    cw, chh = font.getsize("@")
    img = Image.new("RGB", (cw * len(chars), chh), (0, 0, 0))
    dr = ImageDraw.Draw(img)
    for i, c in enumerate(chars):
        dr.text((i * cw, 0), c, fill=(255, 255, 255), font=font)
    return img.transpose(Image.FLIP_TOP_BOTTOM).tobytes(), cw * len(chars), chh


def save_png(raw_topdown, w, h, path):
    from PIL import Image
    Image.frombytes("RGB", (w, h), raw_topdown).save(path)
