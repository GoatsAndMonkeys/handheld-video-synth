# Writing packs for the HVS-80

An effect on this instrument is one GLSL ES fragment shader. A **pack** is a
folder of them plus the JSON that tells the engine what the knobs are called
and what order to play them in. There is no plugin API, no build step and
nothing to compile: you drop a `.frag` into a folder, and it is an effect.

This document is the contract — what the engine hands your shader every
frame, what the GPU will and will not run, and what the JSON files must
contain. Everything here is what `main.py` actually does, not what would be
nice.

Read [`packs/partymode/`](packs/partymode/) alongside this. It is the model
pack: nine shaders, sidecars for all of them, one playlist, a CREDITS.md that
does the licensing job properly.

---

## 1. Anatomy of a pack

```
packs/<name>/
  pack.json               identity card: name, artist, description, version
  CREDITS.md              where the ideas came from, and under what licence
  LICENSE                 only if you carry someone else's licence text
  shaders/
    <effect>.frag         one effect. The filename is its name everywhere.
    <effect>.json         optional sidecar: knob names and help text
    _source_plasma.frag   optional — engine furniture (see below)
    _overlay.frag         optional — engine furniture (see below)
  playlists/
    <setlist>.json        an ordered list of effects with starting knobs
  clips/<collection>/     optional: video files, one folder per collection
```

| file | required | who reads it |
| --- | --- | --- |
| `shaders/*.frag` | yes — a pack with no shaders is nothing | the engine, compiled at load |
| `shaders/*.json` | no | the help panel and the control bar |
| `playlists/*.json` | no, but without one your pack only appears as `* everything` | the Loader |
| `pack.json` | yes by convention | humans, and `tools/checkpack.py`. The engine does not read it today |
| `CREDITS.md` | yes if anything here is after someone else's work | humans |
| `clips/` | no | the Loader's video sources |

### The two underscore files

`_source_plasma.frag` (the built-in generative source, used when the video
source is *plasma*) and `_overlay.frag` (blits the UI text panels) are engine
infrastructure, not art. **A pack may omit them.** When a pack has no copy of
its own, the engine falls back to `packs/hvs80-synth/shaders/`. Ship your own only
if you actually want a different generative source behind your effects —
`_source_plasma.frag` sees the same uniforms as any other shader.
`_overlay.frag` is a two-line blit with its own `u_rect` uniform and no
reason to differ; leave it out.

Any file whose name starts with `_` is skipped by the `* everything` set, so
that is also how you park a work-in-progress shader in the folder without it
turning up in the browser (`packs/hvs80-synth/shaders/_retired_matrix.frag` is one).

### How packs are found

The Loader's *FX deck* menu globs `packs/*/playlists/*.json`. Each file
becomes one row, listed by **filename**, followed by the playlist's `credit`
string and the pack's folder name:

```
partymode  — after Mathew Preziotte  (partymode)
```

On top of that, every pack gets a synthetic `* everything` row that walks all
its non-underscore `.frag` files in alphabetical order — unless a playlist is
named exactly after the pack folder, in which case that playlist *is* the
pack's everything and the synthetic row is suppressed. Playlists named
`deck` or `decks` are never listed; those names belong to the user's saved
setlists, which live in `decks.json` at the repo root, not in a pack.

### How shaders are found

`step["shader"]` is a bare name, no extension and no path. The engine looks
in the current pack's `shaders/` first, then in every pack alphabetically.
Sidecars are looked up the same way. Two consequences:

- A user's saved scene that references your effect keeps working after they
  switch to another pack. Good.
- **Shader names are effectively global.** If you name a shader `mirror` and
  the recurBOY pack already has one, whoever sorts first wins for anyone
  whose current pack has neither. Pick names nobody else would; run
  `ls packs/*/shaders/*.frag` before you settle on one.

Names are also read on a 640px screen in a room with a PA in it. Existing
effects run 4–10 characters, lowercase, no spaces (`partydot`, `jpegcrush`,
`rgbdelay`). Long names get truncated in the control bar.

