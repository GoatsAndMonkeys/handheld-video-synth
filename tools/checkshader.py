#!/usr/bin/env python3
"""Compile shaders through the engine's own GLES2 path.

The only authority on whether a shader runs on VideoCore IV is VideoCore IV.
Desktop GL accepts things the Pi's compiler rejects, so this brings up the
real dispmanx context and feeds the file through the same compile_shader the
engine uses, preamble and all. Prints the driver's own error text on failure.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.chdir(ROOT)

from glshim import GL, PREAMBLE          # noqa: E402
import main as M                         # noqa: E402  (guarded by __main__)

plat = M.PiPlatform()
print("context up: %dx%d" % (plat.width, plat.height))

bad = 0
for path in sys.argv[1:]:
    try:
        with open(path) as f:
            body = f.read()
        M.compile_shader(PREAMBLE + body, GL.GL_FRAGMENT_SHADER)
        print("OK      %s" % path)
    except Exception as exc:
        bad += 1
        print("FAIL    %s" % path)
        print("        %s" % str(exc).strip().replace("\n", "\n        ")[:900])

print("%d checked, %d failed" % (len(sys.argv) - 1, bad))
sys.exit(1 if bad else 0)
