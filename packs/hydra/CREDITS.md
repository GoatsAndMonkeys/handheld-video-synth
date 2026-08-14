# hydra — credits

Six shaders for the HVS-80, **reimplemented from scratch in GLSL** after the
core vocabulary of [Hydra](https://github.com/hydra-synth/hydra) by
[Olivia Jack](https://ojack.xyz) — the browser livecoding video synth whose
one-line chains (`osc().modulate(noise()).kaleid()`) taught a generation
what video synthesis even is.

**No Hydra code is copied.** Hydra is JavaScript that composes GLSL at
runtime from chainable generators; these files are hand-written per-pixel
shaders after six of those generators' visual ideas, driven by this engine's
knobs and audio bands instead of livecoded arguments. Hydra is AGPL-3.0,
which is GPL-3.0-compatible in this direction — but nothing here derives
from its source anyway. These files are GPL-3.0 like the rest of the engine.

| shader   | after |
|----------|-------|
| osc      | `osc(freq, sync, offset)` — rolling sinusoid colour bands |
| noisefld | `noise(scale, offset)` — drifting value-noise field |
| voronoi  | `voronoi(scale, speed, blending)` — moving cellular field |
| kaleid   | `kaleid(nSides)` — fold the frame into a kaleidoscope |
| modwarp  | `modulate(osc(...))` — video flowing through sine currents |
| tilerep  | `repeat(x, y, offset)` — mirrored tiling with row shear |

The three sources carry the pack convention's fourth knob (video blend);
the three warps are filters, so all four knobs shape the transform.
