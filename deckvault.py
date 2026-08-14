#!/usr/bin/env python3
"""Deck backup: local snapshots on the card, and an off-device copy.

A setlist is the one thing on this machine that cannot be rebuilt from the
repo, and it was lost once — the engine truncated decks.json and there was
no second copy anywhere. So there are two layers here, deliberately
independent:

  * snapshots  — timestamped copies in playlists/deck_history/. No network,
                 no account, works on a dead-flat wifi. Dies with the card.
  * cloud      — a secret GitHub gist, pushed from a background thread so a
                 slow hotspot never stalls the render loop. Survives the card.

Both are best-effort and silent: nothing here may raise into the engine, and
nothing here may block it. Losing a backup is a bad day; crashing the synth
mid-set because a backup failed would be worse.

Run directly to inspect or restore:
    python3 deckvault.py list   packs/hvs80-synth/playlists/decks.json
    python3 deckvault.py restore packs/hvs80-synth/playlists/decks.json
    python3 deckvault.py restore packs/hvs80-synth/playlists/decks.json --from-cloud

Python 3.7 compatible; stdlib only.
"""
import json
import os
import shutil
import threading
import time
import urllib.error
import urllib.request

KEEP = 20              # snapshots retained per pack
MIN_INTERVAL = 300.0   # seconds between routine snapshots
CLOUD_INTERVAL = 60.0  # seconds between gist pushes
CLOUD_COALESCE = 20.0  # wait this long for more edits before pushing
CONF_DIR = os.path.expanduser("~/.vfxdeck")

_last_snap = {}        # decks_path -> monotonic time of last snapshot


# --------------------------------------------------------------- local disk

def _history_dir(decks_path):
    return os.path.join(os.path.dirname(decks_path), "deck_history")


def _write_atomic(path, text):
    """Temp file, fsync, rename. The rename is the only moment the target
    changes, and it is atomic — there is no window where the file exists
    but is empty. That window is what cost the original setlist."""
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def snapshots(decks_path):
    """Newest first."""
    d = _history_dir(decks_path)
    try:
        names = [n for n in os.listdir(d)
                 if n.startswith("decks-") and n.endswith(".json")]
    except OSError:
        return []
    return [os.path.join(d, n) for n in sorted(names, reverse=True)]


def snapshot(decks_path, text, force=False):
    """Keep a dated copy. Rate-limited, because saves happen on every edit
    and a snapshot per keypress would grind the card for nothing. force=True
    is for the copy taken at load, before the engine can touch the file —
    that one is the most valuable of the lot."""
    if not text or not text.strip():
        return None                       # never enshrine an empty setlist
    now = time.monotonic()
    if not force and now - _last_snap.get(decks_path, -1e9) < MIN_INTERVAL:
        return None
    keep = snapshots(decks_path)
    if keep:                              # unchanged since last time: skip
        try:
            with open(keep[0]) as f:
                if f.read() == text:
                    _last_snap[decks_path] = now
                    return None
        except OSError:
            pass
    d = _history_dir(decks_path)
    try:
        os.makedirs(d, exist_ok=True)
        path = os.path.join(d, time.strftime("decks-%Y%m%d-%H%M%S.json"))
        _write_atomic(path, text)
        _last_snap[decks_path] = now
        for old in (keep + [path])[KEEP:]:
            try:
                os.remove(old)
            except OSError:
                pass
        return path
    except OSError as exc:
        print("deck snapshot failed:", exc)
        return None


def _usable(path):
    """A candidate is only usable if it parses and actually holds decks."""
    try:
        if os.path.getsize(path) == 0:
            return None
        with open(path) as f:
            text = f.read()
        if json.loads(text).get("decks"):
            return text
    except (OSError, ValueError):
        pass
    return None


def restore_if_empty(decks_path):
    """If the live file is missing or empty, put the newest good copy back.

    This is the automatic half. An empty decks.json is never something anyone
    asked for — it only happens when a write died halfway — so restoring is
    always the right call. Returns the source it restored from, or None."""
    try:
        if os.path.exists(decks_path) and os.path.getsize(decks_path) > 0:
            return None
    except OSError:
        return None
    for cand in [decks_path + ".bak"] + snapshots(decks_path):
        text = _usable(cand)
        if text:
            try:
                _write_atomic(decks_path, text)
                return cand
            except OSError as exc:
                print("deck restore failed:", exc)
                return None
    return None


# -------------------------------------------------------------------- cloud

def _conf(name):
    """Token/id from the environment first, then ~/.vfxdeck/."""
    env = os.environ.get("VFXDECK_GIST_" + name.upper())
    if env:
        return env.strip()
    try:
        with open(os.path.join(CONF_DIR, "gist_" + name)) as f:
            return f.read().strip()
    except OSError:
        return ""


def _save_conf(name, value):
    try:
        os.makedirs(CONF_DIR, exist_ok=True)
        path = os.path.join(CONF_DIR, "gist_" + name)
        _write_atomic(path, value)
        os.chmod(path, 0o600)
    except OSError as exc:
        print("could not remember gist id:", exc)


def _api(url, token, payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=body, method="PATCH" if payload
                                 and "gists/" in url else "POST")
    if payload is None:
        req.get_method = lambda: "GET"
    req.add_header("Authorization", "token " + token)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "vfx-deck")
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode())