Every shader in a playlist is compiled when the set is loaded. A shader that
fails to compile prints its driver error once and is never retried; a set
that fails to load rolls back to the previous one and flashes
`SET FAILED: ...` on the bar. If your pack loads and nothing happens, the
answer is in that message and in the terminal.

---

## 2. The uniform contract

The vertex shader belongs to the engine. It draws one fullscreen quad and
provides exactly one varying. You write the fragment shader, declare the
uniforms you use, and write `gl_FragColor`.

| declaration | what it carries |
| --- | --- |
| `varying vec2 v_texcoord;` | screen position, 0..1, origin bottom-left. The **only** varying — you cannot add another, there is no vertex shader of yours to fill it |
| `uniform sampler2D u_tex0;` | the input picture: the video/camera/plasma source, or the output of the layer below you in a stack |
| `uniform sampler2D u_tex1;` | the previous output frame. This is the feedback buffer |
| `uniform sampler2D u_tex2;` | delay tap: the engine's output from *k* frames ago |
| `uniform sampler2D u_tex3;` | second delay tap at half that depth |
| `uniform sampler2D u_atlas;` | ASCII glyph strip, `" .:-=+*#%@"` left to right, luminance in `.r` |
| `uniform sampler2D u_dither;` | 4x4 Bayer matrix, nearest-filtered, repeating |
| `uniform vec2 u_resolution;` | surface size in pixels — 640x480 on the handheld |
| `uniform float u_time;` | seconds, scaled by the speed knob (see below) |
| `uniform float u_x0;` … `u_x3;` | the four knobs, 0..1 |
| `uniform float u_a0, u_a1, u_a2;` | live audio: bass, overall level, highs; 0..1, zero when nothing is playing |
| `uniform float ftime;` `uniform vec4 fparams;` | legacy conjur/r_e_c_u_r compatibility: `ftime` is `u_time` wrapped to 0..1, `fparams` is `(x0, x1, x2, speed)`. Only for porting old shaders — do not use in new work |

Declare only what you read. Anything you leave out is simply not set; the
engine looks each name up and skips it if the linker dropped it.

### What declaring a uniform changes

The engine reads your shader source as **text** to decide what the control
bar shows:

| if the source contains | then |
| --- | --- |
| `u_time` or `ftime` | the **speed** slot appears in the bar |
| neither | the effect is *clockless*: the speed slot is hidden, and the help panel says so. Roughly half the house packs are clockless — `ascii`, `gameboy`, `halftone`, `solarize` all sit still until the picture moves |
| `u_x3` | a **fourth** knob slot appears. Without it the effect keeps the three-param recurBOY layout and shows no dead slot |
| `u_a0`, `u_a1` or `u_a2` | the effect is marked `♪` in the bar and the deck, meaning "moves with the sound" |

It is a plain substring test over the whole file, **comments included**. A
comment reading "no u_time here" turns the speed slot back on for an effect
that has no clock. Write around the names in prose, as the walkthrough
example below does.

### The knobs

`u_x0..u_x3` arrive clamped to 0..1 after the engine has applied everything
the performer is doing to them: an LFO adds up to ±0.25 (or follows an audio
band), punch (hold A) adds 0.5 to the selected knob, dice (B) throws all four
somewhere random. So:

- every knob must do something useful across its **whole** range, and
- **no combination of the four may break the picture.** Dice will find it.
  Guard your divisions (`max(x, 1e-5)`), clamp your output, and make sure 0.0
  is a sane value and not a black screen.

0.5 is the resting value: a step with no `x` written out starts every knob
there, so aim for "the effect looks like itself" at 0.5 across the board.

### The clock

`u_time` is not wall-clock seconds. The engine advances it by
`dt * (0.1 + speed * 1.9)` — so the speed knob runs from a tenth of realtime
to double it, and freeze (Y) stops it dead. Write motion in terms of
`u_time` and the speed knob takes care of itself. It accumulates without
bound over a long set, and the GPU is running `mediump`, so do not multiply
it by large constants: `sin(u_time * 400.0)` will visibly step and beat after
a few minutes. Wrap with `fract()` instead.

### The delay taps

