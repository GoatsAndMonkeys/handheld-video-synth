# vserpi — credits

Eighteen effects for the HVS-80, **written from scratch in GLSL** after the
techniques demonstrated by [Andrei Jay](https://andreijaycreativecoding.com)
([@ex-zee-ex](https://github.com/ex-zee-ex)) across the waaave_pool / VSERPI
family of Raspberry Pi video instruments. The pack is named for VSERPI, the
environment that family runs in; the work in it is his lineage, not his code.

## No code is copied

**We could not determine a licence for any of his instrument repositories, so
none of his code appears in this repository.** Every `.frag` here is an
original implementation of a technique his published work demonstrates —
algorithms and visual ideas are not subject to copyright, code is — written
from the projects' READMEs, published videos and observed behaviour, with no
upstream source read while writing them.

That is the whole reason this pack exists as reimplementation rather than as
a port. Unlike a permissively-licensed upstream, there is nothing here we
could have carried over even if we wanted to: with no licence there is no
grant, so the only honest route is to study the technique and write the
shader ourselves. Each file's header comment says what it is after and, where
it diverges from the original instrument, how.

These files are GPL-3.0 like the rest of the engine.

If any of this ever ships commercially, reach out to Andrei first as a
courtesy — this scene runs on goodwill.

## What each shader is after

| shader | technique studied | his project |
| --- | --- | --- |
| `waaave` | coordinate-warped feedback with HSB drift and lumakey routing | [waaave_pool](https://github.com/ex-zee-ex/waaaave_pool) |
| `waaave_warp` | bank 2: displacement, rotation and feedback zoom drift | waaave_pool |
| `waaave_color` | bank 3: feedback colour life/death, chaotic huezones | waaave_pool |
| `waaave_mirror` | bank 4: mirror/kaleido symmetry zones | waaave_pool |
| `gravity` | attractor-lensed feedback | gravity_waaaves |
| `delay` | framebuffer video delay lines | FB_DELAY_REAL / gravity_waaaves |
| `convolve` | convolution kernels on video + feedback | convolutional_chaos |
| `cellular` | numerical-feedback automata | integerfeedbackbasic0 / cellular_automata_lab |
| `slitscan` | scanline time-freeze | temporal_vortex |
| `chromab` | brightness-band colorize / solarize fold | CHROMATIC_ABERRATION |
| `lifeosc` | spatial video oscillators with video phase-mod | artificial_life |
| `haeckel` | superformula (Gielis curve) forms | SUPER_HAECKEL_ADVENTURES_64 |
| `phosphor` | oscilloscope-style audio-visual traces | phosphorm |
| `glyphworld` | discrete-glyph audio-visual fields | glyph_worlds0 |
| `scopexy` | vector-beam X-Y sweep with delay-line phosphor persistence | [phosphorm](https://github.com/ex-zee-ex/phosphorm) |
| `fourband` | fixed four-band hue/solarize instrument | [CHROMATIC_ABERRATION1](https://github.com/ex-zee-ex/CHROMATIC_ABERRATION1_the_search_for_sasquatch) |
| `meshscan` | two-axis luma-displaced wire mesh, audio-driven | [spectral_mesh](https://github.com/ex-zee-ex/spectral_mesh) / [auto_mesh](https://github.com/ex-zee-ex/auto_mesh) |
| `autolife` | interfering low-frequency oscillator fields, banded | [artificial_life](https://github.com/ex-zee-ex/artificial_life) |

The last four (added 2026) revisit phosphorm and CHROMATIC_ABERRATION from a
different angle than `phosphor`/`chromab` and add the scan-mesh and
oscillator-field instruments. His repositories still carry no licence, so
these too are clean-room.

## What is ours in here

The engine interface is the house one: the recurBOY convention (`u_tex0`,
`u_x0..3`, `u_time`, `u_resolution`) plus this project's three audio bands
(`u_a0` bass, `u_a1` level, `u_a2` highs), its `u_tex1` feedback buffer and
its `u_tex2`/`u_tex3` delay-ring taps. Where an original instrument reached
for hardware or an openFrameworks host, these reach for those uniforms
instead, and everything is cut to what VideoCore IV will run at 320x240 —
bounded loops, no hardware trig, a per-pixel texture budget. Knob layouts,
sidecar help text and the fourth-parameter extensions are ours.

`feedback` — the house pack's plain feedback effect, whose header calls
itself "waaave-style" — stays in `packs/hvs80-synth`: it predates this pack
and is an original of this project, not a study of a specific instrument of
his.
