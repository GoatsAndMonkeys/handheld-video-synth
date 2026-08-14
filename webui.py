#!/usr/bin/env python3
"""HVS-80 web console — the handheld's front door on the LAN.

Launched by the *Web Server* cart (pi/roms/Web Server.vsb). Serves what the
instrument made and takes in what it needs:

    recordings   watch and download every rec_*.mp4, whichever pack made it
    videos       upload clips straight into a pack's collection
    packs        upload a pack .zip — validated by tools/checkpack.py before
                 it is allowed anywhere near packs/
    decks        export decks.json per pack, and import one back

Standard library only: the Pi runs 3.7 and installing anything on a device
that may be mid-gig is not a trade worth making. No auth — this is a LAN
tool, and anyone who can reach the port can write files into packs/. Keep it
off open networks.
"""
import html
import io
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import zipfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn

ROOT = os.path.dirname(os.path.abspath(__file__))
PACKS = os.path.join(ROOT, "packs")
PORT = int(os.environ.get("HVS_WEB_PORT", "8080"))
VIDEO_EXT = (".mp4", ".mov", ".mkv", ".webm", ".avi")
SAFE = re.compile(r"[^A-Za-z0-9._ -]")


def safe_name(name):
    """Basename only, no traversal, no surprises in a shell later."""
    return SAFE.sub("_", os.path.basename(name or "")).strip() or "untitled"


def inside(path, parent):
    path = os.path.realpath(path)
    return path == parent or path.startswith(parent + os.sep)


def packs():
    if not os.path.isdir(PACKS):
        return []
    return sorted(d for d in os.listdir(PACKS)
                  if os.path.isdir(os.path.join(PACKS, d)))


def recordings():
    """Every rec_*.mp4, newest-looking last. Ordered by pack then number —
    the Pi has no clock battery, so file times are not to be trusted."""
    out = []
    for p in packs():
        cdir = os.path.join(PACKS, p, "clips")
        if not os.path.isdir(cdir):
            continue
        for f in sorted(os.listdir(cdir)):
            if f.startswith("rec_") and f.lower().endswith(".mp4"):
                full = os.path.join(cdir, f)
                out.append((p, f, os.path.getsize(full)))
    return out


def collections(pack):
    cdir = os.path.join(PACKS, pack, "clips")
    if not os.path.isdir(cdir):
        return []
    return sorted(d for d in os.listdir(cdir)
                  if os.path.isdir(os.path.join(cdir, d)))


# ---------------------------------------------------------------- multipart

def parse_multipart(rfile, length, boundary, workdir):
    """Minimal multipart/form-data reader.

    cgi.FieldStorage is gone in 3.13 and this has to run on 3.7 as well, so
    parse it here. The body is streamed to disk a line at a time rather than
    held in memory: a phone uploading a 200 MB video would otherwise be a
    MemoryError on a 512 MB Pi.
    """
    delim = b"--" + boundary
    fields, files = {}, {}
    remaining = length
    part = None

    def readline():
        nonlocal remaining
        if remaining <= 0:
            return b""
        line = rfile.readline(min(65536, remaining + 2))
        remaining -= len(line)
        return line

    line = readline()
    while line:
        if not line.startswith(delim):
            line = readline()
            continue
        if line.rstrip(b"\r\n").endswith(b"--"):
            break
        # headers of this part
        name = filename = None
        while True:
            h = readline()
            if h in (b"\r\n", b"\n", b""):
                break
            if h.lower().startswith(b"content-disposition"):
                text = h.decode("utf-8", "replace")
                m = re.search(r'name="([^"]*)"', text)
                name = m.group(1) if m else None
                m = re.search(r'filename="([^"]*)"', text)
                filename = m.group(1) if m else None
        if filename:
            path = os.path.join(workdir, safe_name(filename))
            part = open(path, "wb")
            files[name] = (filename, path)
        else:
            part = io.BytesIO()
        # body: hold back the trailing CRLF, it belongs to the delimiter
        held = b""
        while True:
            line = readline()
            if not line or line.startswith(delim):
                break
            part.write(held)
            if line.endswith(b"\r\n"):
                part.write(line[:-2])
                held = b"\r\n"
            elif line.endswith(b"\n"):
                part.write(line[:-1])
                held = b"\n"
            else:
                part.write(line)
                held = b""
        if filename:
            part.close()
        else:
            fields[name] = part.getvalue().decode("utf-8", "replace")
    return fields, files