The engine keeps a ring of 16 past **output** frames, about 0.8 seconds at
the handheld's frame rate. `u_tex2` is a tap into it whose depth follows the
first knob of the last effect in the chain (`k = 1 + x0 * 14` frames back);
`u_tex3` is a second tap at half that depth. See `packs/vserpi/shaders/delay.frag`
for the plain echo and `packs/hvs80-synth/shaders/rgbdelay.frag` for the RGB
time-split:

```glsl
uniform sampler2D u_tex0;
uniform sampler2D u_tex2;   // ring tap at x0 depth
uniform sampler2D u_tex3;   // ring tap at half depth
```

The ring holds what the engine *sent to the screen*, not the source. That is
why `rgbdelay` samples past **brightness** and repaints colour: sampling a
past green channel out of your own output would decay to nothing within a
second.

### What you cannot have

There is no way to ship a texture with a pack. The six samplers above are
all there is — the engine binds them and nothing else, and VideoCore IV has
eight texture units total. No uniform of your own invention will ever be
set. Anything your effect needs to know must arrive through the knobs, the
audio bands, the clock or the picture.

---

## 3. What this GPU will not do

The target is a Pi Zero 2 W: **VideoCore IV, OpenGL ES 2.0, GLSL ES 1.00**,
640x480, roughly 20 fps for a single effect and 15 with layers stacked. This
is a 2012 mobile GPU with a fixed-function-shaped shader core. Desktop GL
will happily compile things it rejects, so treat the list below as hard
rules rather than style advice.

**No `#version`, no `precision` line.** The loader prepends the per-platform
preamble: `precision mediump float;` on the Pi, `#version 120` on desktop.
Writing either yourself breaks one platform or the other. Start the file
with a comment, then your `varying`.

**Everything is `mediump`.** About 10 bits of mantissa. Keep coordinates near
0..1, do not accumulate, and expect banding if you build a value out of a
long chain of multiplies.

**No bitwise operators and no integer arithmetic.** `& | ^ << >> %` do not
exist in ES 1.00. Do it in floats with `floor`, `fract` and `mod`.

**No `transpose()`, no `inverse()`, no `matrixCompMult` tricks.** The
built-in list is short. If you need a matrix and its transpose, write both
out as constants — `packs/glitch/shaders/jpegcrush.frag` carries its DCT
basis and the transpose side by side for exactly this reason.

**No dynamic indexing.** A matrix or array may only be subscripted by a
constant expression. Select with `mix()` and `step()` instead; `jpegcrush`'s
`basis()` picks one of four `vec4`s from a float with two nested `mix`es and
no branch at all.

**Loops need constant bounds and must stay small.** `for (int i = 0; i < 24;
i++)` is fine; a bound that comes from a uniform is not, and neither is
breaking out on a computed condition. The heaviest loop shipped anywhere in
this repo is `lissaj`'s 24 segments, and it is ALU-only — no texture fetch
inside. Treat 24 as the ceiling, and halve it if the body samples anything.

**Trigonometry is slow.** `sin` and `cos` are emulated. Every pack uses the
same cheap sine instead — a parabola pair, period **1** rather than 2π,
range −1..1:

```glsl
// cheap sine on a unit period: sw(x) ~ sin(2*pi*x)
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }
float cw(float x) { return sw(x + 0.25); }
```

Real `sin()` is affordable a handful of times per pixel — `_source_plasma`
uses four. It is not affordable inside a loop.

**Texture fetches are the other budget.** Most effects here sample once or
twice. `jpegcrush` samples 16 times to build a 4x4 transform block, and it is
the heaviest shader in the repo by a distance — that is the ceiling anyone
should go near, not a target. Remember the performer can stack up to five
layers, each one redrawing the whole screen.

**Also absent:** derivatives (`dFdx`/`dFdy` need an extension nobody should
assume), `textureLod` in a fragment shader, multiple render targets, `while`
and `do`-`while`. Write `gl_FragColor` on every path, with alpha `1.0`.

The honest test of all of this is compiling on the device; see §6.

---

## 4. JSON schemas

### `pack.json`

