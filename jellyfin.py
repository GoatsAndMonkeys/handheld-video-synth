#!/usr/bin/env python3
"""Jellyfin as a video source — the user's movie servers feeding the synth.

The whole integration hangs on one fact: _FFClip in main.py hands its path
to `ffmpeg -re -i <path>`, and ffmpeg is as happy with an HTTP URL as with
a file. So this module never touches video bytes; it only answers two
questions: *what is on the server* (a browsable list for the menu) and
*what URL plays item X* (a string to drop into a ("clip", url) slot).

Standard library only — urllib + json. Same reasoning as webui.py: the Pi
is a 237MB Buster install where the installer cannot casually add packages,
and Jellyfin's REST API is plain enough not to need an SDK.

The handheld travels, so the config holds a *list* of server profiles and
one active index: home is a LAN address, the same server from a hotel is a
public IP, a friend's server has its own credentials. Everything else here
— listing, cache, stream URL — acts on whichever profile is active.

Config: `jellyfin.json` next to the app, gitignored, in the spirit of
stream.json::

    {
      "active": 0,                          index into "servers"
      "servers": [
        {"name": "home",   "url": "http://192.168.1.50:8096",
                           "api_key": "abcd1234..."},
        {"name": "remote", "url": "http://203.0.113.7:8096",
                           "api_key": "abcd1234..."},
        {"name": "gigs",   "url": "http://host:8096",
                           "username": "u", "password": "p",
                           "user_id": "hex-user-id"}
      ]
    }

The older flat form is still read, as a single profile at index 0 — a
working config is never something a user should have to rewrite::

    {"url": "http://myserver:8096", "api_key": "abcd1234..."}

Per profile: `url` is required; `api_key` (a key minted in the Jellyfin
dashboard) is the preferred credential — no auth dance, it goes straight
into every request. `username`+`password` is the fallback for servers
where the admin won't mint a key; it costs one AuthenticateByName round
trip, done lazily. `user_id` is optional and scopes the listing (needed on
servers that hide /Items from key-only callers). `name` is optional too —
a profile without one is displayed by its url host.

Nothing in here may stall the render loop: every network call carries
TIMEOUT, and the expensive call (fetch_items) is meant to be run from a
menu action or a worker thread, never per-frame. cached_items() is the
per-frame-safe way to populate a menu — pure file read, no network.
Nothing raises out of the public functions; failure is an empty result
and one printed line.

The on-disk cache (`jellyfin_cache.json`) keeps the last successful
listing **per profile**, so switching profiles does not throw away the
other one's menu: away from home, the home library still lists from
cache. Nothing here ages the cache out by time — this Pi has no RTC and
file mtimes lie. The cache is a fallback that the next successful
fetch_items() overwrites, and entries are keyed by the profile that
produced them — url *and* account — so a stale entry can never be served
for the wrong server, nor for the wrong account on the right one.
"""
import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
CFG_PATH = os.path.join(ROOT, "jellyfin.json")
CACHE_PATH = os.path.join(ROOT, "jellyfin_cache.json")

TIMEOUT = 5          # seconds per request — a dead server costs one menu
                     # beat, not a hung instrument
PAGE_SIZE = 100      # server-side page for the listing loop
MAX_ITEMS = 200      # menu cap: the UI is a d-pad, not a keyboard; 200
                     # rows is already generous scrolling, and 5000 would
                     # make the source picker unusable
DEVICE_ID = "hvs80"  # stable id so the server sees one transcode client,
                     # not a new device per boot

# Pi-sane transcode defaults. Sources decodes at 480x360 — the measured
# software-decode ceiling on the Zero 2W — so asking the server for more
# pixels only burns bandwidth and decode time.
DEFAULT_MAXW = 480
DEFAULT_MAXH = 360
DEFAULT_VBITRATE = 1200000   # bits/s — comfortable H.264 at 480x360
DEFAULT_ABITRATE = 128000

# Session state from AuthenticateByName (username/password profiles only).
# The token is tagged with the profile key it was issued for — url *and*
# account. Against a different server a token is merely worthless; against
# a different account on the *same* server it is worse, because the fetch
# succeeds and quietly returns the previous user's library. The active
# profile can change through set_active() or by someone editing the config
# under us, so the tag is what makes a switch honest however it happened.
_session = {"key": None, "token": None, "user": None}

# Session-only active index, used when the config file could not be
# written: the switch still has to work for tonight's gig even if the SD
# card is mounted read-only. Cleared once a write succeeds, because from
# then on the file is the authority again.
_active_override = None


def _read_cfg_file():
    """Raw parsed jellyfin.json, or None. Read fresh on every call — it is
    tiny and only read on menu actions, and re-reading means edits take
    effect without a restart (the synth is a live instrument; restarts are
    gigs lost)."""
    try:
        with open(CFG_PATH) as f:
            cfg = json.load(f)
    except (OSError, ValueError):
        return None
    return cfg if isinstance(cfg, dict) else None