# --------------------------------------------------------------------- page

CSS = """
:root{--bg:#0d0d10;--fg:#e8e8ea;--dim:#8a8a95;--line:#26262e;--hot:#ffd23f}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
 font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
header{padding:18px 20px;border-bottom:1px solid var(--line)}
h1{margin:0;font-size:19px;letter-spacing:.14em;color:var(--hot)}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.12em;color:var(--dim);
 margin:0 0 12px;font-weight:600}
main{padding:20px;max-width:900px;margin:0 auto}
section{border:1px solid var(--line);border-radius:10px;padding:16px;margin:0 0 18px}
video{width:100%;max-width:420px;border-radius:8px;background:#000;display:block}
.row{display:flex;flex-wrap:wrap;gap:16px}
.card{flex:1 1 260px;min-width:240px}
.meta{color:var(--dim);font-size:13px;margin:6px 0}
a{color:var(--hot)}
input,select,button{font:inherit;background:#17171d;color:var(--fg);
 border:1px solid var(--line);border-radius:7px;padding:8px 10px}
button{background:var(--hot);color:#111;border:0;font-weight:600;cursor:pointer}
label{display:block;margin:10px 0 4px;color:var(--dim);font-size:13px}
.note{color:var(--dim);font-size:13px}
.ok{color:#7ee081}.bad{color:#ff6b6b}
pre{white-space:pre-wrap;background:#131319;padding:10px;border-radius:7px;
 font-size:12px;color:var(--dim);overflow-x:auto}
"""


def page(msg=""):
    packlist = packs()
    opts = "".join('<option value="%s">%s</option>' % (html.escape(p),
                                                       html.escape(p))
                   for p in packlist)
    recs = recordings()
    if recs:
        cards = "".join(
            '<div class="card"><video controls preload="metadata" src="%s">'
            '</video><div class="meta">%s &middot; %s &middot; %.1f MB</div>'
            '<a href="%s" download>download</a></div>'
            % ("/media/%s/clips/%s" % (p, f), html.escape(f), html.escape(p),
               n / 1e6, "/media/%s/clips/%s" % (p, f))
            for p, f, n in recs)
    else:
        cards = ('<p class="note">No recordings yet. Hit record on the '
                 'handheld and they turn up here.</p>')
    decks = "".join(
        '<li><a href="/decks/%s">%s</a></li>' % (html.escape(p), html.escape(p))
        for p in packlist
        if os.path.exists(os.path.join(PACKS, p, "playlists", "decks.json")))
    return """<!doctype html><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>HVS-80</title><style>%s</style>
<header><h1>HVS-80</h1></header><main>%s
<section><h2>Recordings</h2><div class="row">%s</div></section>
<section><h2>Upload a video</h2>
<form method=post action="/upload/video" enctype="multipart/form-data">
<label>pack</label><select name=pack>%s</select>
<label>collection (new or existing)</label>
<input name=collection value="uploads" required>
<label>file</label><input type=file name=file accept="video/*" required>
<p><button>Upload video</button></p></form>
<p class="note">Lands in the pack's clips, so it shows up as a source on the
handheld straight away.</p></section>
<section><h2>Install a pack</h2>
<form method=post action="/upload/pack" enctype="multipart/form-data">
<label>pack .zip</label><input type=file name=file accept=".zip" required>
<p><button>Validate &amp; install</button></p></form>
<p class="note">Checked with tools/checkpack.py first; anything with errors
is refused and nothing is written.</p></section>
<section><h2>Decks</h2>
<p class="note">Export a pack's saved decks, or push a decks.json back. The
current file is backed up as decks.bak.json before anything is replaced.</p>
<ul>%s</ul>
<form method=post action="/upload/decks" enctype="multipart/form-data">
<label>pack</label><select name=pack>%s</select>
<label>decks.json</label><input type=file name=file accept=".json" required>
<p><button>Import decks</button></p></form></section>
</main>""" % (CSS, msg, cards, opts, decks or
              "<li class=note>No saved decks yet.</li>", opts)


