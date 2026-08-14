# recur pack — credits & licence

These are **cyberboy666's r_e_c_u_r shaders** — the 2-input mixer collection
from **[langolierz/r_e_c_u_r](https://github.com/langolierz/r_e_c_u_r)**
(`Shaders/2-input/`), the Raspberry Pi video sampler by Tim Caldwell
(cyberboy666) and contributors.

r_e_c_u_r is **GPL-3.0**, the same licence as this project, so these shaders
ship here under GPL-3.0. The licence text is carried verbatim in
[`LICENSE`](LICENSE) beside these files.

On r_e_c_u_r these shaders mix two independent media channels. This engine
has one source chain, so here the second input (`u_tex1`) is what the engine
binds it to: the **feedback buffer** — the previous output frame. The code is
unchanged by that; it is the same mixer pointed at the machine's own past.

## What was ported, and every edit made

All five shaders are carried with **minimal edits**, listed exhaustively
below and repeated in the header comment of each file. "Slot-cleanup" means:
the upstream files declare the clock uniform (`u_time`) and the fourth knob
(`u_x3`) without ever reading them, and this engine decides the control bar's
speed and fourth-knob slots by scanning the source for those names — so the
unused declarations were removed to keep dead controls off the bar. No
executable statement was altered in any file.

| our file | original | edits |
| --- | --- | --- |
| `shaders/blend_add.frag` | [`Shaders/2-input/blend_add.frag`](https://github.com/langolierz/r_e_c_u_r/blob/master/Shaders/2-input/blend_add.frag) | slot-cleanup only (removed unused `u_time`, `u_x3` declarations) |
| `shaders/wipe.frag` | [`Shaders/2-input/wipe.frag`](https://github.com/langolierz/r_e_c_u_r/blob/master/Shaders/2-input/wipe.frag) | slot-cleanup only |
| `shaders/luma_key.frag` | [`Shaders/2-input/luma_key.frag`](https://github.com/langolierz/r_e_c_u_r/blob/master/Shaders/2-input/luma_key.frag) | slot-cleanup only |
| `shaders/add_mix.frag` | [`Shaders/2-input/add_mix.frag`](https://github.com/langolierz/r_e_c_u_r/blob/master/Shaders/2-input/add_mix.frag) | slot-cleanup only. Upstream quirk kept as written: its two variant functions are character-identical, so the `u_x1` "mode" switch changes nothing visible |
| `shaders/mix_lumaKey.frag` | [`Shaders/2-input/mix_lumaKey.frag`](https://github.com/langolierz/r_e_c_u_r/blob/master/Shaders/2-input/mix_lumaKey.frag) | written in the older **conjur** convention, so: `tcoord`→`v_texcoord`, `tex`→`u_tex0`, `tex2`→`u_tex1`; removed the unused `tres`, `iparams`, `ftime`, `itime` declarations; moved the `f0`/`f1`/`f2` helper assignments from global scope into `main()`, because GLSL ES 1.00 only permits constant expressions as global initialisers. `fparams` is kept — this engine binds it (legacy) as `(x0, x1, x2, speed)`. The key/branch logic is untouched |

Each `.frag` also gained a header comment naming the source file and these
edits; the upstream files' own comments (`//2-input`, per-file annotations)
are preserved beneath it.

## What was NOT ported, and why

The rest of r_e_c_u_r's `Shaders/` folder — all fifteen 0-input and 1-input
shaders — is **already in this repository, byte-identical, in
[`packs/recurboy/`](../recurboy/)** (r_e_c_u_r and recurBOY share the same
author and the same shader files; the only diff anywhere is the
missing-semicolon fix `packs/recurboy` already carries in
`colour_sine.frag`). Duplicating them here would create fifteen global
shader-name collisions for no new effect.

| skipped | reason |
| --- | --- |
| `0-input/*` (5 files), `1-input/*` minus the two below (12 files) | byte-identical to `packs/recurboy/shaders/*` — already shipped |
| `1-input/hsv_control_fine.frag` | trivial variant of `hsv_control` (already in recurboy): same code with each knob's range multiplied by 0.1. The knobs already cover the fine range |
| `1-input/rotate_fine.frag` | trivial variant of `rotate` (already in recurboy): same code with knob ranges compressed (`0.45 + 0.1*x`) |
| `Shaders/default.vert` | vertex stage; this engine supplies its own and loads fragment shaders only |