def _norm_profile(raw, index):
    """One config entry -> a normalized profile, or None if unusable.
    A profile with no url cannot be anything, so it is dropped rather
    than shown as a menu row that does nothing."""
    if not isinstance(raw, dict):
        return None
    url = str(raw.get("url", "")).rstrip("/")
    if not url:
        return None
    name = str(raw.get("name", "")).strip()
    if not name:
        # No name given: the host is what the user actually thinks of it
        # as ("192.168.1.50" reads as home well enough).
        try:
            name = urllib.parse.urlsplit(url).hostname or ""
        except ValueError:
            name = ""
        name = name or ("server %d" % (index + 1))
    return {
        "index": index,
        "name": name,
        "url": url,
        "api_key": str(raw.get("api_key", "")),
        "username": str(raw.get("username", "")),
        "password": str(raw.get("password", "")),
        "user_id": str(raw.get("user_id", "")),
    }


def _account_tag(cfg):
    """What tells two profiles on the *same* server apart: the account.
    A username is readable and not a secret, so it is used as-is. An
    api_key would work too but must never be written to the cache file,
    so it is reduced to a short digest — enough to separate two keys,
    useless to anyone who reads it."""
    if cfg["username"]:
        return cfg["username"]
    if cfg["api_key"]:
        return "k" + hashlib.sha256(
            cfg["api_key"].encode("utf-8")).hexdigest()[:12]
    return ""


def _profile_key(cfg):
    """Identity of a profile for session and cache purposes. The url alone
    is not enough: two accounts on one server share a url, and keying on it
    would hand one account's token and library to the other. A profile with
    no credentials at all keys on the bare url, which is also what older
    cache files use, so they keep working."""
    tag = _account_tag(cfg)
    return cfg["url"] + "#" + tag if tag else cfg["url"]


def _all_profiles():
    """Internal: every usable profile, credentials included. Handles both
    config shapes — the flat form is just a one-entry list."""
    cfg = _read_cfg_file()
    if not cfg:
        return []
    raws = cfg.get("servers")
    if not isinstance(raws, list):
        raws = [cfg]              # flat legacy form: the file *is* profile 0
    out = []
    for raw in raws:
        prof = _norm_profile(raw, len(out))
        if prof:
            out.append(prof)
    return out


def profiles():
    """Menu-facing server list, in config order:
    [{"index", "name", "url", "active"}]. Empty when no config is usable.
    Credentials are deliberately not included — the menu never needs them.

    A profile missing its credentials is still listed (so the user can see
    it and fix it); available() is what says whether the active one can
    actually talk to a server."""
    act = active_index()
    return [{"index": p["index"], "name": p["name"], "url": p["url"],
             "active": p["index"] == act}
            for p in _all_profiles()]


def active_index():
    """Index of the active profile — 0 when unset, out of range, or when
    there is only one server. Never raises, never returns a bad index."""
    profs = _all_profiles()
    if not profs:
        return 0
    if _active_override is not None and 0 <= _active_override < len(profs):
        return _active_override
    cfg = _read_cfg_file() or {}
    idx = cfg.get("active", 0)
    if isinstance(idx, bool) or not isinstance(idx, int):
        return 0
    return idx if 0 <= idx < len(profs) else 0


def set_active(index):
    """Switch profiles and remember the choice. True if the choice was
    persisted to jellyfin.json; False on a bad index, or when the file
    could not be written — in that second case the switch still takes
    effect for this session, because a read-only config is no reason to
    strand the user on the wrong server mid-gig."""
    global _active_override
    profs = _all_profiles()
    if not isinstance(index, int) or isinstance(index, bool) \
            or not (0 <= index < len(profs)):
        print("jellyfin: no server profile %r" % (index,))
        return False
    _active_override = index
    _forget_session()          # the old token belongs to the old server
    cfg = _read_cfg_file()
    if cfg is None:
        print("jellyfin: cannot save active server — jellyfin.json unreadable")
        return False
    cfg["active"] = index
    # Temp file + rename, the way _save_deck does it: opening the real file
    # "w" truncates it first, and a yanked battery between truncate and
    # write would leave the user with no server config at all.
    tmp = CFG_PATH + ".tmp"
    try:
        with open(tmp, "w") as f:
            json.dump(cfg, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, CFG_PATH)
    except Exception as e:
        print("jellyfin: active server not saved (%s) — this session only" % e)
        try:
            os.remove(tmp)
        except OSError:
            pass
        return False
    _active_override = None    # the file agrees now; let it be the authority
    return True


def _active_cfg():
    """The active profile with credentials, or None."""
    profs = _all_profiles()
    if not profs:
        return None
    return profs[active_index()]


