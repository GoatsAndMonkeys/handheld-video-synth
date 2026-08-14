# milkdrop — credits and licensing

Four effects after **MilkDrop**, the music visualiser Ryan Geiss wrote for
Winamp in 2001. What is ported here is the *engine* — the handful of
constructions everything MilkDrop has ever looked like is built out of: a
per-pixel warp field on a feedback buffer, a waveform drawn over it, a video
echo composite stage, and the radius-scaled rotation that makes the spiral.

## Where the ideas come from, and under what licence

The living fork is **MilkDrop3** (<https://github.com/milkdrop2077/MilkDrop3>).
That repository has no root `LICENSE`, but `code/LICENSE.txt` inside it is
**BSD 3-Clause**, *"Copyright (c) 2018 Maxim Volskiy and individual
contributors"* — the BeatDrop lineage, which descends from Nullsoft's BSD
release of MilkDrop 2 by Ryan Geiss. BSD 3-Clause is GPL-3.0-compatible, so
this pack may carry adapted engine mathematics as long as the notice travels
with it. The notice is in [`LICENSE`](LICENSE) beside this file, and every
`.frag` header names it.

**No preset content is used here.** The 900+ community `.milk` presets
distributed with MilkDrop are the work of thousands of individual authors and
are *not* covered by that BSD grant. Nothing in this pack is derived from,
transcribed from, or fitted to any preset — not a warp equation, not a wave
shape, not a palette. What is reimplemented is the engine's own vocabulary:
the stages MilkDrop applies to every frame regardless of which preset is
loaded.

## What was actually written here

No MilkDrop code was copied, and none could have been: the original is HLSL
and C++ driving a two-buffer pipeline with a per-frame expression evaluator,
a real audio FFT and a mesh-based warp; these are single-pass GLSL ES 1.00
fragment shaders on a 2012 mobile GPU with one feedback buffer, four knobs,
three audio bands and no trigonometry worth using. Every line is original,
written against this repo's own idiom — the house `sw()`/`cw()` parabola
sine, clamped feedback taps, max-blend loops proved bounded so no knob
position can wind the picture to white or starve it to black.

| shader | after which part of the engine |
| --- | --- |
| `mdwarp` | the per-pixel stage: zoom about centre, rotation, and the sinusoidal warp displacement, applied to the feedback buffer with decay |
| `mdwave` | the waveform overlay. MilkDrop draws the real PCM buffer; this instrument has no sample buffer, so the trace is synthesised from three band-driven harmonics |
| `mdecho` | the video echo composite stage: scaled and optionally flipped copy of the frame, blended over it, plus that stage's gamma lift and solarise options |
| `mdspiral` | the Geiss spiral/tunnel: rotation by an angle proportional to radius, closed through the feedback buffer |

## Licence of this pack

The shaders, sidecars, playlist and this file are **GPL-3.0**, like the rest
of the repository, and are additionally after BSD-licensed work whose notice
is preserved in `LICENSE`.
