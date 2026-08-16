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
   equivalent. Windows: see the WSL steps below — the engine uses
   Unix-only plumbing, so it doesn't run natively.)

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

### Windows, from zero (via WSL)

The engine relies on Unix pipes, so on Windows it runs inside **WSL 2** —
Microsoft's built-in Linux layer. Windows 11 (or an updated Windows 10)
shows Linux windows natively, so the synth opens like any other app.

1. **Install WSL** — in PowerShell *(run as administrator)*:

   ```powershell
   wsl --install
   ```

   Reboot when prompted; Ubuntu sets itself up and asks you to pick a
   username/password on first launch.

2. **Open the Ubuntu app**, then follow the **Linux** desktop steps above
   inside it:

   ```sh
   sudo apt update && sudo apt install -y python3 python3-venv ffmpeg git
   git clone https://github.com/GoatsAndMonkeys/handheld-video-synth
   cd handheld-video-synth
   python3 -m venv .venv
   .venv/bin/pip install pygame PyOpenGL opencv-python numpy yt-dlp
   .venv/bin/python main.py
   ```

   The synth window appears on your Windows desktop (WSLg). If it
   doesn't, update WSL: `wsl --update` from PowerShell.

3. **Installing to the handheld** works from the same Ubuntu terminal —
   `ssh` and `rsync` are already there, so the GPi steps below apply
   unchanged.

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

   An **HVS-80** shelf appears in EmulationStation with two carts:
   ***HVS-80*** (the instrument — video, audio, effects, and output
   routing all live in the Start menu) and ***Setlist*** (boots straight
   into scene 1 of your saved deck, gig-ready).

4. **Load your videos** — from your computer, `--push` sends them over
   WiFi to the handheld:

   ```sh
   .venv/bin/python ytget.py "https://youtube.com/playlist?list=YOUR_PLAYLIST" --push
   ```