The pack's identity card. Not read by the engine — it is what a person sees
before they unzip you, and what `checkpack.py` validates.

```json
{
  "name": "party mode",
  "artist": "after Mathew Preziotte",
  "description": "generators: dot rings, dashed circles, ray bursts and polar curves reimplemented in GLSL after party-mode and the curve toys",
  "version": 1
}
```

| field | type | notes |
| --- | --- | --- |
| `name` | string | human-readable, may contain spaces |
| `artist` | string | you. "after X" if the pack reimplements someone's ideas |
| `description` | string | one sentence, lowercase, says what is in the pack |
| `version` | int | bump it when you change the shaders |

### `shaders/<effect>.json` — the sidecar

Optional. Without one the knobs are labelled `x0`…`x3` and the help panel
shows the shader's filename and nothing else. With one, the performer can
tell what they are turning.

```json
{
  "desc": "rings of dots swelling to the music",
  "params": [
    {"name": "pitch",  "help": "spacing between dot rings — tight constellation to sparse orbits"},
    {"name": "pulse",  "help": "how hard the dots swell on the beat"},
    {"name": "spread", "help": "colour step ring to ring — one hue up to a full rainbow"},
    {"name": "video",  "help": "video shows through behind the constellation"}
  ]
}
```

| field | notes |
| --- | --- |
| `desc` | one line, lowercase, no full stop. Heads the help panel next to the effect name |
| `params` | one entry per knob, **in `u_x0`…`u_x3` order**, at most 4. Three is right for an effect that declares no `u_x3`; anything missing falls back to `x2`, `x3` |
| `params[].name` | the bar label. Keep it to 4–7 characters — the bar starts cutting letters off when a row will not fit, down to two if it has to |
| `params[].help` | the sentence in the help panel. Say what turning it *does*, not what it is called |

A sidecar listing four params for a shader that declares no `u_x3` is
harmless — the fourth is simply never shown.

### `playlists/<setlist>.json`

An ordered set: which effects, in which order, with which starting knobs.
This is the pack as a performance, and it is worth tuning — most people will
meet your effects through it and never touch a knob for the first minute.

```json
{
  "name": "party mode",
  "credit": "after Mathew Preziotte",
  "steps": [
    {"shader": "partydot", "x": [0.40, 0.55, 0.35, 0.00], "speed": 0.5},
    {"shader": "dashring", "x": [0.35, 0.40, 0.30, 0.00], "speed": 0.5},
    {"shader": "partydot", "x": [0.55, 0.65, 0.55, 0.80], "speed": 0.5}
  ]
}
```

| field | required | notes |
| --- | --- | --- |
| `name` | no | for humans and tools; the Loader lists the **filename** |
| `credit` | no | shown next to the set in the Loader. One short line |
| `steps` | yes | the effects, in order. L/R walks them |
| `steps[].shader` | yes | bare shader name, no `.frag`. May name a shader from another pack |
| `steps[].x` | no | 1–4 floats, 0..1. Short arrays are padded with 0.5; default is all 0.5 |
| `steps[].speed` | no | 0..1, default 0.5. Ignored for clockless effects |
| `steps[].lfo` | no | 5 booleans, `[x0, x1, x2, x3, speed]`. Default all off |
| `steps[].lfoband` | no | 5 ints per slot: `0` low, `1` mid, `2` high, `3` all. Default `3` |

The same shader may appear more than once with different settings — that is
how `partymode` gets 18 steps out of 9 effects: once as a pure generator, once
with the video knob up. It is a setlist, not an inventory.

---

## 5. Your first effect

A complete effect, start to finish. It posterizes the picture and stipples
the bands with the engine's Bayer texture. It declares no clock and no fourth
knob, so it gets three slots and no speed — which is the point of showing it.

**Make the pack:**

```sh
mkdir -p packs/mypack/shaders packs/mypack/playlists
```

**`packs/mypack/pack.json`:**

```json
{
  "name": "my pack",
  "artist": "your name",
  "description": "one posterizer, to start with",
  "version": 1
}
```