def _forget_session():
    _session["key"] = _session["token"] = _session["user"] = None


def available():
    """True if the active profile holds enough to even try: a URL plus
    either an API key or a username. Says nothing about the server being
    up — that answer costs a network call and belongs in fetch_items()."""
    cfg = _active_cfg()
    return bool(cfg and (cfg["api_key"] or cfg["username"]))


def _get_json(url, headers=None, post_json=None):
    """One HTTP round trip -> parsed JSON. Raises on any failure — the
    public wrappers are where errors turn into empty results, so the
    internals can stay honest about what went wrong."""
    data = None
    req_headers = {"Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    if post_json is not None:
        data = json.dumps(post_json).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=req_headers)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _auth(cfg):
    """Return (token, user_id) for this profile, or (None, None). api_key
    profiles are free of network traffic; username profiles authenticate
    once and reuse the token for as long as the profile stays active."""
    if cfg["api_key"]:
        return cfg["api_key"], cfg["user_id"]
    if _session["token"] and _session["key"] == _profile_key(cfg):
        return _session["token"], _session["user"]
    if not cfg["username"]:
        return None, None
    # Jellyfin refuses AuthenticateByName without this header — it is how
    # the server names the session in its dashboard.
    ident = ('MediaBrowser Client="HVS-80", Device="HVS-80", '
             'DeviceId="%s", Version="1.0"' % DEVICE_ID)
    body = _get_json(
        cfg["url"] + "/Users/AuthenticateByName",
        headers={"X-Emby-Authorization": ident},
        post_json={"Username": cfg["username"], "Pw": cfg["password"]})
    _session["key"] = _profile_key(cfg)
    _session["token"] = body.get("AccessToken")
    _session["user"] = (body.get("User") or {}).get("Id") or cfg["user_id"]
    return _session["token"], _session["user"]


