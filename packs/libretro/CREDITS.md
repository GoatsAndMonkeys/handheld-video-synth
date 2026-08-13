# libretro pack — credits & licences

Analog-display effects ported from the libretro
[common-shaders](https://github.com/libretro/common-shaders) collection
(plain Cg/GLSL, the branch closest to this project's target).

**That repository has no repository-wide LICENSE file.** Each file's own
header comment is therefore the only authority for its licence. Every licence
below was read from the header of the specific source file, and the original
copyright/author header is retained verbatim at the top of each ported
`.frag`, followed by a line naming the source repo and original filename.

| our file | original file | original author | licence | source |
| --- | --- | --- | --- | --- |
| `crtfast.frag` | `crt/shaders/zfast_crt.cg` | Greg Hogan (SoltanGris42), 2017 | GPL-2.0-or-later | [link](https://github.com/libretro/common-shaders/blob/master/crt/shaders/zfast_crt.cg) |
| `crttube.frag` | `crt/shaders/crt-lottes.cg` | Timothy Lottes | Public domain | [link](https://github.com/libretro/common-shaders/blob/master/crt/shaders/crt-lottes.cg) |
| `lcd3x.frag` | `handheld/shaders/lcd3x.cg` | Gigaherz | Public domain | [link](https://github.com/libretro/common-shaders/blob/master/handheld/shaders/lcd3x.cg) |
| `lcdghost.frag` | `motionblur/shaders/response-time.cg` | libretro contributors, after Harlequin's Game Boy / LCD shaders | GPL-2.0-or-later | [link](https://github.com/libretro/common-shaders/blob/master/motionblur/shaders/response-time.cg) |
| `interlace.frag` | `misc/interlacing.cg` | hunterk | Public domain | [link](https://github.com/libretro/common-shaders/blob/master/misc/interlacing.cg) |
| `tvout.frag` | `crt/shaders/tvout-tweaks.cg` | aliaspider | GPL-3.0 | [link](https://github.com/libretro/common-shaders/blob/master/crt/shaders/tvout-tweaks.cg) |

GPL-2.0-**or-later** files are distributed here under GPL-3.0, which that
"or (at your option) any later version" clause expressly permits. Public
domain files carry no conditions. See [`LICENSE`](LICENSE) for the notices and
the full GPL-3.0 text.

## What changed in porting

These are **not** verbatim vendorings — libretro shaders are multi-pass Cg with
a vertex stage, `#pragma parameter` knobs and emulator-supplied uniforms
(`Texture`, `InputSize`, `TextureSize`, `OutputSize`, `frame_count`). Each was
collapsed to a single HVS-80 fragment shader with exactly three 0..1 params.
The engine also targets a Pi Zero 2 W (VideoCore IV) at 640×480 with up to
five stacked layers, so every port is held to ≤3 texture fetches, no loops and
no `sin`/`cos`/`pow`.

| our file | passes collapsed | what was simplified or lost |
| --- | --- | --- |
| `crtfast` | 1 → 1 | Nothing lost. Vertex stage folded in. The emulator's fixed `texture_size.y` becomes a live "lines" param. |
| `crttube` | 1 → 1 | Heavily reduced. `Tri()`'s 11 taps → 3 vertical taps; `Bloom()`'s 31 taps → constant weights on those same 3 (the wide BloomScan gaussian is near-flat across 3 lines). `Gaus()` keeps `shape = 2.0`, which folds `pow(abs(pos), shape)` to `pos*pos`. The sRGB linearise/delinearise `pow()` pair is dropped (`scaleInLinearGamma 0`). Only shadow mask 1 of 4 is kept. Mask normalised to unit mean — at 640×480 one mask cell is one output pixel, so the original's undimmed mask blacks the picture out. |
| `lcd3x` | 1 → 1 | Four `sin()` replaced by a fract-based cosine approximation; at a 2–4 px subpixel pitch the two are indistinguishable. The compile-time constants `brighten_scanlines` / `brighten_lcd` become live params. |
| `lcdghost` | 1 → 1 | The original reads **seven** history buffers weighted by `pow(response_time, 1..7)` — an exponential dropoff built as a 7-tap FIR. Feeding our own previous output (`u_tex1`) back makes the same exponential an IIR with infinite taps: no `pow()`, no seven fetches, same decay curve. `asym` and `smear` are ours (the original has only `response_time`). |
| `interlace` | 1 → 1 | Nothing lost. `frame_count` → `u_time`; the boolean `force_240p` becomes a continuous field rate whose zero position reproduces it. |
| `tvout` | 1 → 1 | 4 taps → 3. `STU()` — the windowed-sinc reconstruction filter, two `sin()` per tap per component, 24 `sin()` per pixel — is replaced by placing the taps at the bandwidth distance and blending. The RGB (non-composite) branch is dropped; only the composite path is kept. TV colour levels become a continuous knob. |

## Deliberately skipped

**For licence reasons** — these were examined and rejected:

| file | stated licence | why skipped |
| --- | --- | --- |
| `crt/shaders/dotmask.cg` | "License: GPL" (bare, no version) | cgwg + Timothy Lottes. A bare "GPL" does not say v2-only, v2+, or v3. Cannot be determined with confidence, so not used. |
| `misc/interlacing-phosphor.cg` | "License: GPL (due to use of cgwg's GPLed dotmask code)" | Same problem — version unstated, and it inherits an unstated-version dependency. |
| `crt/shaders/crt-aperture.cg`, `crt/shaders/crt-easymode.cg`, `crt/shaders/crt-easymode-halation/*` | "License: GPL" (bare) | Version unstated. |
| `crt/shaders/phosphor-trails.cg` | none | No licence header at all, and no repo-wide LICENSE to fall back on. |
| `misc/natural-vision.cg` | none found | No licence header. |

(Note: `crt/shaders/crt-geom.cg`, `crt-cgwg-fast.cg`, `crt-caligari.cg`,
`handheld/shaders/retro-v2.cg` and the `gameboy`/`lcd-shader` families *do*
carry proper GPL-2.0-or-later notices and would have been usable; they were
skipped on the grounds below, not on licence.)

**For duplication** — the effect already exists in this project:

- `misc/cmyk-halftone-dot.cg` (public domain) — duplicates `demo/halftone`.
- `misc/color-mangler.cg` (public domain) — duplicates `demo/colorize`.
- `dithering/shaders/gendither.cg` (GPL-2.0-or-later) — duplicates
  `demo/gameboy` and `demo/websafe_y2k`.
- `motionblur/shaders/motionblur-simple.cg` (GPL-2.0-or-later) — duplicates
  `demo/feedback` and `demo/lumatrail`.
- `misc/scanline.cg`, `misc/scanlines-sine-abs.cg` (both public domain) and
  `handheld/shaders/zfast_lcd.cg` (GPL-2.0-or-later) — near-duplicates of
  `crtfast` and `lcd3x` within this pack.
- `crt/shaders/phosphor.cg` (public domain, Themaister) — its horizontal RGB
  triad is a near-duplicate of `lcd3x`'s subpixel stripes.
- `misc/bob-deinterlace.cg`, `misc/bob-and-ghost-deinterlace.cg`,
  `misc/flicker.cg` (all public domain) — same family as `interlace`.

**For the performance budget** — could not be brought under it:

- `pal/shaders/pal-singlepass.cg` (BSD-3-Clause, Viacheslav Slavinsky) — a real
  PAL quadrature modulate/demodulate. `FIRTAPS 20`, macro-unrolled as
  `macro_loopz(0)`…`(20)` — 21 texture fetches per pixel plus `sin`/`cos` per
  tap. Seven times the fetch budget;
  no honest reduction survives as PAL. Licence was fine — this one is purely a
  hardware limit, and worth revisiting on the CM4.
- `crt/shaders/crt-royale/*` (GPL) — 10+ passes with intermediate FBOs and LUTs;
  cannot be collapsed to one pass in any meaningful form.
- `ntsc/shaders/*` (the blargg/Bisqwit-derived 2-phase/3-phase NTSC chain) —
  inherently multi-pass: pass 1 encodes to a composite signal, pass 2 decodes
  it with a wide FIR. Collapsing to one pass destroys the artefacting that is
  the entire point.
- `crt/shaders/GritsScanlines/*` (public domain) and `crt/shaders/phosphorlut-*`
  — require external LUT texture files the engine has no channel for.

---

## Ported from common-shaders and glsl-shaders (geometry, motion, stylisation)

Eight shaders vendored from the libretro shader collections and ported to the
HVS-80 convention (single pass, GLES2, `u_tex0`/`u_tex1`, three `u_x*` params).
Every ported file keeps its original copyright/author header verbatim and names
the source repo and filename underneath it.

Neither `libretro/common-shaders` nor `libretro/glsl-shaders` carries a
repository-level LICENSE, so the per-file header is the only licence that
exists. Anything without one was skipped (list at the bottom).

| our shader | original filename | original author | licence | source |
| --- | --- | --- | --- | --- |
| `morph.frag` | `warp/shaders/dilation-fast.cg` (+ `warp/shaders/erosion-fast.cg`) | Hyllian (Sérgio Gonçalves de Britto) | MIT (file header) | [common-shaders](https://github.com/libretro/common-shaders/blob/master/warp/shaders/dilation-fast.cg) |
| `neon.frag` | `neon/shaders/neon-variation-1.cg` | Themaister (Hans-Kristian Arntzen) | public domain (file header) | [common-shaders](https://github.com/libretro/common-shaders/blob/master/neon/shaders/neon-variation-1.cg) |
| `cartoon.frag` | `cel/shaders/advcartoon.glsl` | guest(r) | GNU GPL, no version stated — we take GPL-3.0 under the "choose any version" clause | [glsl-shaders](https://github.com/libretro/glsl-shaders/blob/master/cel/shaders/advcartoon.glsl) |
| `beads.frag` | `misc/bead.cg` | Themaister (Hans-Kristian Arntzen) | public domain (file header) | [common-shaders](https://github.com/libretro/common-shaders/blob/master/misc/bead.cg) |
| `rewind.frag` | `motionblur/shaders/braid-rewind.cg` | hunterk, cgwg | GPL-2.0-**or-later** (file header) | [common-shaders](https://github.com/libretro/common-shaders/blob/master/motionblur/shaders/braid-rewind.cg) |
| `ripple.frag` | `borders/resources/water.glsl` | Themaister (Hans-Kristian Arntzen) | public domain (file header) | [glsl-shaders](https://github.com/libretro/glsl-shaders/blob/master/borders/resources/water.glsl) |
| `hashblur.frag` | `blurs/shaders/hash-blur.glsl` | Matt DesLauriers (glsl-hash-blur); RetroArch port by Aytos, changes by hunterk | MIT (file header) | [glsl-shaders](https://github.com/libretro/glsl-shaders/blob/master/blurs/shaders/hash-blur.glsl) |
| `vrsplit.frag` | `misc/anaglyph-to-side-by-side.cg` | hunterk | public domain (file header) | [common-shaders](https://github.com/libretro/common-shaders/blob/master/misc/anaglyph-to-side-by-side.cg) |

All eight licences are GPL-3.0 compatible: MIT, BSD and public domain are
permissive; GPL-2.0-or-later relicenses to GPL-3; an unversioned "GNU-GPL"
grant lets the recipient pick any FSF version (GPLv2 §9 / GPLv3 §14), and we
pick 3.

## What each port changed

Nothing here was multi-pass upstream, so no passes were collapsed. The
reductions are all about the Pi Zero 2W's four-fetch budget:

- **morph** — the original's five orthogonal taps become the centre plus three
  taps at 120°, and the one-texel offset becomes a played radius. Third param
  (per-channel bleed ↔ brightness-only swell) is ours; upstream has no params.
- **neon** — nine taps down to four: the two "estimates of the centre" that the
  algorithm differences come from the two diagonal pairs instead of from a
  corner-bilinear and an edge-midpoint-bilinear. Same detector, quarter cost.
- **cartoon** — nine taps down to four (centre + three corners); the missing
  horizontal/vertical difference terms are folded into the surviving
  diagonals. The colour quantiser is verbatim. Shader II's `mute_colors`
  branch became a blend on x2 rather than a duplicated code path.
- **beads** — colour is now fetched from the cell centre (nearest neighbour)
  and the cell size is a param, so the effect is a visible chunk rather than a
  subpixel one. `exp(-6x)` written as `exp2(-8.66x)`, the same curve.
- **rewind** — seven history buffers become three: `u_tex1` (previous output),
  `u_tex2` (the engine's delay-ring tap, whose reach already follows x0) and
  `u_tex3` (half-depth tap). The original only rewinds when the emulator runs
  time backwards; we have no reverse gear, so it is always on and its depth is
  played. Sepia is the original constant, extended to a full bleach at x1 = 1.
- **ripple** — seven wave sources down to three, `frame_count` → `u_time`, and
  the wave field drives the *coordinates* (its whole point here) as well as the
  brightness shimmer it drove upstream.
- **hashblur** — thirteen dynamic-loop iterations become four unrolled taps;
  the per-tap `sin`/`cos` pair becomes one `sin`/`cos` for a random base angle
  with the other three taps at free 90° rotations of it. Radii still come off
  the original `fract()` hash chain through `sqrt()`. Vignette made symmetric
  (upstream's leans into one corner).
- **vrsplit** — eye placement moved from the vertex stage into the fragment
  stage so separation/zoom are playable; `Warp()` is verbatim. The red/cyan
  channel un-mixing is dropped: it exists to pull two eyes out of an anaglyph
  frame, and our input is ordinary colour video.

## Skipped — no licence at all (unusable)

These have no licence header, and the repos have no LICENSE file to fall back
on, so there is no grant of any kind:

- `common-shaders`: `mudlord/shaders/emboss.cg`, `mudlord/shaders/toon.cg`,
  `warp/shaders/smart-morph.cg` (Sp00kyFox), `misc/cocktail-table.cg`,
  `misc/cocktail-cab-portrait.cg`, `misc/side-by-side.cg`, `misc/blinky.cg`,
  `motionblur/shaders/motionblur-blue.cg`, `motionblur/shaders/motionblur-color.cg`,
  `motionblur/shaders/feedback.cg`
- `glsl-shaders`: `misc/shaders/edge-detect.glsl`,
  `misc/shaders/cocktail-cabinet.glsl`,
  `stereoscopic-3d/shaders/side-by-side-simple.glsl`,
  `cel/shaders/MMJ_Cel_Shader*.glsl`
- `glsl-shaders`: `anti-aliasing/shaders/ewa_curvature.glsl` — "Copyright
  2010-2011 Pavlos Mavridis, All rights reserved" with no permission granted,
  which is a reservation, not a licence

Emboss and toon were the two most obvious picks in the "edge and stylisation"
bracket and both had to go; `cartoon` covers that ground instead.

## Skipped — non-commercial clause (unusable)

- `glsl-shaders`: `borders/resources/voronoi.glsl`,
  `borders/resources/shiny-iterations.glsl` — Shadertoy originals by Inigo
  Quilez, **CC BY-NC-SA 3.0**
- the whole `glsl-shaders/procedural/` tree — Shadertoy ports, which are
  CC BY-NC-SA by Shadertoy default where they state anything at all

## Skipped — licence fine, other reasons

- `common-shaders/anti-aliasing/shaders/reverse-aa.cg` (BSD-3-Clause,
  Christoph Feck / Hyllian) — 21 texture fetches, five times the budget
- `glsl-shaders/misc/shaders/glass.glsl` (public domain, Dogway) — 400 lines of
  bezel, reflection, fresnel and grain; does not reduce to three params
- `common-shaders/waterpaint/shaders/waterpaint.cg` (public domain, Themaister)
  — same nine-tap kernel as `neon-variation-1`; the port would have been a
  near-duplicate of `neon.frag`
- `glsl-shaders/cut/shaders/cut1/cut1.glsl` (GPL-3.0, Filippo Scognamiglio) —
  a faithful upscaler
- `common-shaders/misc/mcgreen.cg` (GPL-2.0-or-later, guest(r)) — monochrome
  colour reduction; duplicates our `gameboy`
- `common-shaders/motionblur/shaders/response-time.cg` and
  `common-shaders/misc/interlacing.cg` — clean licences, but already vendored
  into this pack as `lcdghost` and `interlace`

---

## Ported from slang-shaders (dithering, film, colour)

Upstream collection: <https://github.com/libretro/slang-shaders> — a
multi-author repository with **no repository-wide LICENSE file**, so every
shader below was cleared from its *own* file header. Files whose header
gave no licence, or gave one incompatible with GPL-3.0, were not taken
(see "Skipped" below).

Each ported `.frag` carries the original copyright/author header verbatim,
names the upstream repository and filename, and lists what changed in the
port. The slang originals are Vulkan GLSL (UBOs, `#pragma stage`,
`layout(...)`, `Source`/`Original` samplers); these are plain GLES2
fragment shaders on the HVS-80 / recurBOY convention — three `u_x*` params,
no `#version`, no integer ops, no dynamic loops.

## Attribution

| our file | original file | original author | licence | source |
| --- | --- | --- | --- | --- |
| `shaders/filmnoise.frag` | `film/shaders/film_noise.slang` | hunterk | **public domain** (stated in file header) | [film_noise.slang](https://github.com/libretro/slang-shaders/blob/master/film/shaders/film_noise.slang) |
| `shaders/colormangle.frag` | `misc/shaders/color-mangler.slang` | hunterk | **public domain** (stated in file header) | [color-mangler.slang](https://github.com/libretro/slang-shaders/blob/master/misc/shaders/color-mangler.slang) |
| `shaders/ega16.frag` | `dithering/shaders/bayer_4x4.slang` (dither threshold + depth reduction) and `dithering/shaders/blue_noise.slang` (its `EGAPalette` snap) | Copyright (C) 2023 gizmo98 | **GPL-2.0-or-later** ("version 2 of the License, or (at your option) any later version") | [bayer_4x4.slang](https://github.com/libretro/slang-shaders/blob/master/dithering/shaders/bayer_4x4.slang), [blue_noise.slang](https://github.com/libretro/slang-shaders/blob/master/dithering/shaders/blue_noise.slang) |
| `shaders/gendither.frag` | `dithering/shaders/gendither.slang` | Copyright (C) 2013-2014 leilei; slang adaptation by hunterk | **GPL-2.0-or-later** | [gendither.slang](https://github.com/libretro/slang-shaders/blob/master/dithering/shaders/gendither.slang) |
| `shaders/deband.frag` | `misc/shaders/deband.slang` | haasn (from mpv, `video/out/opengl/video_shaders.c`); RetroArch adaptation by hunterk | **GPL-2.0-or-later**, alternatively offered as LGPL-2.1-or-later | [deband.slang](https://github.com/libretro/slang-shaders/blob/master/misc/shaders/deband.slang) |

All five are GPL-3.0 compatible: public-domain material carries no
conditions, and GPL-2.0-**or-later** may be relicensed upward to GPL-3.0,
which is what shipping it inside this project does.

`ega16.frag` reimplements gizmo98's EGA palette snap algorithmically (the
original is a ~30-branch chain of `vec3` equality tests, far too heavy for
the Pi Zero 2W) from the same 16-colour palette, keeping its dither
threshold and colour-depth-reduction maths. It is a derivative work of a
GPL-2.0-or-later shader either way and is credited as one.

## Skipped, and why

Licence, not taste — every one of these was a shader we wanted:

| file | licence found | verdict |
| --- | --- | --- |
| `film/shaders/film-grain.slang` (Martins Upitis) | **CC BY 3.0 Unported** | skipped — CC BY 3.0 is not GPL-compatible (only CC BY **4.0** has one-way compatibility with GPL-3.0) |
| `dithering/shaders/bayer-matrix-dithering.slang` (Martins Upitis) | header says only *"All the content here is and will be free to use for everyone, but a donation is always nice"* | skipped — a permission to *use* is not a grant to redistribute or modify; not a determinable licence |
| `stereoscopic-3d/shaders/fubax_vr/*` (VR.slang, Chromatic.slang, FilmicSharpen.slang, VR_nose.slang — Jacob Max Fober) | **CC BY-NC-SA 4.0** | skipped — non-commercial clause |
| everything in `procedural/` (Shadertoy ports: kali, srtuss, iq, dr2, shane, dave_hoskins, mudlord, …) | no licence stated in any file; Shadertoy's site default is CC BY-NC-SA 3.0 | skipped wholesale |
| `border/shaders/effect-border-iq.slang` | Shadertoy sources credited, no licence | skipped |
| `misc/shaders/edge-detect.slang` | none | skipped |
| `misc/shaders/ega.slang`, `misc/shaders/retro-palettes.slang` | none | skipped — both were strong palette candidates |
| `misc/shaders/night_mode.slang` (DariusG) | credit only, no licence | skipped |
| `misc/shaders/simple_color_controls.slang`, `misc/shaders/yiq-hue-adjustment.slang`, `misc/shaders/cocktail-cabinet.slang` | none | skipped |
| `warp/shaders/smart-morph.slang` (Sp00kyFox) | credit only, no licence | skipped |
| `anti-aliasing/shaders/shock.slang` | credit to an NVIDIA GPU Gems article, no licence | skipped |
| `reshade/shaders/NormalsDisplacement/…`, `reshade/shaders/blendoverlay/…`, `reshade/shaders/vibrance-pass-sh1nra358.slang` | none | skipped |
| `border/shaders/ambient-glow.slang`, `misc/shaders/tonemapping.slang`, `motionblur/shaders/motionblur-color.slang` | none | skipped |

Skipped for reasons other than licence:

- `denoisers/shaders/median_3x3.slang` (BSD-3-Clause, Morgan McGuire /
  Williams College — **usable**) — a true median needs 9 taps; the budget
  is 4.
- `blurs/shaders/smart-blur.slang` (MIT, Hyllian — **usable**) — ported and
  cut to 4 taps, but an edge-preserving blur is invisible on smooth
  material and could not be shown working; dropped rather than shipped
  unverified.
- `misc/shaders/glass.slang` (public domain, Dogway — **usable**) — needs
  six frames of history texture.
- `misc/shaders/relief.slang` (MIT, Hyllian — **usable**) — despite the
  name it is a three-point interpolation resampler, not a relief/emboss
  operator, and has no look of its own.
