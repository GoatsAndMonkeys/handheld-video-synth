"""GL access shim: desktop gets PyOpenGL, the Pi gets the ctypes GLES2 backend.

Engine code does `from glshim import GL` and calls GL.gl* names identically
on both platforms.
"""
import platform


def _is_pi():
    return platform.machine() in ("armv6l", "armv7l", "aarch64")


IS_PI = _is_pi()

if IS_PI:
    from pi_backend import GL, GLES_PREAMBLE as PREAMBLE
else:
    from OpenGL import GL
    PREAMBLE = "#version 120\n"