def _record(raw):
    """One library item -> the small stable dict the menu consumes."""
    ticks = raw.get("RunTimeTicks")     # 100ns ticks, Jellyfin's unit
    return {
        "id": str(raw.get("Id", "")),
        "name": str(raw.get("Name", "")) or "untitled",
        "year": raw.get("ProductionYear"),           # int or None
        "runtime_min": (int(ticks) // 600000000) if ticks else None,
        "kind": str(raw.get("Type", "")).lower() or "movie",
    }


def fetch_items(kinds=("Movie", "Episode"), limit=MAX_ITEMS):
    """The active profile's library listing, fresh from its server; that
    profile's cache is rewritten on success and returned on failure.
    Network-bound — call it from a menu action or a worker thread, never
    the render loop.

    Returns a list of {"id", "name", "year", "runtime_min", "kind"},
    sorted by (name, year, id) so the menu order survives re-fetches
    even if the server changes its mind about sort collation.
    """
    cfg = _active_cfg()
    if not cfg:
        return []
    try:
        token, user_id = _auth(cfg)
        if not token:
            print("jellyfin: %s has no api_key and no username" % cfg["name"])
            return cached_items()
        items, start = [], 0
        # Page budget instead of `while items short`: a confused or lying
        # server (garbage rows, missing TotalRecordCount) must run out of
        # turns, not spin the menu thread forever.
        for _ in range(limit // PAGE_SIZE + 2):
            if len(items) >= limit:
                break
            ask = min(PAGE_SIZE, limit - len(items))
            params = {
                "Recursive": "true",
                "IncludeItemTypes": ",".join(kinds),
                "Fields": "ProductionYear,RunTimeTicks",
                "SortBy": "SortName",
                "SortOrder": "Ascending",
                "StartIndex": str(start),
                "Limit": str(ask),
            }
            if user_id:
                params["userId"] = user_id
            body = _get_json(
                cfg["url"] + "/Items?" + urllib.parse.urlencode(params),
                headers={"X-Emby-Token": token})
            batch = body.get("Items") if isinstance(body, dict) else None
            if not isinstance(batch, list) or not batch:
                break
            for raw in batch:
                if isinstance(raw, dict) and raw.get("Id"):
                    items.append(_record(raw))
            start += len(batch)
            total = body.get("TotalRecordCount")
            if isinstance(total, int) and start >= total:
                break
            if len(batch) < ask:    # short page: the library ran out
                break
        items.sort(key=lambda r: (r["name"].lower(),
                                  r["year"] or 0, r["id"]))
        items = items[:limit]
        _write_cache(_profile_key(cfg), items)
        return items
    except Exception as e:
        print("jellyfin: %s fetch failed (%s) — using cache"
              % (cfg["name"], e))
        return cached_items()


def _read_cache():
    """{server_url: [items]} — tolerates the single-server cache file
    written by the pre-profiles version of this module."""
    try:
        with open(CACHE_PATH) as f:
            cache = json.load(f)
    except (OSError, ValueError):
        return {}
    if not isinstance(cache, dict):
        return {}
    servers = cache.get("servers")
    if isinstance(servers, dict):
        return servers
    if isinstance(cache.get("server"), str):      # old one-server layout
        items = cache.get("items")
        return {cache["server"]: items} if isinstance(items, list) else {}
    return {}


def cached_items():
    """The active profile's last successful listing, no network — safe
    from anywhere, including the render loop. Empty if that profile has
    never been fetched. Entries are keyed by profile, so switching never
    serves one profile's library under another's name — not another
    server's, and not another account's on the same server — and switching
    back finds the old listing still there."""
    cfg = _active_cfg()
    if not cfg:
        return []
    cache = _read_cache()
    items = cache.get(_profile_key(cfg))
    if not isinstance(items, list):
        # Cache written before entries carried an account: it can only
        # have come from a one-account-per-url config, so serving it is
        # correct, and the next fetch rewrites it under the new key.
        items = cache.get(cfg["url"])
    return items if isinstance(items, list) else []


def _write_cache(profile_key, items):
    """Merge this profile's listing into the shared cache file, keeping
    every other profile's listing intact."""
    cache = _read_cache()
    cache[profile_key] = items
    # Drop entries for profiles no longer in the config, so the file does
    # not accumulate every address the handheld has ever visited. Bare-url
    # keys are kept as long as a profile still uses that url: they are the
    # pre-account cache, and dropping them would blank a profile's offline
    # menu until its first fetch on the new scheme.
    known = set()
    for p in _all_profiles():
        known.add(_profile_key(p))
        known.add(p["url"])
    known.add(profile_key)
    cache = dict((k, v) for k, v in cache.items() if k in known)
    tmp = CACHE_PATH + ".tmp"
    try:
        with open(tmp, "w") as f:
            json.dump({"servers": cache}, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, CACHE_PATH)   # never leave a half-written cache
    except OSError as e:
        print("jellyfin: cache write failed (%s)" % e)


def stream_url(item_id, max_w=DEFAULT_MAXW, max_h=DEFAULT_MAXH,
               v_bitrate=DEFAULT_VBITRATE, a_bitrate=DEFAULT_ABITRATE):
    """Playback URL on the active profile's server, ready for _FFClip,
    or None.

    This asks Jellyfin to *transcode* (static=false) to modest H.264 in
    an MPEG-TS wrapper rather than direct-play the original, because the
    original is whatever the user ripped — a 4K HEVC remux would flatten
    the Zero 2W, which decodes in software here. The server eats the
    transcode cost; the Pi receives 480x360 H.264 it can actually chew.
    TS (not mp4) because a live transcode is unseekable and fragmented
    mp4 over HTTP trips up more demuxers than plain TS does.

    The token rides in the query string — ffmpeg gets a bare URL, so
    header auth is not an option. For an api_key profile this function is
    pure string-building; for a username profile it may cost one auth
    round trip (TIMEOUT-bounded) the first time.
    """
    cfg = _active_cfg()
    if not cfg or not item_id:
        return None
    try:
        token, _ = _auth(cfg)
    except Exception as e:
        print("jellyfin: %s auth failed (%s)" % (cfg["name"], e))
        return None
    if not token:
        return None
    params = urllib.parse.urlencode([
        ("api_key", token),
        ("deviceId", DEVICE_ID),
        ("mediaSourceId", item_id),
        ("static", "false"),
        ("VideoCodec", "h264"),
        ("AudioCodec", "aac"),
        ("MaxWidth", str(max_w)),
        ("MaxHeight", str(max_h)),
        ("VideoBitrate", str(v_bitrate)),
        ("AudioBitrate", str(a_bitrate)),
    ])
    return "%s/Videos/%s/stream.ts?%s" % (
        cfg["url"], urllib.parse.quote(str(item_id)), params)


if __name__ == "__main__":
    # Hand-run check: with jellyfin.json in place, show the server list and
    # the active server's library with a playable URL. `ffplay "<url>"` on
    # a laptop proves the server side before the Pi is ever involved.
    servers = profiles()
    if not servers:
        print("no usable jellyfin.json at %s" % CFG_PATH)
    else:
        print("servers:")
        for p in servers:
            print("  %s [%d] %-12s %s" % ("*" if p["active"] else " ",
                                          p["index"], p["name"], p["url"]))
        if not available():
            print("\nactive server has no api_key and no username")
        found = fetch_items()
        print("\n%d items:" % len(found))
        for r in found:
            print("  %-40s %s  %s  %s" % (
                r["name"][:40], r["year"] or "----",
                ("%d min" % r["runtime_min"]) if r["runtime_min"] else "",
                r["kind"]))
        if found:
            print("\nstream URL for %r:" % found[0]["name"])
            print(stream_url(found[0]["id"]))