**`packs/mypack/shaders/posterize.frag`** — comment header first (what it
does and why, then the knob line), uniforms, `main`. That is the house
style; every shader in every pack opens the same way, because on a handheld
the header is the documentation:

```glsl
// Posterize: knock the picture down to a few levels per channel, with the
// engine's 4x4 Bayer texture breaking the bands up so the flats read as a
// print rather than as a screenshot of a broken decoder. Offsetting before
// the quantiser is what turns a hard step into a stipple.
//
// No clock and no fourth knob are declared, so the speed slot and the x3
// slot both stay off the bar.
//
// x0 levels, x1 dither strength, x2 saturation
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_dither;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

void main() {
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;

    // 2 levels at the bottom of the knob, 16 at the top — past that the
    // steps stop being visible and the effect just costs cycles
    float levels = floor(2.0 + u_x0 * 14.0);

    // the Bayer texture is 4x4 and repeats, so screen pixels index it
    // directly; 0..1 in, recentred to -0.5..0.5 as a quantiser offset
    float d = texture2D(u_dither, v_texcoord * u_resolution / 4.0).r - 0.5;

    vec3 grey = vec3(dot(src, vec3(0.299, 0.587, 0.114)));
    vec3 col = mix(grey, src, u_x2 * 2.0);          // 0.5 = untouched

    col = floor(col * levels + d * u_x1 + 0.5) / levels;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
```

Note the header says "no clock" rather than naming the uniform. Writing
`u_time` in that comment would hand the effect a speed knob that does
nothing.

**`packs/mypack/shaders/posterize.json`:**

```json
{
  "desc": "levels crushed down, bands stippled",
  "params": [
    {"name": "levels", "help": "how many shades survive — 2 is a poster, 16 is nearly clean"},
    {"name": "dither", "help": "stipple across the bands; 0 leaves hard steps"},
    {"name": "sat",    "help": "grey at 0, untouched at halfway, oversaturated above"}
  ]
}
```

**`packs/mypack/playlists/mypack.json`** — naming the playlist after the pack
folder makes it the pack's `* everything`, so the Loader lists one row rather
than two:

```json
{
  "name": "my pack",
  "steps": [
    {"shader": "posterize", "x": [0.15, 0.70, 0.50]},
    {"shader": "posterize", "x": [0.60, 0.20, 0.85]}
  ]
}
```

**Run it:**

```sh
.venv/bin/python main.py --pack packs/mypack --playlist mypack
```

Or start anywhere and pick it in the Loader (Tab / Start) → *FX deck*. Press
F1 (Select on the handheld) once to swap the bar for the help panel, and
check your sidecar text reads properly at size. Then turn every knob to both ends and hit dice (X on the
desktop) a dozen times before you call it done.

A headless smoke test, for a shell script or a commit hook:

```sh
.venv/bin/python main.py --pack packs/mypack --playlist mypack \
    --frames 40 --screenshot /tmp/mypack.png
```

---

## 6. Validation and install

**Check the pack:**

```sh
python3 tools/checkpack.py packs/mypack
```

It validates the folder structure, the JSON schemas (`pack.json`, sidecars,
playlists — including that every `shader` a playlist names actually exists)
and the shader sources: no `#version` or `precision` lines, no bitwise
operators, no dynamic indexing, loop bounds within reason. If
`glslangValidator` is on your PATH it also compiles each shader as ESSL 1.00,
which catches real syntax and type errors. Install it with
`brew install glslang` or `apt install glslang-tools`.

**The final authority is the device.** Desktop GL (and glslang) accept
constructs VideoCore IV's compiler rejects. `checkshader.py` brings up the
real dispmanx GLES2 context on the Pi and pushes each file through the same
compile path the engine uses, preamble and all, printing the driver's own
error text:

```sh
rsync -az packs/mypack pi@retropie.local:/home/pi/handheld-video-synth/packs/
ssh pi@retropie.local "cd handheld-video-synth && \
    python3 checkshader.py packs/mypack/shaders/*.frag"
```

If it compiles there, it runs. If it is *slow* there, only the frame counter
in the corner will tell you — check it with layers stacked, which is how
people actually play.

