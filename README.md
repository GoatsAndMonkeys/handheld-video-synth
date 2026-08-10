# HVS-80

**A pocket computer for video effects.** The **HVS-80** — **H**andheld
**V**ideo **S**ynth, with a model number tipping its hat to the legendary
TRS-80 — turns a Retroflag GPi Case
(currently the Raspberry Pi Zero 2 W — alpha hardware, see note below)
into a handheld video effects console: it plays video
(YouTube pulls, camera, generative), melts it through a library of live GLSL
effects, reacts to music (each clip's own sound or NTS internet radio),
records itself, and broadcasts — RTMP live streams or UDP straight into a
laptop running OBS as a mixer. Effect scenes save into performable **decks**
you walk through with the shoulder buttons, LSDJ-style. Also runs on desktop
(macOS/Linux) for building sets and effects.

GPL-3.0 · shaders speak the [r_e_c_u_r](https://github.com/cyberboy666/r_e_c_u_r)
/ glslViewer convention, so community shaders drop in verbatim.

> **Alpha hardware note.** This version runs on the **Raspberry Pi
> Zero 2 W** in the GPi Case 2W, but the project is transitioning to the
> **CM4** (GPi Case 2) — more power for deeper layer stacks, higher
> framerates, and live capture input. The Zero 2 W is the *alpha*
> platform only: **don't buy one for this project unless you already own
> one** — wait for the CM4 build.

## Quick start

There are two ways to run it. **Desktop** (macOS/Linux) is the fastest way
to try the effects and build sets. **Handheld** is the real thing: a GPi
Case 2W running RetroPie, with the synth installed as a game shelf.

### Desktop, from zero

1. **Prerequisites** — Python 3 and ffmpeg. On macOS:

   ```sh
   brew install python ffmpeg
   ```

   (Linux: `sudo apt install python3 python3-venv ffmpeg` or your distro's
   equivalent. Windows isn't supported natively — use WSL.)

2. **Get the code:**

   ```sh
   git clone https://github.com/GoatsAndMonkeys/handheld-video-synth
   cd handheld-video-synth
   ```

3. **Install the Python dependencies** into a virtual environment (keeps
   them out of your system Python):

   ```sh
   python3 -m venv .venv
   .venv/bin/pip install pygame PyOpenGL opencv-python numpy yt-dlp
   ```

4. **Run it:**

   ```sh
   .venv/bin/python main.py
   ```

   A window opens showing generated plasma with the control bar along the
   bottom — the synth works out of the box with no video files. Press
   **F1** to cycle the overlay to the help panel; every key is listed
   there (arrows select/turn params, `Z` punch, `X` dice, `Tab` opens the
   Loader menu, `Esc` quits).

5. **Add real videos** (optional but the whole point) — pull a YouTube
   playlist; it becomes a browsable collection in the Loader:

   ```sh
   .venv/bin/python ytget.py "https://youtube.com/playlist?list=YOUR_PLAYLIST"
   ```

   Then run the synth again, press `Tab` → *Video source* → your playlist.

### Handheld (GPi Case 2W), from zero

You need: a Retroflag **GPi Case 2W**, a **Pi Zero 2 W**, a 16 GB+ microSD
card, 2.4 GHz WiFi, and a computer with `ssh`/`rsync` (macOS/Linux/WSL).
(This is the *alpha* hardware — only build one if you already own the
Zero 2 W; the project is moving to the CM4, see the note above.)

1. **Set up the Pi itself** — flash **RetroPie 4.8** to the SD card,
   enable WiFi + SSH before first boot, and install Retroflag's screen
   driver. This is the longest part and it's covered click-by-click in
   **[docs/SD_CARD_GUIDE.md](docs/SD_CARD_GUIDE.md)** (steps 0–3). If you
   already have a GPi running RetroPie on WiFi, skip ahead.
   *Shortcut:* if a prebuilt image exists on the
   [Releases page](https://github.com/GoatsAndMonkeys/handheld-video-synth/releases),
   flash that instead (guide, Option A) and jump to step 4.

2. **Copy the synth to the Pi and install it** — from your computer,
   inside the cloned repo (step 2 above):

   ```sh
   rsync -az --exclude .venv --exclude .git ./ pi@retropie.local:/home/pi/handheld-video-synth/
   ssh pi@retropie.local 'bash /home/pi/handheld-video-synth/pi/install.sh'
   ```

   (Default SSH password is `raspberry`. If `retropie.local` doesn't
   resolve, use the Pi's IP address from your router.) The installer
   fetches everything else the Pi needs — Python packages, a working
   ffmpeg — and registers the synth in EmulationStation.

3. **Reboot the Pi:**

   ```sh
   ssh pi@retropie.local 'sudo reboot'
   ```

   An **HVS-80** shelf appears in EmulationStation with
   starter carts: *Video Synth Demo*, *Effects Lab*, deck builders, and
   the streaming outputs.

4. **Load your videos** — from your computer, `--push` sends them over
   WiFi to the handheld:

   ```sh
   .venv/bin/python ytget.py "https://youtube.com/playlist?list=YOUR_PLAYLIST" --push
   ```

5. **Play** — open *Video Synth Demo*, press **Start** → *Video source* →
   your playlist. Press **Select** once for the on-screen help panel;
   the full control map is below.

To press your finished setup into a single SD card image others can
flash ("carts"), see [docs/SD_CARD_GUIDE.md](docs/SD_CARD_GUIDE.md)
steps 7–9.

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

| shader | what it does | origin / homage |
| --- | --- | --- |
| `waaave` + 4 banks | feedback zones: mix/lumakey, drift, color life/death, mirrors | [waaave_pool](https://github.com/ex-zee-ex/waaaave_pool) (Andrei Jay) |
| `delay` | true video delay line — echoes from up to ~a second ago | FB_DELAY_REAL / gravity_waaaves (Andrei Jay) |
| `convolve` | morphing blur↔sharpen kernels with feedback resonance | convolutional_chaos (Andrei Jay) |
| `phosphor` | audio-driven Lissajous scope with phosphor decay | phosphorm (Andrei Jay) |
| `glyphworld` | audio-reactive glyph fields over video | glyph_worlds0 (Andrei Jay) |
| `chromab` | brightness-band colorizer / solarizer | CHROMATIC_ABERRATION (Andrei Jay) |
| `lifeosc` | chaotic video oscillators, video-phase-modulated | artificial_life (Andrei Jay) |
| `slitscan` | moving scanline freezes time across space | temporal_vortex (Andrei Jay) |
| `haeckel` | superformula radiolaria with feedback trails | SUPER_HAECKEL_ADVENTURES_64 (Andrei Jay) |
| `gravity` | orbiting attractor lenses the feedback | gravity_waaaves (Andrei Jay) |
| `cellular` | numerical-feedback automata seeded by video | integerfeedback / cellular_automata_lab (Andrei Jay) |
| `ascii`, `gameboy`, `colorize`, `feedback` | terminal glyphs, 4-shade dither, color, trails | original to this project |
| `packs/recurboy/*` | 15 shaders, **verbatim** (GPL-3.0, [pack LICENSE](packs/recurboy/LICENSE)) | official [r_e_c_u_r](https://github.com/cyberboy666/r_e_c_u_r) collection (Tim Caldwell & contributors) |

Attribution and licensing details for every effect: [CREDITS.md](CREDITS.md).

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

- GPi Case 2W + Pi Zero 2 W (**alpha platform** — the CM4 / GPi Case 2 is
  the transition target; don't buy a Zero 2 W for this if you don't
  already have one): 640×480 DPI screen, legacy Broadcom driver
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
