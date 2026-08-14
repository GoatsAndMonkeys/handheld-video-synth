---
name: make-effect
description: Create, write, port, or fix an effect shader or effect pack for the HVS-80 handheld video synth. Covers authoring .frag effects and sidecar/pack/playlist JSON, validating with checkpack.py and glslangValidator, and installing packs on the device. Use when asked to make a new effect, build a pack, or debug a shader that fails to load.
---

# Making HVS-80 effects

Effects are GLES2 fragment shaders in a **pack** (a folder of .frag files +
JSON). The complete authoring contract is in `PLUGINS.md` at the repo root —
read §2 (uniforms) and §3 (GPU limits) before writing any shader. This skill
is the fast path: the validation loop that gates every effect, a worked
example to copy from, and the traps that aren't obvious until they eat a day.

All paths below are relative to the repo root. A complete example pack lives
in this skill directory: **`.claude/skills/make-effect/example-pack/`** — its
`shaders/tourguide.frag` is a commented tour of every house technique
(trigless sine, mediump-safe noise, palette via mix/step, Bayer dither,
bounded feedback, audio mapping, video-ground convention). Copy blocks from
it freely; everything in this repo that isn't in a pack CREDITS ledger is
GPL-3.0 and yours to build on.

## The loop (write → validate → install)

Write files, then gate them through both validators. Both commands are the
ones that gate every pack this repo ships:

```sh
# 1. structure + schema + shader lint for a whole pack (0 errors required)
python3 tools/checkpack.py .claude/skills/make-effect/example-pack

# 2. real GLSL compile check (brew install glslang if missing).
# The engine prepends the version/precision preamble at load time, so
# prepend the same thing to a temp copy before compiling:
f=example-pack/shaders/tourguide.frag
printf '#version 100\nprecision mediump float;\n' | \
  cat - .claude/skills/make-effect/$f > /tmp/chk.frag && \
  glslangValidator -S frag /tmp/chk.frag
```

Install: put the pack folder in `packs/` (or run
`python3 tools/packget.py <folder-or-zip>`, which validates, installs,
warns about shader-name collisions, and rsyncs to a connected device).
Final authority is compiling on the device's real GLES context:
`python3 checkshader.py packs/<name>/shaders/*.frag` on the Pi.

## File formats

**`pack.json`** — `{"name", "artist", "description", "version"}`, plus
optional `"itch"`/`"pay"` links (printed after install; see PLUGINS.md §8).
`name` must equal the folder name.

**Sidecar `<shader>.json`** (one per .frag, same basename):

```json
{
  "desc": "one lowercase line describing the look",
  "params": [
    {"name": "scale", "help": "what turning this knob does, concretely"}
  ]
}
```

Up to 4 params, matching u_x0..u_x3 in order. Write help text about the
*visual result*, not the math.

**Playlist `playlists/<name>.json`** — `{"name", "credit", "steps": [...]}`;
each step `{"shader", "x": [0..1 per knob], "speed": 0.5, "lfo":
[bool per knob]}` (`lfo` optional). See `example-pack/playlists/example.json`.

## The uniform contract (what declaring a name *does*)

The engine scans the file with a **plain substring search — comments
count**. Naming `u_time` anywhere gives the effect a speed slot; never
mentioning it hides the slot (right for static quantizers). `u_x3` grants a
fourth knob. Any `u_a0/u_a1/u_a2` marks the effect audio-reactive. So:
declare and mention only what you actually read.

| uniform | meaning |
|---|---|
| `u_tex0` | source video / previous layer |
| `u_tex1` | previous **output** frame — the feedback buffer |
| `u_tex2`, `u_tex3` | delay-line taps into ~0.8s of past output (u_tex2 deep, u_tex3 half-depth — see `packs/demo/shaders/rgbdelay.frag`) |
| `u_dither` | 4×4 Bayer threshold map; sample `.r` at `floor(st * u_resolution) / 4.0` |
| `u_atlas` | ASCII glyph strip (see `ascii.frag`) |
| `u_x0..u_x3` | knobs, 0..1 |
| `u_a0, u_a1, u_a2` | live audio bass / level / highs, 0..1 |
| `u_time`, `u_resolution` | clock (speed-scaled), surface size (640×480) |
| `ftime`, `fparams` | legacy conjur names — avoid in new work |

## Hard GPU limits (VideoCore IV, mediump)

- **No** `#version` or `precision` lines — the engine prepends them per
  platform; writing your own breaks the Pi build.
- Loops: constant bounds only, ≤24 iterations. No bitwise ops, no dynamic
  array indexing (palettes = nested `mix`/`step` chains).
- ≤16 texture fetches per fragment.
- No cheap hardware trig — use the parabola sine in `tourguide.frag`
  (`sw(x)` ≈ sin 2πx, `cw` ≈ cos).
- mediump ≈ 10 significant bits: keep hash constants small, keep coordinates
  bounded (orbit with sw/cw instead of walking `u_time` off to infinity).

## House rules (what makes an effect feel native)

- **Every declared knob does something**, at every position, and no knob
  combination may render black or white forever ("dice-safe") — the deck's
  randomizer will land on all of them.
- **Feedback must decay**: any `mix(new, u_tex1, k)` needs `k` strictly
  below 1.0 (house cap ≈ 0.85) and a clamped output, or the screen winds up
  to stuck white. Simulations must self-recover from whatever a previous
  effect left in the buffer.
- **Generators ground on video**: last knob blends the source in —
  `col += vid * u_x3 * 0.85;` — so the effect layers into a chain.
- Audio mapping convention: bass moves *structure*, level swells
  *brightness*, highs add *detail/sparkle*. Throb, don't strobe.
- Shader basenames are **global across packs** — check
  `ls packs/*/shaders/` before naming.

## Licensing (PLUGINS.md §7 is the law)

The repo is GPL-3.0. Original work: yours, credited in the pack CREDITS.md.
Ported code: only from GPL-compatible sources (MIT/BSD/Apache/GPL/PD), with
the upstream notice kept in the file header and the upstream LICENSE shipped
in the pack. Unlicensed or CC-NC sources (Shadertoy's default is CC BY-NC-SA):
**never copy the code** — reimplement the idea from scratch and credit it.
Model ledgers: `packs/livecode/CREDITS.md` (mixed adapted + clean-room),
`packs/partymode/CREDITS.md` (all clean-room).

## Gotchas (each of these has eaten real debugging time)

- A pack missing `_source_plasma.frag`/`_overlay.frag` used to fail to load
  silently; the engine now falls back to `packs/demo`'s copies — don't ship
  your own unless you want a custom look.
- The uniform scan reads comments: writing "TODO: maybe react to u_a0" in a
  comment gives your static effect a spurious audio badge.
- Reading state from `u_tex1` at cell centers: snap the sample to a texel
  center or bilinear filtering smears your state (see the flip-dot shader's
  state trick in `packs/demo/shaders/flipdot.frag`).
- glslangValidator passing does not prove Pi behavior — mediump precision
  and undefined-out-of-range `pow`/`log` differ on device. Guard inputs
  (`pow(max(x, 0.001), e)`) and keep magnitudes small.
- The validator's `WARN` on cross-pack shader borrows in playlists is
  legal usage, not an error.
