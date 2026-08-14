# bzzzbz pack — credits & licence

Shaders ported from **[bzzzbz](https://github.com/daviderovell0/bzzzbz)**, a
Raspberry Pi audio-reactive video synthesizer built at the University of
Glasgow, School of Engineering, by Davide Rovelli (daviderovell0), Peter Nagy
(deetrone) and Marcell Illyes (marcellillyes).

bzzzbz is **GPL-3.0**, the same licence as this project, so its shaders ship
here under GPL-3.0. The upstream licence text is carried verbatim in
[`LICENSE`](LICENSE) beside these files. Every ported `.frag` keeps the
original file's Doxygen header — `@file`, `@brief` and `@author` — verbatim at
the top, followed by a line naming the source repo and original filename.

## What was ported

| our file | original file | original author | licence | source | what changed |
| --- | --- | --- | --- | --- | --- |
| `shaders/cells.frag` | `src/shaders/cells.glsl` | Peter Nagy (deetrone) | GPL-3.0 | [bzzzbz](https://github.com/daviderovell0/bzzzbz/blob/master/src/shaders/cells.glsl) | Uniforms remapped to our convention (`A`/`B`/`C` → `u_x0`/`u_x1`, `fft[513]` bins → `u_a0`/`u_a1`/`u_a2`). The 5-iteration `distance()` loop is unrolled to five squared distances with a single `sqrt` at the end (`min(√a,√b) == √min(a,b)`). `sin()` replaced by a fract/parabola stand-in; the `tan(…pow(A_mod, …))` second term replaced by a second stand-in wave (it was numerically unbounded and aliased into noise). The `0.2*color/(var+color)` blow-out that makes the bright filaments is kept, with a guarded denominator. Published hue kept (red coeff 0.0, green 0.72, blue 1.0); highs may now add a little red. Added `u_time` (the original was clockless, so it froze without audio) and `u_x2` video mix. |
| `shaders/spectrum.frag` | `src/shaders/spectrum.glsl` | Marcell Illyes (marcellillyes), Davide Rovelli (daviderovell0) | GPL-3.0 | [bzzzbz](https://github.com/daviderovell0/bzzzbz/blob/master/src/shaders/spectrum.glsl) | Our engine supplies three audio bands, not a 513-bin FFT, so the bin envelope is interpolated across bass/level/highs with a per-column flutter and a high-end roll-off. Bin selection keeps the original's method (`int(rel_pos)` → `floor()`). Added: peak-hold decay off the feedback buffer `u_tex1`, a lit cap on each column, an idle floor so the bank still moves in silence, and the `u_x2` video mix. Bar fill is the original's white until video is mixed in. |
| `shaders/eqbars.frag` | `src/shaders/spectrum_slow.glsl` | Marcell Illyes (marcellillyes) | GPL-3.0 | [bzzzbz](https://github.com/daviderovell0/bzzzbz/blob/master/src/shaders/spectrum_slow.glsl) | The original is the authors' own cautionary example — a 33-pass loop that "leads to serious performance issues on the Pi". The look was kept and the loop removed: `floor()`/`fract()` place the 32 gapped columns in one pass. Three bands stand in for the FFT as above. Added: vertical LED segmentation and a green→amber→red VU heat ramp (the original painted a flat 0.5 grey) to hold it visually apart from `spectrum.frag`, plus an idle floor and the `u_x2` video mix. |
| `shaders/wavepat.frag` | `src/shaders/wavepatterns.glsl` | Marcell Illyes (marcellillyes) | GPL-3.0 | [bzzzbz](https://github.com/daviderovell0/bzzzbz/blob/master/src/shaders/wavepatterns.glsl) | Structure kept exactly: two crossed carriers summed, then a `mod()`/`fract()` test lights only the pixels standing on a contour of the sum. `cos()`/`sin()` replaced by the fract/parabola stand-in and frequencies restated in cycles. Line thickness was knob `C`; it is now driven by `u_a1`/`u_a2` so the contours swell on transients, and amplitude by `u_a0`. Published colouring kept (red 1.0, green rising with height, blue 0.1). Added the `u_x2` video mix. |

`shaders/_source_plasma.frag` and `shaders/_overlay.frag` are copied verbatim
from `packs/hvs80-synth/` — every pack needs its own copy to load. They are original
to this project (GoatsAndMonkeys), not bzzzbz work.

## What was NOT ported, and why

| file | reason |
| --- | --- |
| `src/shaders/creation.glsl` | **Provenance — skipped.** Not bzzzbz's work to relicense. Its own header credits `@author Danilo Guanabara, Port: Peter Nagy (deetrone)` and its body links the source: `https://www.shadertoy.com/view/XsXXDn`. That is the well-known Shadertoy shader *"Creation by Silexars"* by Danguafer (Danilo Guanabara), and the code matches it line for line (`z += 0.07`, `u += p/l*(sin(z)+1.0)*abs(sin(l*9.0-z*2.0))`, `c[i] = 0.01/length(fract(u) - 0.5)`). Shadertoy's default licence is **CC BY-NC-SA 3.0** — the NonCommercial term alone makes it GPL-incompatible, and Guanabara is not a bzzzbz contributor, so the repo's GPL-3.0 grant does not reach it. |
| `src/shaders/vertex.glsl` | Vertex stage; this engine supplies its own (`VERT_SRC` in `main.py`) and loads fragment shaders only. |

The four ported files each name only bzzzbz contributors as author (Rovelli,
Nagy, Illyes — all three listed in the upstream README), carry no external URL
or third-party credit, and no search turned up an outside origin for their
distinctive code. `cells.glsl` builds on the standard Worley/cellular-noise
minimum-distance algorithm (Worley, 1996 — the four-line form taught in
*The Book of Shaders* ch. 12), but an algorithm is not copyrightable
expression, its feature-point coordinates differ from that teaching example,
and the shaping functions, FFT routing and colouring that give the shader its
look are bzzzbz's own.
