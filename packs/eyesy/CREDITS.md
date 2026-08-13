# eyesy modes — credits

Six generators for the HVS-80, **reimplemented from scratch in GLSL** after
visual ideas in Critter & Guitari's [EYESY](https://www.critterandguitari.com/eyesy)
modes. This fills a gap: the engine has ~50 effects that *process* video and
almost nothing that *synthesises* it, and EYESY is a generator-first
instrument.

**No EYESY code is copied.** The originals are Python programs that call
pygame drawing routines — `pygame.draw.line`, `pygame.draw.circle` — hundreds
of primitives per frame, driven by a 100-sample audio buffer
(`eyesy.audio_in[]`). None of that translates to a fragment shader. Every
file here is a per-pixel solution to the same picture: instead of drawing 64
line segments, each pixel works out which segment it lies on. The audio
buffer becomes `aud()`, a cheap oscillator sum driven by this engine's three
audio bands (`u_a0` bass / `u_a1` level / `u_a2` highs) with a `u_time` term
so the modes still move in silence. EYESY's two colour knobs become an
automatic palette drift, freeing a knob for **video** — every mode's third
param crossfades it from a pure generator into an effect keyed and tinted by
the incoming `u_tex0`.

## Attribution

| our shader | original EYESY mode | original author | licence | source | relationship |
| --- | --- | --- | --- | --- | --- |
| `classicv.frag` | **S - Classic Vertical** | Owen Osborn / Critter & Guitari, Inc. | BSD-3-Clause (EYESY_OS) / BSD-2-Clause (modes repo) | [EYESY_Modes_OSv3](https://github.com/critterandguitari/EYESY_Modes_OSv3), [EYESY_OS](https://github.com/critterandguitari/EYESY_OS) | reimplementation — no code copied |
| `mirrgrid.frag` | **S - Mirror Grid** | Owen Osborn / Critter & Guitari, Inc. | BSD-3-Clause (EYESY_OS) / BSD-2-Clause (modes repo) | [EYESY_Modes_OSv3](https://github.com/critterandguitari/EYESY_Modes_OSv3), [EYESY_OS](https://github.com/critterandguitari/EYESY_OS) | reimplementation — no code copied |
| `gridcirc.frag` | **S - Grid Circles - Column Color** | Owen Osborn / Critter & Guitari, Inc. | BSD-3-Clause (EYESY_OS) / BSD-2-Clause (modes repo) | [EYESY_Modes_OSv3](https://github.com/critterandguitari/EYESY_Modes_OSv3), [EYESY_OS](https://github.com/critterandguitari/EYESY_OS) | reimplementation — no code copied |
| `concentr.frag` | **S - Concentric** | Owen Osborn / Critter & Guitari, Inc. | BSD-3-Clause (EYESY_OS) / BSD-2-Clause (modes repo) | [EYESY_Modes_OSv3](https://github.com/critterandguitari/EYESY_Modes_OSv3), [EYESY_OS](https://github.com/critterandguitari/EYESY_OS) | reimplementation — no code copied |
| `radscope.frag` | **S - Radial Scope - Rotate Uniform Color** | Owen Osborn / Critter & Guitari, Inc. | BSD-3-Clause (EYESY_OS) / BSD-2-Clause (modes repo) | [EYESY_Modes_OSv3](https://github.com/critterandguitari/EYESY_Modes_OSv3), [EYESY_OS](https://github.com/critterandguitari/EYESY_OS) | reimplementation — no code copied |
| `perspect.frag` | **S - Perspective Lines** | Owen Osborn / Critter & Guitari, Inc. | BSD-3-Clause (EYESY_OS) / BSD-2-Clause (modes repo) | [EYESY_Modes_OSv3](https://github.com/critterandguitari/EYESY_Modes_OSv3), [EYESY_OS](https://github.com/critterandguitari/EYESY_OS) | reimplementation — no code copied |

`_source_plasma.frag` and `_overlay.frag` are engine-required stubs copied
from `packs/demo/` — original to this project (GoatsAndMonkeys, GPL-3.0),
nothing to do with EYESY.

## Licence compatibility

EYESY_OS carries a **BSD 3-Clause** licence, "Copyright (c) 2025, Owen
Osborn, Critter & Guitari, Inc."; the EYESY_Modes_OSv3 repository the
individual modes were read from carries **BSD 2-Clause**, "Copyright (c)
2025, Critter & Guitari" — the same terms minus the non-endorsement clause.
Both are GPL-3-compatible, so this pack ships inside a GPL-3.0 project
without friction. Every `.frag` opens with the BSD-3 copyright notice, its
three conditions and its disclaimer, and the full text also sits beside them
in [`LICENSE`](LICENSE), so the notice travels with the code no matter how a
single file is copied out.

Neither Critter & Guitari nor Owen Osborn endorses this project (BSD clause
3): these are homages by a third party.

## What each one does

| shader | look | params |
| --- | --- | --- |
| `classicv` | 64 rows, each swinging a line out from the centre with a ball on the end — the signature EYESY scope | width · size · video |
| `mirrgrid` | ruled horizontal grid with bar scopes hanging from the top edge and standing off the bottom, square end-caps | thick · dense · video |
| `gridcirc` | staggered lattice of filled circles that swell on the audio, hue stepping across the columns | rest · stagr · video |
| `concentr` | pumping bullseye — stacked discs, drifting centre, ring pitch breathing on the bass | pitch · hue · video |
| `radscope` | spinning star of spokes fired from centre, dot on each tip, length from the audio | reach · spokes · video |
| `perspect` | fan of lines from a wandering vanishing point out to a dotted audio trace | vanish · weight · video |

## Performance

Written for the Pi Zero 2 W's VideoCore IV at 640×480, up to five layers
stacked. Every shader makes **exactly one `texture2D` fetch**, uses **no
`sin`/`cos`/`pow`/`exp`** (a `fract`-based triangle-shaped wave stands in for
the sine, and drives the palette too) and **no `smoothstep`**. `concentr` and
`radscope` use one `length()` each; `radscope` uses the only `atan()` in the
pack; `perspect` has the only loop, a constant 3 iterations.
