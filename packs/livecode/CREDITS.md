# livecode — credits

Six shaders for the HVS-80 after tools from the
[livecode.nyc](https://livecode.nyc/tools) scene — the New York livecoding
collective whose members perform visuals with code, live, in front of people.

The pack mixes the two honest ways to borrow (see `PLUGINS.md` §7): three
shaders **adapt MIT-licensed GLSL** with the upstream notice preserved, and
three are **reimplemented from scratch** after the look of tools whose code
could not be used.

## Adapted from The Force (MIT)

[The Force](https://github.com/shawnlawson/The_Force) by
[Shawn Lawson](https://shawnlawson.github.io) is a browser GLSL livecoding
editor; its `shaderExperiments/` folder is a book of worked examples. These
three carry the upstream copyright notice (Copyright (c) 2015 Shawn Lawson)
in their headers, per-file adapted-vs-original statements, and the MIT text
ships in this pack's `LICENSE`. The originals target desktop GL with hardware
trig and highp floats; the adaptations rebuild the same constructions on the
house trigless parabola-sine and mediump-safe value noise for the
VideoCore IV.

| shader    | adapted from |
|-----------|--------------|
| chromeegg | `RadialChromeEggs.frag` + `RadialFractal.frag` — log-polar chrome rings bent by a cell field, backbuffer trail |
| blobfield | `BlobPattern.frag` + `SinOfColor.frag` — per-channel sines of noise fields, threshold-cut into flat blobs |
| darksky   | `DarkAnalogSkies.frag` — pow-sharpened noise streaks in three tints, eaten by a rotating noise field |

## Reimplemented from ideas, with credit

**No code is copied** from these two projects — and none could be:
[la habra](https://github.com/sarahghp/la-habra) by
[Sarah Groff Hennigh-Palermo](https://sarahgp.com) (MIT) composes SVG
documents in ClojureScript, and bl4st by Dan Gorelick & Tyler Peterson is
unlicensed browser JavaScript. These are original per-pixel GLSL after the
look.

| shader    | after |
|-----------|-------|
| flatland  | la habra — rows of hard-edged flat shapes jump-cutting between layout states |
| bigflash  | la habra — poster-scale shapes and a flashing colour field, snap cuts on a clock |
| flamewisp | bl4st — luminous smoke wisps from an iterated contractive fold map with an orbit trap |

Everything here is GPL-3.0 like the rest of the repository; the three
adaptations additionally carry their upstream MIT notice.
