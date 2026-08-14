#!/usr/bin/env python3
"""Check an effect pack against what the HVS-80 engine actually asks of it.

A pack is only a folder — pack.json, shaders/*.frag with .json sidecars,
playlists/*.json — and the engine loads it forgivingly: a shader that fails to
compile prints one line to a stdout nobody is watching and is skipped, a set
naming a missing effect just goes quiet, a sidecar with a fifth param silently
loses it. On the deck that is right; while you are writing a pack it means the
device tells you almost nothing. So this reads the rules the engine reads
(main.py's load_playlist / _ensure_program / set_common, GLES_PREAMBLE) and
says what would break — on any machine, with no hardware in front of you.

    python3 tools/checkpack.py packs/mypack
    python3 tools/checkpack.py                  # every pack under packs/
    python3 tools/checkpack.py packs/mypack -v  # plus informational notes

ERROR means the deck will not play it as written, WARN means it plays but
something is off; exit status is 0 when there are no errors. GLSL is only
machine-checked when glslangValidator is on PATH, and even then the deck has
the last word: VideoCore IV is stricter about loops than any desktop compiler,
and only it knows whether the thing still hits 30fps.
"""
import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# every uniform the engine binds: set_common() plus the chain's textures plus
# the two legacy recurBOY names. u_rect is the overlay's, which a pack may
# ship its own copy of.
KNOWN_UNIFORMS = set(
    ["u_time", "ftime", "u_resolution", "fparams", "u_a0", "u_a1", "u_a2",
     "u_atlas", "u_dither", "u_rect"]
    + ["u_x%d" % i for i in range(4)] + ["u_tex%d" % i for i in range(4)])

# glshim prepends PREAMBLE: "#version 120" on desktop, GLES_PREAMBLE
# ("precision mediump float;") on the deck. A shader carrying either itself
# compiles on one platform and fails on the other.
PREAMBLE, PREAMBLE_LINES = "#version 100\nprecision mediump float;\n", 2

MAX_LOOP = 32       # VideoCore IV unrolls loops; long ones blow the shader out
MAX_FETCH = 16      # per-pixel texture budget at 320x240 on a Zero 2W
MAX_PARAMS = 4      # the UI has four knob slots and no fifth row

UNIFORM_RE = re.compile(
    r"^[ \t]*uniform\s+(?:lowp|mediump|highp)?\s*\w+\s+([A-Za-z_]\w*)", re.M)
FRAGCOLOR_RE = re.compile(r"gl_FragColor\s*(?:\.[xyzwrgba]+)?\s*[-+*/]?=[^=]")
NUMBER_RE = re.compile(r"^[-+]?(?:\d+\.?\d*|\.\d+)$")


def strip_comments(src):
    """Prose about u_time is not a declaration and a commented-out loop is
    not a loop: every text check runs on the stripped source."""
    return re.sub(r"//[^\n]*", "", re.sub(r"/\*.*?\*/", " ", src, flags=re.S))


def loop_conditions(src):
    """The condition clause of every for-loop head, paren-balanced so a bound
    like `i < int(u_x0 * 8.0)` survives the scan."""
    out = []
    for m in re.finditer(r"\bfor\s*\(", src):
        depth, i = 1, m.end()
        while i < len(src) and depth:
            depth += (src[i] == "(") - (src[i] == ")")
            i += 1
        parts = src[m.end():i - 1].split(";")
        out.append(parts[1].strip() if len(parts) >= 2 else parts[0].strip())
    return out


def unguarded_precision(src):
    """A precision line inside an `#ifdef GL_ES` is not a mistake — that is
    exactly how the recurBOY shaders stay portable, since the deck defines
    GL_ES and the desktop's GLSL 120 does not accept the statement at all.
    Only an unguarded one breaks a build."""
    depth, guard = 0, None
    for line in src.splitlines():
        s = line.strip()
        if re.match(r"#\s*if", s):
            depth += 1
            if guard is None and "GL_ES" in s and "ifndef" not in s:
                guard = depth
        elif re.match(r"#\s*endif\b", s):
            guard = None if guard == depth else guard
            depth = max(0, depth - 1)
        elif guard is None and re.match(r"precision\s", s):
            return True
    return False