def cloud_push_now(pack, text):
    """Blocking push. Returns (ok, message)."""
    token = _conf("token")
    if not token:
        return False, "no token"
    fname = "decks-%s.json" % (pack or "demo")
    payload = {"description": "VFX Deck setlists (%s)" % (pack or "demo"),
               "files": {fname: {"content": text}}}
    gid = _conf("id")
    try:
        if gid:
            _api("https://api.github.com/gists/" + gid, token, payload)
            return True, "updated gist " + gid
        payload["public"] = False
        got = _api("https://api.github.com/gists", token, payload)
        _save_conf("id", got["id"])
        return True, "created gist " + got["id"]
    except urllib.error.HTTPError as exc:
        if exc.code == 404 and gid:       # gist deleted upstream: start over
            _save_conf("id", "")
        return False, "HTTP %s" % exc.code
    except Exception as exc:              # DNS, timeout, no route, bad JSON
        return False, str(exc)[:60]


class _Cloud(object):
    """One worker for the whole process. Holds only the latest payload —
    ten edits in a minute are one push, not ten."""

    def __init__(self):
        self.lock = threading.Lock()
        self.pending = None
        self.wake = threading.Event()
        self.status = "idle"
        self.last_ok = 0.0
        self.thread = None

    def start(self):
        if self.thread is None:
            self.thread = threading.Thread(target=self._run, daemon=True)
            self.thread.start()

    def push(self, pack, text):
        with self.lock:
            self.pending = (pack, text)
        self.wake.set()

    def _run(self):
        fails = 0
        while True:
            self.wake.wait()
            self.wake.clear()
            time.sleep(CLOUD_COALESCE)        # let a flurry of edits settle
            gap = time.monotonic() - self.last_ok
            if gap < CLOUD_INTERVAL:
                time.sleep(CLOUD_INTERVAL - gap)
            with self.lock:
                job, self.pending = self.pending, None
            if not job:
                continue
            ok, msg = cloud_push_now(job[0], job[1])
            if ok:
                self.last_ok = time.monotonic()
                self.status = "synced " + time.strftime("%H:%M")
                if fails:
                    print("deck cloud backup recovered:", msg)
                fails = 0
            else:
                self.status = "offline"
                if fails == 0:                 # say it once, not every retry
                    print("deck cloud backup unavailable:", msg)
                fails += 1
                if msg != "no token":          # keep the payload, try again
                    with self.lock:
                        if self.pending is None:
                            self.pending = job
                    time.sleep(min(300, 30 * fails))
                    self.wake.set()


_cloud = _Cloud()


def cloud_push(pack, text):
    """Queue an off-device copy. Returns immediately; never raises."""
    try:
        if not _conf("token"):
            return False
        _cloud.start()
        _cloud.push(pack, text)
        return True
    except Exception:
        return False


def cloud_status():
    return _cloud.status if _conf("token") else "off"


def cloud_fetch(pack):
    """Pull the setlists back down. Returns text or None."""
    token, gid = _conf("token"), _conf("id")
    if not (token and gid):
        return None
    try:
        got = _api("https://api.github.com/gists/" + gid, token)
    except Exception as exc:
        print("could not reach the gist:", exc)
        return None
    files = got.get("files", {})
    for key in ("decks-%s.json" % (pack or "demo"),):
        if key in files:
            return files[key].get("content")
    return list(files.values())[0].get("content") if files else None


# --------------------------------------------------------------------- CLI

def _main():
    import argparse
    ap = argparse.ArgumentParser(description="inspect or restore deck backups")
    ap.add_argument("action", choices=["list", "restore", "push"])
    ap.add_argument("decks_path")
    ap.add_argument("--from-cloud", action="store_true")
    ap.add_argument("--pick", help="restore this snapshot file specifically")
    a = ap.parse_args()
    pack = os.path.basename(
        os.path.dirname(os.path.dirname(os.path.abspath(a.decks_path))))

    if a.action == "list":
        live = _usable(a.decks_path)
        print("live   %-52s %s" % (a.decks_path,
                                   "ok" if live else "EMPTY/UNREADABLE"))
        for p in [a.decks_path + ".bak"] + snapshots(a.decks_path):
            text = _usable(p)
            if text:
                d = json.loads(text)["decks"]
                print("  %-50s %d decks, %d scenes" %
                      (os.path.basename(p), len(d),
                       sum(len(x.get("scenes", [])) for x in d)))
        print("cloud:", cloud_status())
        return

    if a.action == "push":
        text = _usable(a.decks_path)
        print(cloud_push_now(pack, text) if text else (False, "nothing to push"))
        return

    if a.from_cloud:
        text = cloud_fetch(pack)
        if not text:
            print("nothing in the cloud to restore")
            return
    elif a.pick:
        text = _usable(a.pick)
    else:
        cands = [a.decks_path + ".bak"] + snapshots(a.decks_path)
        text = next((t for t in (_usable(c) for c in cands) if t), None)
    if not text:
        print("no usable backup found")
        return
    if _usable(a.decks_path):
        shutil.copy2(a.decks_path, a.decks_path + ".displaced")
        print("current file kept as", a.decks_path + ".displaced")
    _write_atomic(a.decks_path, text)
    d = json.loads(text)["decks"]
    print("restored %d decks, %d scenes" %
          (len(d), sum(len(x.get("scenes", [])) for x in d)))


if __name__ == "__main__":
    _main()