5. **Play** — open *HVS-80*, press **Start** → *Video source* →
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
  clips ─────────┤     │  layer1 ─► layer2 ─► layer3   ├──►│           or desktop GL)
  jellyfin ──────┼──►  │     ▲   feedback buffer   │   │   ├── mp4 recorder ──► clips/
  camera ────────┘     │     └──── prev frame ◄────┘   │   ├── RTMP (YouTube Live)
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
| `waaave` + 4 banks | feedback zones: mix/lumakey, drift, color life/death, mirrors | [waaave_pool](https://github.com/ex-zee-ex/waaaave_pool) (Andrei Jay) — `packs/vserpi` |
| `delay` | true video delay line — echoes from up to ~a second ago | FB_DELAY_REAL / gravity_waaaves (Andrei Jay) — `packs/vserpi` |
| `convolve` | morphing blur↔sharpen kernels with feedback resonance | convolutional_chaos (Andrei Jay) — `packs/vserpi` |
| `phosphor` | audio-driven Lissajous scope with phosphor decay | phosphorm (Andrei Jay) — `packs/vserpi` |
| `glyphworld` | audio-reactive glyph fields over video | glyph_worlds0 (Andrei Jay) — `packs/vserpi` |
| `chromab` | brightness-band colorizer / solarizer | CHROMATIC_ABERRATION (Andrei Jay) — `packs/vserpi` |
| `lifeosc` | chaotic video oscillators, video-phase-modulated | artificial_life (Andrei Jay) — `packs/vserpi` |
| `slitscan` | moving scanline freezes time across space | temporal_vortex (Andrei Jay) — `packs/vserpi` |
| `haeckel` | superformula radiolaria with feedback trails | SUPER_HAECKEL_ADVENTURES_64 (Andrei Jay) — `packs/vserpi` |
| `gravity` | orbiting attractor lenses the feedback | gravity_waaaves (Andrei Jay) — `packs/vserpi` |
| `cellular` | numerical-feedback automata seeded by video | integerfeedback / cellular_automata_lab (Andrei Jay) — `packs/vserpi` |
| `scopexy`, `fourband`, `meshscan`, `autolife` | vector beam on slow phosphor, fixed four-band colorizer/solarizer, luma-displaced wire weave, interfering oscillator fields | phosphorm / CHROMATIC_ABERRATION1 / spectral_mesh + auto_mesh / artificial_life (Andrei Jay) — `packs/vserpi` |
| `ascii`, `gameboy`, `colorize`, `feedback`, `websafe_y2k`, `rgbdelay` | terminal glyphs, 4-shade dither, color, trails, web-safe GIF dither, RGB time split | GoatsAndMonkeys (original to this project) |
| `vhs`, `solarize`, `timegrad`, `halftone`, `melt`, `lumatrail`, `thermal` | tape decay, darkroom tone fold, luma time-split, CMYK print dots, wax drip, comet trails, heat camera | GoatsAndMonkeys (original to this project) |
| `zxclash`, `c64`, `cga`, `virtualboy`, `pico8` | machine palettes: Spectrum attribute clash, pepto C64 with colour cells, CGA with NTSC artifacts, Virtual Boy reds, PICO-8 (+ its hidden palette) | GoatsAndMonkeys — palettes are facts, no code copied |
| `flipdot`, `eink` | flip-dot sign with mechanical lag and scan waves; e-paper ghosting with a travelling full refresh | GoatsAndMonkeys (original to this project) |
| `bitstarve`, `jpegcrush` | the two compression effects, sitting together: a starved video *stream* (stale macroblocks held from the last frame, flat-block quantise with mosquito edges, chroma bleeding across block borders, a rolling keyframe sweep) and a crushed *still* (a real 4x4 DCT quantised to the floor) | GoatsAndMonkeys (original to this project) |
| `risograph`, `photocopy`, `cyanotype` | two-ink riso with misregistration, Nth-generation self-copying photocopier, blueprint / sun print | GoatsAndMonkeys (original to this project) |
| `timeposter`, `motionmilk`, `echostrobe` | time posterized into flipboard ticks, movement painted as light, tinted delay-tap echoes | GoatsAndMonkeys (original to this project) |
| `droste`, `moire` | recursive picture-in-picture spiral, interference fringes drawing the video | GoatsAndMonkeys (original to this project) |
| `ruttetra` | luma lifts scanlines into a wire terrain | homage to the Rutt/Etra scan processor (1972 hardware) |
| `packs/recurboy/*` | 15 shaders, **verbatim** (GPL-3.0, [pack LICENSE](packs/recurboy/LICENSE)) | official [r_e_c_u_r](https://github.com/cyberboy666/r_e_c_u_r) collection (Tim Caldwell & contributors) |

The `packs/vserpi` rows are **clean-room reimplementations** after Andrei
Jay's instruments — his repositories carry no determinable licence, so none
of his code is here; they ship under his lineage's own name rather than
under ours ([`packs/vserpi/CREDITS.md`](packs/vserpi/CREDITS.md)).

Attribution and licensing details for every effect: [CREDITS.md](CREDITS.md).

Every effect exposes **3 params + speed** (the recurBOY convention), so any
effect maps to the same controls, and every param can follow the music. A
shader that declares `u_x3` gets a **fourth** knob; one that never reads the
clock loses its speed slot. The bar only ever shows knobs that do something.

## Controls (GPi physical labels)

The control bar reads left-to-right: `[mix] zoom drift spd` — the effect's
params then speed, with a fourth param appearing for shaders that use one.
Video and audio sources are chosen in the Loader, not the bar.

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
| **Select + A** | stack current effect as a layer (chain up to 5) |
| **Select + B** | drop the focused layer — on the live effect it pops the stack, un-freezing the layer beneath |
| **Select + ↑/↓** | pick which layer you're editing (multi-row bar) |
| **Select + L/R** | deck BUILD ↔ PLAY mode |
| **Select + Start** | quit to EmulationStation |

Desktop keys: arrows, Z punch, X dice, C freeze, V LFO (hold V+↑/↓ bands),
A/S shoulders, Tab loader, M build/play, L stack, Backspace clear layers,
[ ] layer focus, F1 overlay, F5 screenshot, Esc quit.

## MIDI

Plug a class-compliant USB MIDI controller in and it plays the instrument
alongside the buttons — knobs on the params, pads on the actions, program
changes on the patches. Nothing to install: the Pi reads ALSA's raw MIDI
devices directly, the desktop uses `pygame.midi`. No controller attached
changes nothing.

| MIDI | does |
| --- | --- |
| CC (mapped) | sets a param on the focused effect — absolute, so the knob's position *is* the value |
| pitch bend | rides whichever knob is selected, no mapping needed |
| note (mapped) | any button action — `next`, `prev`, `punch_on`, `freeze`, `randomize`, `layer_add`, … |
| program change | jumps to that patch in the active deck — **with the morph time applied**, so a sequencer can glide your set |

Defaults assume a generic keyboard (CC 1 → x0, then 71/74/76 → x1/x2/x3,
CC 7 → speed). To use your own controller's numbers, run `python3 midi.py`,
move every control, note what it prints, and write a `midi.json` next to
`main.py`:

```json
{
  "channel": 1,
  "cc":    {"21": "x0", "22": "x1", "23": "x2", "24": "x3", "25": "speed"},
  "notes": {"36": "next", "35": "prev", "38": "punch_on", "40": "freeze"}
}
```

`channel` is optional (omit for omni). A CC mapped to a button name works
too — pads that send 127/0 instead of notes fire on the upper half of the
travel. Each section you write replaces that default section wholesale, so
you never inherit a stray default grabbing a knob you didn't map.

## Jellyfin

Point the synth at your own [Jellyfin](https://jellyfin.org) server and
your film library becomes a video source — the Loader lists it beside the
clip collections. Put a `jellyfin.json` next to `main.py` (gitignored,
like `stream.json`):

```json
{"url": "http://your-server:8096", "api_key": "..."}
```

The API key comes from Jellyfin's dashboard (*Administration → API Keys*);
`username`/`password` works instead if you prefer. The server transcodes
to 480×360 H.264 on the way out, so the handheld never tries to decode a
4K remux — the transcode is the point, not a compromise. Titles are cached
on disk so the menu opens instantly and works offline; **✱ refresh library
from the server** in the Jellyfin folder re-reads it.

## The Loader (Start)

```
Video source :  <playlist collections → videos, camera, plasma,
                 Jellyfin library if configured>
Audio source :  no audio / video's own sound / NTS 1 / NTS 2
Output       :  screen only / to mixer (laptop) / record to SD / go live
                + "show UI in output" — put the control bar, menus and
                  FPS in the stream (demo mode; normally output is clean)
FX deck      :  effect setlists from every pack — your own first, then
                the homages and guest packs, each with its effect count
                and credit
Patch decks  :  named decks — build, name, reorder, copy patches, and the
                morph time (see Decks)
```

A enters/applies, B backs out, Start closes. Everything applies live —
video keeps playing behind the menu.

## Decks

A **scene** = effect + params + LFO routing + layer stack (video/audio stay
live choices — the same deck plays over any feed). You can keep **multiple
named decks** — one per gig, one per mood. In **BUILD** mode L/R browses
effects while you save scenes; in **PLAY** mode L/R walks the active deck's
scenes.

**Morphing.** By default a patch change is a hard cut. Set a **morph**
time in the *Patch decks* menu (0.25 s to 8 s) and walking patches glides
instead: every knob eases from where it is to where the next patch wants
it, so a set breathes between scenes rather than snapping. Only slots
still running the same shader can glide — params mean different things to
different effects, so a changed effect takes its own values at once. The
bar shows **MORPH** while a glide is in flight, and the numbers on it are
the patch you are gliding *to*. Walking three patches in a second glides
continuously through them; turning a knob mid-glide edits the destination,
and the glide follows it. The setting persists in `decks.json`.

The *Patch decks* menu is the deck manager: **A** opens a deck (or plays a
scene), **X** renames a deck or scene with the on-screen keyboard
(d-pad picks letters, LSDJ-style), **Y** deletes, **Select+↑/↓** reorders
scenes, and **L/R on a scene copies it into the neighboring deck**.
Decks persist on the device (`playlists/decks.json` per pack). The
*Setlist* cart boots straight into scene 1 of the active deck.

## Content packs

```
packs/<name>/
  pack.json          name, artist, description
  shaders/*.frag     effects (+ optional .json sidecar: param names/help)
  clips/<playlist>/  videos, one folder per collection
  playlists/*.json   effect setlists; decks.json = the user's named decks
```

Thirteen packs ship with the instrument. The FX deck lists one row per pack —
`<pack> <effects> — <artist>` — so a pack is the unit an artist ships and the
unit you browse. Per-pack `CREDITS.md` files carry the per-shader provenance;
ported packs also ship the upstream `LICENSE`:

| pack | what | provenance |
| --- | --- | --- |
| `hvs80-synth` | the house instrument: feedback, colour grading, optical recursion, tape and camera character, time manipulation | original to this project |
| `vserpi` | 18 effects after the waaave_pool / VSERPI family: warped feedback zones and banks, gravity lensing, delay lines, convolution chaos, scopes, glyph fields, automata | clean-room after [Andrei Jay](https://andreijaycreativecoding.com) (no licence upstream → no code copied) |
| `recurboy` | 15 shaders, verbatim | [r_e_c_u_r](https://github.com/cyberboy666/r_e_c_u_r) collection, GPL-3.0 |
| `recur` | five 2-input mixers, ported | r_e_c_u_r, GPL-3.0 |
| `hvs80-glitch` | signal damage: datamosh, sync corrupt, TBC stutter, circuit bending | original to this project |
| `hvs80-pixel` | reproduction processes: dither, palette crush (Game Boy, C64, CGA, Spectrum, PICO-8, Virtual Boy), print inks, glyph art, flip-dot and e-ink displays, codec damage (JPEG DCT and starved MPEG) | original to this project |
| `libretro` | 19 CRT/LCD/retro ports | [common-shaders](https://github.com/libretro/common-shaders), per-file licences (PD/MIT/GPL) |
| `bzzzbz` | four analog-style generators, ported | [bzzzbz](https://github.com/daviderovell0/bzzzbz), GPL-3.0 |
| `eyesy` | six EYESY modes, reimplemented from Python | [Critter & Guitari](https://github.com/critterandguitari/EYESY_OS), BSD |
| `partymode` | 9 geometric party pieces, clean-room | after [Mathew Preziotte](https://github.com/preziotte) (no licence upstream → no code copied) |
| `hydra` | six Hydra generators/warps, reimplemented | after [Olivia Jack](https://github.com/hydra-synth/hydra)'s vocabulary, AGPL upstream, no code copied |
| `livecode` | six pieces after the [livecode.nyc](https://livecode.nyc/tools) scene | 3 adapted from [The Force](https://github.com/shawnlawson/The_Force) (MIT, Shawn Lawson), 3 clean-room after la habra & bl4st |
| `milkdrop` | four MilkDrop engine constructions: per-pixel warp field, scope ribbon, video echo, spiral tunnel — engine only, no presets | after [MilkDrop](https://github.com/milkdrop2077/MilkDrop3) (Ryan Geiss; BSD-3-Clause via the MilkDrop3/BeatDrop lineage) |

Third-party packs install with `python3 tools/packget.py <zip|url|folder>` —
validated first, then synced to the deck. Your own original packs are yours
to share or **sell** (itch.io with 0% revenue share, or a tip link in
`pack.json`) — see [PLUGINS.md](PLUGINS.md) §8.

Pull videos from YouTube (playlists become collections automatically):

```sh
.venv/bin/python ytget.py "https://youtube.com/playlist?list=..." --push
```

## Outputs

- **to mixer** — MPEG-TS over UDP to a laptop. In OBS: Media Source, input
  `udp://0.0.0.0:5001`, format `mpegts`. ~0.5 s latency over WiFi.
  - **Discord (no OBS)**: run `tools/watch.sh` on the laptop — a plain
    low-latency window showing the handheld — then Discord → **Go Live**
    → share that window. (Discord has no stream-in URL, so something on
    the laptop has to show the video; this is the lightest something.)
  - **Discord audio**: the stream already carries the synth's sound —
    use Go Live's "share audio" toggle if your Discord has it; otherwise
    `brew install blackhole-2ch`, make a Multi-Output Device
    (speakers + BlackHole) in Audio MIDI Setup, and set Discord's mic
    input to BlackHole. Either way, turn **off** Discord's Noise
    Suppression / Echo Cancellation / Auto Gain — voice processing
    eats music.
  - **Discord as a camera**: OBS → *Start Virtual Camera* → pick "OBS
    Virtual Camera" in a voice channel.
- **record to SD** — mp4s land in the pack's clips and instantly become
  sources: perform, stop, remix your own performance.
- **go live** — RTMP via the Pi's hardware H.264 encoder. Put your endpoint
  in `stream.json` (gitignored): `{"url": "rtmp://a.rtmp.youtube.com/live2",
  "key": "...", "mixer": "udp://your-laptop.local:5001?pkt_size=1316"}`

## Gameplay capture

The other half of this card is RetroPie, and RetroArch already knows how to
record what it is emulating. So the handheld films its own games and hands
them to the synth: **play a level, quit, melt it.**

Turn it on once, on the Pi:

```sh
ssh pi@retropie.local 'bash /home/pi/handheld-video-synth/pi/emurec_setup.sh'
```

It checks that your RetroArch was built with the ffmpeg recorder, points
recording at a staging folder, installs an encoder preset tuned for a Zero 2W
running a game *and* an encoder at once, and hooks the ingest onto RetroPie's
`runcommand-onend.sh`. Nothing else about your emulators changes, every line
it displaces is kept commented in place, and `--undo` puts it all back.

Then, in any game:

| control | action |
| --- | --- |
| **Select + Y** | start recording · press again to stop |

Quit the game and the capture becomes a 320×240 30fps mp4 in
`packs/hvs80-synth/clips/emulator/` — the same shape as every other clip on
the card — which the Loader lists as the **emulator** collection, with the
game's own sound available as the audio source. A fourth cart, ***Gameplay***,
sweeps anything outstanding and boots straight onto the session you just
played.

What it captures is the core's *raw framebuffer* — 256×240 from a NES, 240×160
from a GBA, landing 1:1 in the clip with no resampling at all — not the
screen. That costs the GPU nothing, keeps RetroArch's own shaders and menus
out of the picture, and is the only thing that works on this display driver
anyway. Recording is software H.264 on the CPU, so expect 8-bit and light
16-bit cores to hold their framerate and anything already marginal to stop
being playable while the recorder is on.

The full design — every config key and why, what was rejected, the
performance numbers, and an honest list of what could not be tested without
the handheld — is in
**[docs/EMULATOR_CAPTURE.md](docs/EMULATOR_CAPTURE.md)**.

```sh
python3 tools/emurec.py --list     # what is staged and waiting
python3 tools/emurec.py            # sweep it by hand
```

## Web console

A third cart, ***Web Server***, turns the handheld into a small web server
on your WiFi instead of an instrument. Launch it and the screen prints the
URL; open that on a phone or laptop on the same network to:

- **watch and download recordings** — every `rec_*.mp4` from every pack,
  playable in the browser (byte ranges are served, so scrubbing works on
  iOS), and deletable when the card fills up
- **upload videos** straight into a pack's clip collection, so a clip you
  found on your phone is a source on the handheld without a laptop
- **install packs** — upload a `.zip`; it is validated with
  `tools/checkpack.py` and refused outright if it has errors
- **export a pack** as a zip (shaders, playlists, credits — never your
  clips): the same bundle another HVS-80 installs, or that you upload to
  itch.io
- **import and export decks** — pull `decks.json` off the device to back up
  or share a set, push one back to load it. The previous file is always kept
  as `decks.bak.json`

It is stdlib-only Python, so nothing is installed on the Pi, and there is
**no password**: anyone who can reach the port can write files into
`packs/`. It is a home-LAN tool — don't run it on café WiFi. Port defaults
to 8080 (`HVS_WEB_PORT` overrides). `python3 tools/webui_smoke.py` runs 26
checks against a throwaway copy of the tree.

## Shader authoring

The full pack-author contract — folder layout, every uniform, the GPU's
limits, JSON schemas, a first-effect walkthrough and the validator — is in
[PLUGINS.md](PLUGINS.md). The short version:

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
- Video sources decode at 320×240 on the Zero 2W — a deliberate choice,
  not just a budget one: it's an exact 2× integer scale to the 640×480
  screen, so pixels stay bit-perfect chunky instead of scaling-blurred.
  (Full-res decode — `--fullres`, the desktop default — was measured
  unviable on the Zero 2W: it saturates a CPU core just moving pixels.
  Full-res sources are a CM4 feature.)
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
osdfont.py           the menu face: a 5x8 bitmap font drawn for this project
midi.py              USB MIDI in (raw ALSA on the Pi, pygame.midi desktop)
jellyfin.py          Jellyfin library browse + transcode URLs (stdlib only)
ytget.py             YouTube → 320x240 clips (+audio), playlist collections
tools/emurec.py      RetroArch gameplay captures → 320x240 clips
launch.sh, pi/       RetroPie launcher, installer, starter carts (.vsb),
                     gameplay-capture setup + RetroArch record preset
packs/               thirteen effect packs (see Content packs) + your clips
docs/SD_CARD_GUIDE.md   pressing a full SD card image
docs/EMULATOR_CAPTURE.md  recording RetroPie gameplay into the clip library
```

## Origin projects

This instrument stands on the Raspberry Pi video-synth scene's shoulders:
[Andrei Jay](https://andreijaycreativecoding.com)'s waaave_pool / VSERPI
family (techniques reimplemented fresh — his code carries no license — and
shipped under his lineage's own name as [`packs/vserpi`](packs/vserpi/CREDITS.md)),
[cyberboy666 / Tim Caldwell](https://github.com/cyberboy666)'s r_e_c_u_r,
recurBOY and conjur (GPL-3; shader convention adopted, collection shipped
verbatim), and the [scanlines.xyz](https://scanlines.xyz) community.

## License

GPL-3.0. Full attribution and license-compatibility audit in
[CREDITS.md](CREDITS.md). Downloaded video content is yours and stays out
of this repo.