def glsl_errors(path, glslang):
    """Compile a copy carrying the preamble the engine would have added, then
    move the line numbers back onto the author's own file."""
    with open(path) as f:
        src = f.read()
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".frag", delete=False)
    tmp.write(PREAMBLE + src)
    tmp.close()
    try:
        p = subprocess.run([glslang, "-S", "frag", tmp.name],
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           universal_newlines=True)
    finally:
        os.remove(tmp.name)
    if p.returncode == 0:
        return []

    def shift(m):
        return "line %d:" % (int(m.group(1)) - PREAMBLE_LINES)

    msgs = [re.sub(r"^ERROR: \d+:(\d+):", shift, ln.strip())
            for ln in p.stdout.splitlines()
            if ln.strip().startswith("ERROR:") and "compilation error" not in ln]
    return msgs[:6] or ["glslangValidator rejected it (no message parsed)"]


def check_shader(path, add, rel, glslang):
    with open(path) as f:
        src = strip_comments(f.read())
    if "#version" in src:
        add("ERROR", rel, "carries its own #version — glshim prepends one")
    if unguarded_precision(src):
        add("ERROR", rel, "unguarded precision line — the deck's preamble "
                          "supplies it and GLSL 120 rejects it; wrap it in "
                          "#ifdef GL_ES or drop it")
    if not FRAGCOLOR_RE.search(src):
        add("ERROR", rel, "never assigns gl_FragColor — nothing is drawn")
    for name in sorted(set(UNIFORM_RE.findall(src))):
        if name not in KNOWN_UNIFORMS:
            add("WARN", rel, "declares %s — the engine binds nothing to it"
                             % name)
    for cond in loop_conditions(src):
        m = re.search(r"[<>]=?\s*(.+)$", cond)
        bound = (m.group(1).strip() if m else "") or cond
        if not NUMBER_RE.match(bound):
            add("WARN", rel, "loop bound %r is not a constant — VideoCore "
                             "cannot compile it" % bound)
        elif float(bound) > MAX_LOOP:
            add("WARN", rel, "loop runs to %s (over %d) — it unrolls into a "
                             "shader the Pi may refuse" % (bound, MAX_LOOP))
    fetches = src.count("texture2D(")
    if fetches > MAX_FETCH:
        add("WARN", rel, "%d texture2D calls per pixel (budget %d)"
                         % (fetches, MAX_FETCH))
    if "u_time" not in src and "ftime" not in src:
        add("NOTE", rel, "clockless (no u_time/ftime): no speed knob")
    for msg in (glsl_errors(path, glslang) if glslang else []):
        add("ERROR", rel, msg)


def check_sidecar(path, add, rel):
    try:
        with open(path) as f:
            meta = json.load(f)
    except Exception as exc:
        return add("ERROR", rel, "not valid JSON: %s" % exc)
    if not isinstance(meta, dict):
        return add("ERROR", rel, "must be a JSON object")
    if not meta.get("desc"):
        add("ERROR", rel, "no \"desc\" — the menu would show the filename")
    params = meta.get("params")
    if not isinstance(params, list):
        return add("ERROR", rel, "no \"params\" list")
    if len(params) > MAX_PARAMS:
        add("ERROR", rel, "%d params — the UI shows at most %d"
                          % (len(params), MAX_PARAMS))
    for i, p in enumerate(params):
        if not isinstance(p, dict) or "name" not in p or "help" not in p:
            add("ERROR", rel, "param %d needs both \"name\" and \"help\"" % i)