**Distribute** by zipping the folder:

```sh
cd packs && zip -r mypack.zip mypack -x '*/clips/*' '*.DS_Store'
```

**Install** by unzipping into `packs/`:

```sh
unzip mypack.zip -d /path/to/handheld-video-synth/packs/
```

That is the whole install. Restart the synth and the pack is in the Loader.
To push it to a handheld you already have running, `./deploy.sh <host>
--packs` syncs every pack (skipping clips and saved decks).

---

## 7. Licensing

This repository is **GPL-3.0**, and a contributed pack has to be
GPL-compatible — GPL-3.0, GPL-2.0-or-later, MIT, BSD, Apache-2.0 or public
domain. Shaders under CC BY-NC (Shadertoy's default), CC BY-SA, or with no
licence at all cannot be shipped here. Neither can a file whose header says
only "GPL" with no version.

Three ways to build a pack honestly:

1. **Original work.** Say so in `CREDITS.md`, and it is GPL-3.0 like the rest
   of the repo.
2. **Ported code, licence carried.** Keep the original author's header
   comment verbatim in every file, name the upstream repository and filename,
   list what you changed in the port, and ship the upstream `LICENSE` in the
   pack. `packs/libretro/CREDITS.md` does this per file, because that
   collection has no repo-wide licence and each shader had to be cleared from
   its own header. `packs/recurboy/` ships GPL-3 shaders verbatim.
3. **Reimplemented from ideas, with credit.** Algorithms and visual ideas are
   not copyrightable; code is. Rewriting a technique from scratch in GLSL is
   fine even when the original carries no licence — and crediting it is not
   optional. [`packs/partymode/CREDITS.md`](packs/partymode/CREDITS.md) is
   the model: it names the artist and every source repository, states plainly
   that no code is copied and *why none could be* (the originals build SVG
   documents in JavaScript; these are per-pixel fields), maps each shader to
   the work it is after in a table, and notes that the upstream repositories
   carry no licence — which is exactly the reason the pack contains only
   original code.

What is not allowed: copying unlicensed code because it was on the internet,
dropping a Shadertoy paste into a `.frag`, or "after so-and-so" as a byline
over lightly renamed variables. If you cannot describe what you rewrote and
why, you did not rewrite it.

Write the `CREDITS.md` while you build the pack, not afterwards. It is much
easier to say where a shader came from on the day you wrote it.

## 8. Sharing and selling your pack

A pack you wrote yourself is **yours**. Packs are content loaded through the
documented interface above — like game data on a GPL game engine — so your
original pack can carry any licence you choose, including a commercial one.
Two rules survive from §7 no matter what: anything you ported from GPL code
stays GPL (you may charge for it, but buyers keep the right to share it),
and CC BY-NC material cannot be sold at all.

**Selling: use [itch.io](https://itch.io).** Set your project's revenue
share to 0% and you keep everything except card-processing fees; itch
handles payment, delivery, VAT and refunds, and its audience already buys
VJ loops and EYESY modes. Upload a zip of your pack folder — the same
folder that passes `checkpack.py`:

```
mypack.zip
  pack.json
  shaders/*.frag + *.json
  playlists/mypack.json
  CREDITS.md          (and LICENSE, if you ported code)
```

Record preview clips with the deck itself (**record to SD**, then pull the
mp4) — nobody buys a shader pack from a text description.

Optional `pack.json` fields for distribution — the installer prints them
after a successful install, and a free pack with a tip link is a fine model
too:

```json
{
  "name": "mypack",
  "artist": "you",
  "itch": "https://you.itch.io/mypack",
  "pay":  "https://paypal.me/you/5"
}
```

**Installing someone else's pack:**

```sh
python3 tools/packget.py mypack.zip            # or a URL, or an unzipped folder
```

validates the pack (structure, schemas, shader lint — install is refused on
errors), copies it into `packs/`, warns about shader-name collisions with
installed packs, syncs it to the deck if one is reachable, and prints the
author's pay link. Packs are text you run on your own hardware — read
`checkpack`'s findings before trusting a download, same as any code.