def banner(msg, good=True):
    return '<section class="%s">%s</section>' % ("ok" if good else "bad",
                                                 html.escape(msg))


# ------------------------------------------------------------------ handler

class Handler(BaseHTTPRequestHandler):
    server_version = "HVS-80"

    def log_message(self, fmt, *args):       # one tidy line, not two
        sys.stdout.write("web: %s %s\n" % (self.address_string(), fmt % args))

    def _send(self, body, code=200, ctype="text/html; charset=utf-8"):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---- GET
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/":
            return self._send(page())
        if path.startswith("/media/"):
            return self._file(os.path.join(PACKS, path[len("/media/"):]))
        if path.startswith("/decks/"):
            pack = safe_name(path[len("/decks/"):])
            return self._file(os.path.join(PACKS, pack, "playlists",
                                           "decks.json"),
                              download="%s-decks.json" % pack)
        self._send("not found", 404, "text/plain")

    def _file(self, path, download=None):
        real = os.path.realpath(path)
        if not inside(real, os.path.realpath(PACKS)) or not os.path.isfile(real):
            return self._send("not found", 404, "text/plain")
        size = os.path.getsize(real)
        ctype = ("video/mp4" if real.lower().endswith(".mp4")
                 else "application/json" if real.endswith(".json")
                 else "application/octet-stream")
        # Range matters: without it Safari and iOS will not scrub a video
        rng = self.headers.get("Range")
        start, end = 0, size - 1
        code = 200
        if rng and rng.startswith("bytes="):
            m = re.match(r"bytes=(\d*)-(\d*)", rng)
            if m:
                if m.group(1):
                    start = int(m.group(1))
                if m.group(2):
                    end = min(int(m.group(2)), size - 1)
                code = 206
        length = max(0, end - start + 1)
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if code == 206:
            self.send_header("Content-Range",
                             "bytes %d-%d/%d" % (start, end, size))
        if download:
            self.send_header("Content-Disposition",
                             'attachment; filename="%s"' % download)
        self.end_headers()
        with open(real, "rb") as f:
            f.seek(start)
            left = length
            while left > 0:
                chunk = f.read(min(262144, left))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return        # player seeked away; not an error
                left -= len(chunk)

    # ---- POST
    def do_POST(self):
        ctype = self.headers.get("Content-Type", "")
        if "boundary=" not in ctype:
            return self._send(page(banner("Malformed upload.", False)), 400)
        boundary = ctype.split("boundary=")[1].strip('"').encode()
        length = int(self.headers.get("Content-Length") or 0)
        work = tempfile.mkdtemp(prefix="hvsweb_")
        try:
            fields, files = parse_multipart(self.rfile, length, boundary, work)
            route = self.path.split("?")[0]
            if route == "/upload/video":
                msg, ok = self._take_video(fields, files)
            elif route == "/upload/pack":
                msg, ok = self._take_pack(files)
            elif route == "/upload/decks":
                msg, ok = self._take_decks(fields, files)
            else:
                msg, ok = "Unknown upload.", False
            self._send(page(banner(msg, ok)))
        except Exception as exc:                     # never take the server
            self._send(page(banner("Upload failed: %s" % exc, False)), 500)
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def _take_video(self, fields, files):
        if "file" not in files:
            return "No file received.", False
        orig, tmp = files["file"]
        if not orig.lower().endswith(VIDEO_EXT):
            return "Not a video file (%s)." % orig, False
        pack = safe_name(fields.get("pack", ""))
        coll = safe_name(fields.get("collection", "uploads"))
        dest_dir = os.path.join(PACKS, pack, "clips", coll)
        if not inside(dest_dir, os.path.realpath(PACKS)) or pack not in packs():
            return "Unknown pack.", False
        os.makedirs(dest_dir, exist_ok=True)
        dest = os.path.join(dest_dir, safe_name(orig))
        shutil.move(tmp, dest)
        return "Added %s to %s/%s (%.1f MB)." % (
            os.path.basename(dest), pack, coll,
            os.path.getsize(dest) / 1e6), True

    def _take_pack(self, files):
        if "file" not in files:
            return "No file received.", False
        orig, tmp = files["file"]
        if not zipfile.is_zipfile(tmp):
            return "%s is not a zip." % orig, False
        stage = tempfile.mkdtemp(prefix="hvspack_")
        try:
            with zipfile.ZipFile(tmp) as z:
                for member in z.namelist():        # no zip-slip
                    if member.startswith("/") or ".." in member.split("/"):
                        return "Refused: unsafe path in zip (%s)." % member, False
                z.extractall(stage)
            root = stage
            if not os.path.isfile(os.path.join(root, "pack.json")):
                subs = [d for d in os.listdir(stage)
                        if os.path.isfile(os.path.join(stage, d, "pack.json"))]
                if len(subs) != 1:
                    return "Zip must hold exactly one pack folder.", False
                root = os.path.join(stage, subs[0])
            with open(os.path.join(root, "pack.json")) as f:
                name = safe_name(json.load(f).get("name") or "")
            chk = subprocess.run(
                [sys.executable, os.path.join(ROOT, "tools", "checkpack.py"),
                 root], capture_output=True, text=True)
            out = (chk.stdout + chk.stderr).strip()
            if chk.returncode != 0 or "0 errors" not in out:
                return "Rejected by checkpack:\n%s" % out, False
            dest = os.path.join(PACKS, name)
            if os.path.exists(dest):
                shutil.rmtree(dest)
            shutil.copytree(root, dest)
            n = len([f for f in os.listdir(os.path.join(dest, "shaders"))
                     if f.endswith(".frag") and not f.startswith("_")])
            return ("Installed pack '%s' (%d effects). Restart the synth "
                    "to load it." % (name, n)), True
        finally:
            shutil.rmtree(stage, ignore_errors=True)

    def _take_decks(self, fields, files):
        if "file" not in files:
            return "No file received.", False
        orig, tmp = files["file"]
        pack = safe_name(fields.get("pack", ""))
        if pack not in packs():
            return "Unknown pack.", False
        try:
            with open(tmp) as f:
                data = json.load(f)
        except Exception as exc:
            return "Not valid JSON: %s" % exc, False
        if not isinstance(data, dict) or not isinstance(data.get("decks"), list):
            return 'Not a decks file (expects {"decks": [...]}).', False
        pdir = os.path.join(PACKS, pack, "playlists")
        os.makedirs(pdir, exist_ok=True)
        dest = os.path.join(pdir, "decks.json")
        if os.path.exists(dest):                 # never overwrite a set blind
            shutil.copy2(dest, os.path.join(pdir, "decks.bak.json"))
        shutil.move(tmp, dest)
        return "Imported %d decks into %s (previous file kept as " \
               "decks.bak.json)." % (len(data["decks"]), pack), True


class Server(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))               # no packet leaves; just asks
        return s.getsockname()[0]                # the kernel which route wins
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    url = "http://%s:%d" % (lan_ip(), PORT)
    bar = "=" * (len(url) + 8)
    print("\n%s\n    %s\n%s\n" % (bar, url, bar))
    print("HVS-80 web console. Recordings, uploads, decks.")
    print("Quit with the GPi's Start+Select, or Ctrl-C over ssh.\n")
    sys.stdout.flush()
    Server(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
