# Handheld Video Synth

**A pocket computer for video effects.** Handheld Video Synth turns a Retroflag GPi Case
(Raspberry Pi Zero 2 W) into a handheld video effects console: it plays video
(YouTube pulls, camera, generative), melts it through a library of live GLSL
effects, reacts to music (each clip's own sound or NTS internet radio),
records itself, and broadcasts — RTMP live streams or UDP straight into a
laptop running OBS as a mixer. Effect scenes save into performable **decks**
you walk through with the shoulder buttons, LSDJ-style. Also runs on desktop
(macOS/Linux) for building sets and effects.

GPL-3.0 · shaders speak the [r_e_c_u_r](https://github.com/cyberboy666/r_e_c_u_r)
/ glslViewer convention, so community shaders drop in verbatim.

## Quick start

Desktop (needs python3, ffmpeg):

```sh
python3 -m venv .venv
.venv/bin/pip install pygame PyOpenGL opencv-python numpy yt-dlp
.venv/bin/python main.py
```

RetroPie / GPi Case — from your computer, with the Pi on the network:

```sh
rsync -az --exclude .venv --exclude .git ./ pi@retropie.local:/home/pi/handheld-video-synth/
ssh pi@retropie.local 'bash /home/pi/handheld-video-synth/pi/install.sh'
```

Reboot the Pi: a **Handheld Video Synth** shelf appears in EmulationStation with carts.
To press a complete SD card image ("cart") for distribution, see
[docs/SD_CARD_GUIDE.md](docs/SD_CARD_GUIDE.md).

## Architecture

```
                       ┌───────────────────────────────┐
   SOURCES             │        EFFECT CHAIN           │            SINKS
                       │  (1–3 stacked GLSL layers)    │
  plasma (gen) ──┐     │                               │   ┌── screen (dispmanx/GLES2
  clips ─────────┼──►  │  layer1 ─► layer2 ─► layer3   ├──►│           or desktop GL)
  camera ────────┘     │     ▲   feedback buffer   │   │   ├── mp4 recorder ──► clips/
                       │     └──── prev frame ◄────┘   │   ├── RTMP (YouTube Live)
  AUDIO                └───────────────▲───────────────┘   └── UDP/MPEG-TS ─► OBS mixer
  clip sound ──┐                       │
  NTS radio ───┴─► ffmpeg ─► PCM ─► low/mid/high bands ─► LFOs on any param
```

Python 3.7+ engine, two platform backends: desktop = pygame + OpenGL 2.1;
Pi = ctypes straight into the legacy Broadcom stack (dispmanx EGL + GLES2,
no X, no SDL) with evdev gamepad input — the same platform recurBOY and the
RetroPie openFrameworks synths target.

## Effects

| shader | what it does | origin / homage | license |
| --- | --- | --- | --- |
| `waaave` + 4 banks | feedback zones: mix/lumakey, drift, color life/death, mirrors | fresh implementation of [waaave_pool](https://github.com/ex-zee-ex/waaaave_pool) techniques | GPL-3.0 (this project; no upstream code — see [CREDITS](CREDITS.md)) |
| `chromab` | brightness-band colorizer / solarizer | CHROMATIC_ABERRATION | GPL-3.0 (this project) |
| `lifeosc` | chaotic video oscillators, video-phase-modulated | artificial_life | GPL-3.0 (this project) |
| `slitscan` | moving scanline freezes time across space | temporal_vortex | GPL-3.0 (this project) |
| `haeckel` | superformula radiolaria with feedback trails | SUPER_HAECKEL_ADVENTURES_64 | GPL-3.0 (this project) |
| `gravity` | orbiting attractor lenses the feedback | gravity_waaaves | GPL-3.0 (this project) |
| `cellular` | numerical-feedback automata seeded by video | integerfeedback / CA lab | GPL-3.0 (this project) |
| `ascii`, `gameboy`, `colorize`, `feedback` | terminal glyphs, 4-shade dither, color, trails | original | GPL-3.0 (this project) |
| `packs/recurboy/*` | 15 shaders, **verbatim** | official r_e_c_u_r collection | GPL-3.0 (upstream, © Tim Caldwell & contributors — [pack LICENSE](packs/recurboy/LICENSE)) |

Every effect exposes exactly **3 params + speed** (the recurBOY convention),
so any effect maps to the same controls, and every param can follow the
music.

## Controls (GPi physical labels)

The control bar reads left-to-right: `[mix] zoom drift spd src aud`.

| control | action |
| --- | --- |
| d-pad ←/→ | pick a slot in the bar |
| d-pad ↑/↓ | turn it (hold to sweep) |
| A (hold) | punch — slam the selected param, spring back |
| B | dice — randomize params |
| Y | freeze — stop time |
| X (tap) | LFO on/off for selected param |
| **X (hold) + ↑/↓** | LFO band: ALL → low → mid → high (`~ ~L ~M ~H`) |
| L / R | prev / next effect (or deck scene in play mode) |
| Start | the Loader menu (below) |
| Select (tap) | overlay: bar → help panel → hidden |
| **Select + A** | stack current effect as a layer (chain up to 3) |
| **Select + B** | clear layers |
| **Select + ↑/↓** | pick which layer you're editing (multi-row bar) |
| **Select + L/R** | deck BUILD ↔ PLAY mode |
| **Select + Start** | quit to EmulationStation |

Desktop keys: arrows, Z punch, X dice, C freeze, V LFO (hold V+↑/↓ bands),
A/S shoulders, Tab loader, M build/play, L stack, Backspace clear layers,
[ ] layer focus, F1 overlay, F5 screenshot, Esc quit.

## The Loader (Start)

```
Video source :  <playlist collections → videos, camera, plasma>
Audio source :  no audio / video's own sound / NTS 1 / NTS 2
Output       :  screen only / to mixer (laptop) / record to SD / go live
FX deck      :  effect setlists from every pack (live-switchable)
My deck      :  your saved scenes — save, play, delete (Y)
```

A enters/applies, B backs out, Start closes. Everything applies live —
video keeps playing behind the menu.

## Decks

A **scene** = effect + params + LFO routing + layer stack (video/audio stay
live choices — the same deck plays over any feed). In **BUILD** mode L/R
browses effects while you save scenes; in **PLAY** mode L/R walks your
saved scenes. Decks persist on the device (`playlists/deck.json` per pack).
Carts: *Build Setlist* boots building, *Play Setlist* boots into scene 1.

## Content packs

```
packs/<name>/
  pack.json          name, artist, description
  shaders/*.frag     effects (+ optional .json sidecar: param names/help)
  clips/<playlist>/  videos, one folder per collection
  playlists/*.json   effect setlists; deck.json = the user's saved deck
```

Pull videos from YouTube (playlists become collections automatically):

```sh
.venv/bin/python ytget.py "https://youtube.com/playlist?list=..." --push
```

## Outputs

- **to mixer** — MPEG-TS over UDP to a laptop. In OBS: Media Source, input
  `udp://0.0.0.0:5001`, format `mpegts`. ~0.5 s latency over WiFi.
- **record to SD** — mp4s land in the pack's clips and instantly become
  sources: perform, stop, remix your own performance.
- **go live** — RTMP via the Pi's hardware H.264 encoder. Put your endpoint
  in `stream.json` (gitignored): `{"url": "rtmp://a.rtmp.youtube.com/live2",
  "key": "...", "mixer": "udp://your-laptop.local:5001?pkt_size=1316"}`

## Shader authoring

GLES2 fragment shaders, no `#version`/`precision` lines (the loader prepends
per-platform). Uniforms provided:

```glsl
varying vec2  v_texcoord;
uniform sampler2D u_tex0;    // source (or previous layer)
uniform sampler2D u_tex1;    // previous output frame — feedback!
uniform sampler2D u_atlas;   // ASCII glyph strip
uniform sampler2D u_dither;  // 4x4 Bayer matrix
uniform vec2  u_resolution;
uniform float u_time;
uniform float u_x0, u_x1, u_x2;       // the 3 performance params, 0..1
uniform float u_a0, u_a1, u_a2;       // live audio: bass, level, highs
uniform float ftime; uniform vec4 fparams;  // legacy conjur compat
```

Drop a `.frag` in a pack's `shaders/`, reference it from a playlist, done.

## Hardware notes

- GPi Case 2W + Pi Zero 2 W: 640×480 DPI screen, legacy Broadcom driver
  (**do not** enable vc4-kms), controls appear as an Xbox 360 pad, ~20 fps
  single effect / ~15 fps with layers. Only 237 MB RAM reaches Linux —
  the engine is built lean for it (no numpy on the Pi).
- Video input beyond the SD card: a UVC USB capture dongle (composite or
  HDMI) reads through the same ffmpeg pipe — the VSERPI approach.
- Buster's apt is EOL: the installer uses piwheels + a static ffmpeg.

## Project structure

```
main.py              engine: platforms, sources, chain renderer, loader, decks
glshim.py            GL import switch (PyOpenGL vs pi_backend)
pi_backend.py        dispmanx EGL + GLES2 via ctypes, evdev input, PIL text
ytget.py             YouTube → 320x240 clips (+audio), playlist collections
launch.sh, pi/       RetroPie launcher, installer, starter carts (.vsb)
packs/demo/          starter effects + your clips     packs/recurboy/  GPL shaders
docs/SD_CARD_GUIDE.md   pressing a full SD card image
```

## Origin projects

This instrument stands on the Raspberry Pi video-synth scene's shoulders:
[Andrei Jay](https://andreijaycreativecoding.com)'s waaave_pool / VSERPI
family (techniques reimplemented fresh — his code carries no license),
[cyberboy666 / Tim Caldwell](https://github.com/cyberboy666)'s r_e_c_u_r,
recurBOY and conjur (GPL-3; shader convention adopted, collection shipped
verbatim), and the [scanlines.xyz](https://scanlines.xyz) community.

## License

GPL-3.0. Full attribution and license-compatibility audit in
[CREDITS.md](CREDITS.md). Downloaded video content is yours and stays out
of this repo.