def check_playlist(path, add, rel, pdir, others):
    try:
        with open(path) as f:
            pl = json.load(f)
    except Exception as exc:
        return add("ERROR", rel, "not valid JSON: %s" % exc)
    steps = pl.get("steps") if isinstance(pl, dict) else None
    if not isinstance(steps, list) or not steps:
        return add("ERROR", rel, "no non-empty \"steps\": the set cannot load")
    for i, step in enumerate(steps):
        if not isinstance(step, dict) or not step.get("shader"):
            add("ERROR", rel, "step %d has no \"shader\"" % i)
            continue
        name = step["shader"]
        if not os.path.exists(os.path.join(pdir, "shaders", name + ".frag")):
            # _ensure_program searches this pack first, then every pack, so a
            # borrowed effect is legal — demo's reactive set is built that way
            found = [d for d in others
                     if os.path.exists(os.path.join(d, name + ".frag"))]
            if found:
                add("WARN", rel, "step %d borrows %s from %s — it travels only "
                    "with that pack installed"
                    % (i, name, os.path.basename(os.path.dirname(found[0]))))
            else:
                add("ERROR", rel, "step %d names %s, which is in no pack"
                                  % (i, name))
        x = step.get("x")
        bad = not isinstance(x, list) or not 1 <= len(x) <= 4 or any(
            isinstance(v, bool) or not isinstance(v, (int, float))
            or not 0.0 <= v <= 1.0 for v in x)
        if x is not None and bad:
            add("ERROR", rel, "step %d \"x\" must be 1-4 numbers in 0..1, got "
                              "%r" % (i, x))


def check_pack(pdir, glslang):
    """Every finding for one pack, as (level, where, message)."""
    out = []
    pack = os.path.basename(os.path.normpath(pdir)) or pdir

    def add(level, rel, msg):
        out.append((level, "%s/%s" % (pack, rel) if rel else pack, msg))

    frags = sorted(glob.glob(os.path.join(pdir, "shaders", "*.frag")))
    playable = [f for f in frags if not os.path.basename(f).startswith("_")]
    if not playable:
        add("ERROR", "", "no shaders/*.frag to play (a leading _ means "
                         "engine furniture, not an effect)")
    pj = os.path.join(pdir, "pack.json")
    if not os.path.exists(pj):
        add("WARN", "pack.json", "missing — the pack has no name of its own")
    else:
        try:
            with open(pj) as f:
                meta = json.load(f)
            if not isinstance(meta, dict) or not meta.get("name"):
                add("WARN", "pack.json", "no \"name\"")
        except Exception as exc:
            add("ERROR", "pack.json", "not valid JSON: %s" % exc)

    for f in frags:
        rel = "shaders/" + os.path.basename(f)
        check_shader(f, add, rel, glslang)
        if f not in playable:
            continue
        side = f[:-5] + ".json"
        if os.path.exists(side):
            check_sidecar(side, add, "shaders/" + os.path.basename(side))
        else:
            add("WARN", rel, "no .json sidecar — knobs fall back to x0..x3")

    others = sorted(glob.glob(os.path.join(
        os.path.dirname(os.path.abspath(pdir)), "*", "shaders")))
    pls = sorted(glob.glob(os.path.join(pdir, "playlists", "*.json")))
    if not pls:
        add("WARN", "playlists", "no sets — browsable only as \"* everything\"")
    for p in pls:
        base = os.path.basename(p)
        if os.path.splitext(base)[0] not in ("deck", "decks"):  # saved scenes
            check_playlist(p, add, "playlists/" + base, pdir, others)

    for infra in ("_source_plasma.frag", "_overlay.frag"):
        if not os.path.exists(os.path.join(pdir, "shaders", infra)):
            add("NOTE", "shaders/" + infra,
                "absent — the engine uses the demo pack's copy")
    return out


def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("packs", nargs="*", metavar="PACK",
                    help="pack folders; default is every pack under packs/")
    ap.add_argument("-v", "--verbose", action="store_true",
                    help="also print informational notes")
    a = ap.parse_args()

    dirs = a.packs or sorted(d for d in glob.glob(
        os.path.join(ROOT, "packs", "*")) if os.path.isdir(d))
    if not dirs:
        sys.exit("no packs to check")
    glslang = shutil.which("glslangValidator")
    if not glslang:
        print("glslangValidator not on PATH: GLSL syntax was not "
              "machine-checked here — checkshader.py on the deck, which "
              "compiles through the real driver, is the final authority\n")

    errors = warnings = 0
    for d in dirs:
        if not os.path.isdir(d):
            print("ERROR %s: no such folder" % d)
            errors += 1
            continue
        for level, where, msg in check_pack(d, glslang):
            if level == "ERROR":
                errors += 1
            elif level == "WARN":
                warnings += 1
            elif not a.verbose:
                continue
            print("%s %s: %s" % (level, where, msg))

    print("\n%d packs, %d errors, %d warnings" % (len(dirs), errors, warnings))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
