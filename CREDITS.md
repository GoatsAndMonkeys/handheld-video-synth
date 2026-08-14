# Credits & license compatibility

The HVS-80 (Handheld Video Synth) is GPL-3.0. This file records every piece of outside
work the project uses, how it is used, and why the licensing is compatible.

## Code and shaders shipped in this repository

| work | author | license | how we use it | compatibility |
| --- | --- | --- | --- | --- |
| r_e_c_u_r shader collection (`packs/recurboy/shaders/*.frag`) | Tim Caldwell (cyberboy666) & r_e_c_u_r contributors (per-file author comments preserved) | **GPL-3.0** ([`packs/recurboy/LICENSE`](packs/recurboy/LICENSE)) | shipped **verbatim** (one upstream missing-semicolon fix in `colour_sine.frag`) | GPL-3 in a GPL-3 project ✔ |
| r_e_c_u_r 2-input mixer shaders (`packs/recur/shaders/*.frag`) | Tim Caldwell (cyberboy666) & r_e_c_u_r contributors ([r_e_c_u_r](https://github.com/langolierz/r_e_c_u_r)) | **GPL-3.0** ([`packs/recur/LICENSE`](packs/recur/LICENSE)) | five 2-input mixers carried with minimal edits (unused-uniform cleanup; `mix_lumaKey` renamed from the conjur convention to ours) — every edit listed in [`packs/recur/CREDITS.md`](packs/recur/CREDITS.md); the feedback buffer stands in for the second channel | GPL-3 in a GPL-3 project ✔ |
| recurBOY / conjur uniform convention (`u_tex0`, `u_x0..2`, `u_time`, `u_resolution`, legacy `ftime`/`fparams`) | cyberboy666 | GPL-3.0 | we implement the same *interface* so community shaders drop in; no code copied | interfaces/conventions are not copied code ✔ |
| bzzzbz shaders (`packs/bzzzbz/shaders/*.frag`) | Davide Rovelli, Peter Nagy, Illyes ([bzzzbz](https://github.com/daviderovell0/bzzzbz)) | **GPL-3.0** ([`packs/bzzzbz/LICENSE`](packs/bzzzbz/LICENSE)) | four generators ported to our uniform convention and cut to fit the Pi's GPU; per-file authorship and per-shader changes recorded in [`packs/bzzzbz/CREDITS.md`](packs/bzzzbz/CREDITS.md) | GPL-3 in a GPL-3 project ✔ |
| libretro shader ports (`packs/libretro/shaders/*.frag`) | many (per-file authors preserved: Lottes, Themaister, hunterk, Hyllian, gizmo98, leilei, guest(r), haasn, Greg Hogan, aliaspider, Gigaherz, cgwg, DesLauriers) | mixed **per file** — public domain / MIT / GPL-2.0-or-later / GPL-3.0; every one read from its own header, since [common-shaders](https://github.com/libretro/common-shaders) has **no repo-wide LICENSE** ([`packs/libretro/CREDITS.md`](packs/libretro/CREDITS.md)) | 19 effects ported to our uniform convention and cut to fit the Pi's GPU; files with an unversioned "GPL", a non-commercial clause, or no licence header were **skipped** — those are listed too | each is individually GPL-3-compatible ✔ |
| EYESY modes (`packs/eyesy/shaders/*.frag`) | Owen Osborn / Critter & Guitari, Inc. ([EYESY_OS](https://github.com/critterandguitari/EYESY_OS), [modes](https://github.com/critterandguitari/EYESY_Modes_OSv3)) | **BSD-3-Clause** (OS) / BSD-2-Clause (modes) ([`packs/eyesy/LICENSE`](packs/eyesy/LICENSE)) | six modes **reimplemented** as fragment shaders — the originals are Python/pygame primitive drawing, so no code could be copied; notice, conditions and disclaimer carried in every file header | BSD is permissive and GPL-3-compatible ✔ |

**Deliberately not used:** `creation.glsl` from that same repository is
[Silexars' "Creation"](https://www.shadertoy.com/view/XsXXDn) by Danilo
Guanabara, credited to him in its own header. Shadertoy's default is CC
BY-NC-SA, which is GPL-incompatible and non-commercial, and he is not a
bzzzbz contributor — so that repo's GPL-3 grant does not cover it. Left out.

## Techniques reimplemented (no code copied)

We could not determine a license for
[Andrei Jay](https://andreijaycreativecoding.com)'s instrument repositories,
so none of his code appears in this repository. The following shaders are
**original implementations, written from scratch for this project**, of
techniques his published work demonstrates — algorithms and ideas are not
subject to copyright:

| our shader | technique studied | his project |
| --- | --- | --- |
| `waaave`, `waaave_warp`, `waaave_color`, `waaave_mirror` | coordinate-warped feedback, HSB drift, chaotic huezones, lumakey routing | waaave_pool |
| `chromab` | brightness-band colorize / solarize fold | CHROMATIC_ABERRATION |
| `lifeosc` | spatial video oscillators with video phase-mod | artificial_life |
| `slitscan` | scanline time-freeze | temporal_vortex |
| `haeckel` | superformula (Gielis curve) forms | SUPER_HAECKEL_ADVENTURES_64 |
| `gravity` | attractor-lensed feedback | gravity_waaaves |
| `cellular` | numerical-feedback automata | integerfeedbackbasic0 / cellular_automata_lab |
| `delay` | framebuffer video delay lines | FB_DELAY_REAL / gravity_waaaves |
| `convolve` | convolution kernels on video + feedback | convolutional_chaos |
| `phosphor` | oscilloscope-style audio-visual traces | phosphorm |
| `glyphworld` | discrete-glyph audio-visual fields | glyph_worlds0 |
| `scopexy` | vector-beam X-Y sweep with delay-line phosphor persistence | [phosphorm](https://github.com/ex-zee-ex/phosphorm) |
| `fourband` | fixed four-band hue/solarize instrument | [CHROMATIC_ABERRATION1](https://github.com/ex-zee-ex/CHROMATIC_ABERRATION1_the_search_for_sasquatch) |
| `meshscan` | two-axis luma-displaced wire mesh, audio-driven | [spectral_mesh](https://github.com/ex-zee-ex/spectral_mesh) / [auto_mesh](https://github.com/ex-zee-ex/auto_mesh) |
| `autolife` | interfering low-frequency oscillator fields, banded | [artificial_life](https://github.com/ex-zee-ex/artificial_life) |

The last four (`scopexy`, `fourband`, `meshscan`, `autolife`, added 2026)
revisit phosphorm and CHROMATIC_ABERRATION from a different angle than
`phosphor`/`chromab` and add the scan-mesh and oscillator-field instruments.
His repositories still carry no licence, so these too are clean-room:
written from the projects' READMEs and published behaviour, with no upstream
code read while writing them.

If any of this ever ships commercially, reach out to Andrei first as a
courtesy — this scene runs on goodwill.

`ascii`, `gameboy`, `colorize`, `feedback`, `websafe_y2k`, `rgbdelay`, `vhs`,
`solarize`, `timegrad`, `halftone`, `melt`, `lumatrail`, `thermal`, `nightvis`,
`matrix` (retired) and the engine itself are original to this project, by
GoatsAndMonkeys. `ruttetra` is a from-scratch homage to the Rutt/Etra video
synthesizer's deflection-modulation technique (1972 analog hardware, no code
lineage).

## Runtime dependencies (not distributed in this repo)

| dependency | license | GPL-3 compatible? |
| --- | --- | --- |
| pygame | LGPL-2.1 | ✔ |
| PyOpenGL | BSD-3-Clause | ✔ |
| opencv-python | Apache-2.0 | ✔ (Apache-2 is GPLv3-compatible) |
| numpy | BSD-3-Clause | ✔ |
| Pillow | MIT-CMU (HPND) | ✔ |
| python-evdev | BSD-3-Clause | ✔ |
| yt-dlp | Unlicense | ✔ |
| ffmpeg (John Van Sickle static builds) | GPL-3.0 build | ✔ — and invoked as a separate process, never linked |
| RetroPie / EmulationStation | GPL-2.0/3.0 components | ✔ — integrated via config files only |

All dependencies are installed by the user (pip/installer), not
redistributed here, which keeps obligations minimal either way.

## Documentation & community

- README structure modeled on [PeteHaughie/VideoSynthEngine](https://github.com/PeteHaughie/VideoSynthEngine) (MIT) — structure only, no text copied.
- The [scanlines.xyz](https://scanlines.xyz) community's
  [Raspberry Pi video gear thread](https://scanlines.xyz/t/raspberry-pi-based-video-gear/99)
  was the map that made this project possible.
- NTS Radio streams are accessed as a listener via their public endpoints;
  nothing is redistributed.

## Media

No video or music content is included in this repository or in public
releases. Clips downloaded with `ytget.py` are for the user's own device;
see [docs/SD_CARD_GUIDE.md](docs/SD_CARD_GUIDE.md) on keeping shared SD images
content-free.
