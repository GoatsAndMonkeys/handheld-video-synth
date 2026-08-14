#!/usr/bin/env python3
"""Smoke-test the web console against a scratch copy of the repo.

    python3 tools/webui_smoke.py

Starts webui.py on a spare port with PACKS pointed at a throwaway tree, then
drives every route: page, media with Range, pack export, pack install,
video upload, deck import/export, delete, and the refusals (traversal,
zip-slip, wrong file type). Nothing touches the real packs/ directory.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("SMOKE_PORT", "8123"))
BASE = "http://127.0.0.1:%d" % PORT
fails = []


def check(name, cond, detail=""):
    print("%-42s %s%s" % (name, "ok" if cond else "FAIL",
                          "" if cond else "  <- " + str(detail)))
    if not cond:
        fails.append(name)


def get(path, headers=None):
    req = urllib.request.Request(BASE + path, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)


def post(path, fields, files):
    """multipart/form-data by hand: no requests on the Pi, none here."""
    b = uuid.uuid4().hex
    body = b""
    for k, v in fields.items():
        body += (b"--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n"
                 % (b.encode(), k.encode())) + v.encode() + b"\r\n"
    for k, (fn, data) in files.items():
        body += (b"--%s\r\nContent-Disposition: form-data; name=\"%s\"; "
                 b"filename=\"%s\"\r\nContent-Type: application/octet-stream"
                 b"\r\n\r\n" % (b.encode(), k.encode(), fn.encode()))
        body += data + b"\r\n"
    body += b"--%s--\r\n" % b.encode()
    req = urllib.request.Request(
        BASE + path, data=body,
        headers={"Content-Type": "multipart/form-data; boundary=%s" % b})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, r.read().decode("utf-8", "replace")


def main():
    work = tempfile.mkdtemp(prefix="hvssmoke_")
    packs = os.path.join(work, "packs")
    shutil.copytree(os.path.join(ROOT, "packs", "hvs80-pixel"),
                    os.path.join(packs, "hvs80-pixel"))
    os.makedirs(os.path.join(packs, "hvs80-pixel", "clips"), exist_ok=True)
    rec = os.path.join(packs, "hvs80-pixel", "clips", "rec_09.mp4")
    with open(rec, "wb") as f:
        f.write(b"\x00" * 4096)          # stand-in: routes never decode it
    shutil.copy2(os.path.join(ROOT, "webui.py"), work)
    shutil.copytree(os.path.join(ROOT, "tools"), os.path.join(work, "tools"))

    env = dict(os.environ, HVS_WEB_PORT=str(PORT))
    srv = subprocess.Popen([sys.executable, "-u", "webui.py"], cwd=work,
                           env=env, stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT)
    try:
        for _ in range(50):                       # wait for the bind
            time.sleep(0.2)
            try:
                if get("/")[0] == 200:
                    break
            except Exception:
                pass

        code, body, _ = get("/")
        check("GET / renders", code == 200 and b"HVS-80" in body, code)
        check("page lists the recording", b"rec_09.mp4" in body)
        check("page shows free space", b"GB free of" in body)
        check("page lists packs with counts",
              b"effects" in body and b"hvs80-pixel" in body)

        code, body, hdrs = get("/media/hvs80-pixel/clips/rec_09.mp4",
                               {"Range": "bytes=0-99"})
        check("Range request returns 206", code == 206, code)
        check("Range returns exactly 100 bytes", len(body) == 100, len(body))
        check("Content-Range header present",
              "bytes 0-99/4096" in hdrs.get("Content-Range", ""),
              hdrs.get("Content-Range"))

        code, _, _ = get("/media/../../../etc/passwd")
        check("path traversal refused", code == 404, code)

        code, body, hdrs = get("/export/hvs80-pixel")
        zpath = os.path.join(work, "exported.zip")
        open(zpath, "wb").write(body)
        ok = zipfile.is_zipfile(zpath)
        names = zipfile.ZipFile(zpath).namelist() if ok else []
        check("pack export is a zip", code == 200 and ok, code)
        check("export carries shaders",
              any(n.endswith(".frag") for n in names), len(names))
        check("export excludes clips",
              not any("/clips/" in n for n in names))

        # install that same zip back under a new name
        stage = os.path.join(work, "stage")
        os.makedirs(stage)
        with zipfile.ZipFile(zpath) as z:
            z.extractall(stage)
        src = os.path.join(stage, "hvs80-pixel")
        dst = os.path.join(stage, "smoketest")
        os.rename(src, dst)
        pj = os.path.join(dst, "pack.json")
        meta = json.load(open(pj))
        meta["name"] = "smoketest"
        json.dump(meta, open(pj, "w"))
        newzip = os.path.join(work, "smoketest.zip")
        with zipfile.ZipFile(newzip, "w", zipfile.ZIP_DEFLATED) as z:
            for root, _, ns in os.walk(dst):
                for n in ns:
                    full = os.path.join(root, n)
                    z.write(full, os.path.join(
                        "smoketest", os.path.relpath(full, dst)))
        _, txt = post("/upload/pack", {},
                      {"file": ("smoketest.zip", open(newzip, "rb").read())})
        check("pack install accepted", "Installed pack" in txt,
              txt[txt.find("<section"):][:120])
        check("installed pack on disk",
              os.path.isdir(os.path.join(packs, "smoketest")))

        # zip-slip must be refused
        eviljson = json.dumps({"name": "evil"}).encode()
        evil = os.path.join(work, "evil.zip")
        with zipfile.ZipFile(evil, "w") as z:
            z.writestr("evil/pack.json", eviljson)
            z.writestr("../escaped.txt", b"nope")
        _, txt = post("/upload/pack", {},
                      {"file": ("evil.zip", open(evil, "rb").read())})
        check("zip-slip refused", "unsafe path" in txt)
        check("nothing escaped the tree",
              not os.path.exists(os.path.join(work, "escaped.txt")))

        _, txt = post("/upload/video",
                      {"pack": "hvs80-pixel", "collection": "uploads"},
                      {"file": ("clip.mp4", b"\x00" * 2048)})
        check("video upload accepted", "Added clip.mp4" in txt)
        check("video landed in collection",
              os.path.isfile(os.path.join(packs, "hvs80-pixel", "clips",
                                          "uploads", "clip.mp4")))

        _, txt = post("/upload/video", {"pack": "hvs80-pixel"},
                      {"file": ("notes.txt", b"hello")})
        check("non-video refused", "Not a video file" in txt)

        decks = json.dumps({"active": 0,
                            "decks": [{"name": "SMOKE", "scenes": []}]})
        _, txt = post("/upload/decks", {"pack": "hvs80-pixel"},
                      {"file": ("decks.json", decks.encode())})
        check("deck import accepted", "Imported 1 decks" in txt)
        code, body, _ = get("/decks/hvs80-pixel")
        check("deck export round-trips",
              code == 200 and b"SMOKE" in body, code)

        _, txt = post("/upload/decks", {"pack": "hvs80-pixel"},
                      {"file": ("decks.json", b"{not json")})
        check("bad deck json refused", "Not valid JSON" in txt)
        code, body, _ = get("/decks/hvs80-pixel")
        check("bad import left decks intact", b"SMOKE" in body)

        _, txt = post("/delete", {"pack": "hvs80-pixel",
                                  "file": "rec_09.mp4"}, {})
        check("recording delete accepted", "Deleted rec_09.mp4" in txt)
        check("recording gone", not os.path.exists(rec))

        _, txt = post("/delete", {"pack": "hvs80-pixel",
                                  "file": "gameboy.frag"}, {})
        check("delete refuses non-recordings",
              "Only recordings" in txt)
        check("shader untouched",
              os.path.isfile(os.path.join(packs, "hvs80-pixel", "shaders",
                                          "gameboy.frag")))
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=5)
        except Exception:
            srv.kill()
        shutil.rmtree(work, ignore_errors=True)

    print("\n%d checks, %d failed" % (26, len(fails)))
    if fails:
        print("failed: " + ", ".join(fails))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
