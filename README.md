# VFX Deck

**A handheld video effects console.** Runs on the Retroflag GPi Case
(Pi Zero 2W) and on desktop. Plays video (YouTube pulls, camera, generative),
melts it through a library of live effects — including fresh implementations
of the waaave_pool / VSERPI instrument family and verbatim r_e_c_u_r
community shaders — reacts to music (clip audio or NTS radio), records
itself, and broadcasts (RTMP live, UDP to a laptop mixer). Scenes save into
performable decks. GPL-3.0.

## Run

```sh
.venv/bin/python main.py                 # play (plasma source, playlist set1)
.venv/bin/python main.py --source clip   # loop the demo clip
.venv/bin/python main.py --source cam    # webcam (macOS will ask permission)
```

Smoke test without touching the keyboard:

```sh
.venv/bin/python main.py --frames 60 --step 4 --screenshot shots/out.png
```

## Controls (GPi button → keyboard)

The control bar reads left-to-right: `[mix] zoom drift spd src`.

| GPi (physical)   | Keyboard | Action                                  |
| ---------------- | -------- | --------------------------------------- |
| D-pad left/right | ← / →    | pick a control in the bar               |
| D-pad up/down    | ↑ / ↓    | turn it (up = more, hold to sweep)      |
| A (hold)         | Z (hold) | punch — slam selected param, spring back |
| B                | X        | dice — randomize params                 |
| Y                | C        | freeze — stop time (toggle)             |
| X                | V        | LFO — auto-wobble selected param        |
| L / R shoulder   | A / S    | prev / next effect (feedback survives!) |
| Start            | Tab      | next video input (gen / clips / cam)    |
| Select           | F1       | overlay: bar → help panel → hidden      |
| Select+Start     | Esc      | quit                                    |
| —                | F5       | screenshot to `shots/`                  |

GPi note: the shell's X/Y labels are swapped vs. what its controller chip
reports, so the help text uses physical labels. A USB gamepad works too.
When the UI is hidden, any change flashes the bar for 2 seconds.

## Shader convention (recurBOY / glslViewer compatible)

Every effect is one fragment shader in `packs/<pack>/shaders/`, speaking the
cyberboy666 ecosystem convention so community shaders can drop in:

- `u_tex0` — source frame, `u_tex1` — previous output frame (feedback)
- `u_time`, `u_resolution`
- `u_x0 u_x1 u_x2` — normalized 0–1 performance params
- extras provided by this engine: `u_atlas` (ASCII glyph strip),
  `u_dither` (4×4 Bayer matrix)

Shader files contain **no `#version` and no `precision` lines** — the loader
prepends a per-platform preamble. Keep shader bodies GLES2-compatible
(`attribute`/`varying`, `texture2D`, `gl_FragColor`) so they run unchanged on
the Pi Zero 2W.

## Content packs

```
packs/demo/
  pack.json          # name, artist, description
  shaders/*.frag     # effects (leading _ = engine internals, not playlist-able)
  clips/*.mp4        # source footage
  playlists/*.json   # ordered setlists: {shader, x:[..], speed}
```

A playlist step is a *patch* — effect plus parameter snapshot — so the same
shader can appear multiple times with different settings. L/R walks the list.

## Pi port notes (next phase)

- Target: GPi Case 2W + Pi Zero 2 W (VideoCore IV — same GPU family as Pi 3B+,
  which is what the classic scanlines.xyz synths target).
- recurBOY (github.com/langolierz/recurBOY) is openFrameworks (C++) with a
  Python display driver — its `conjur` shader player (ofxVideoArtTools) is
  what defines the uniform convention above. Port options: gamepad-ify
  ofRecurBoy, or bring this Python engine up on GLES2/KMS.
- Launch from RetroPie as a custom EmulationStation system: each playlist (or
  pack) is a "ROM"; runcommand launches the synth and returns to ES on exit.
- Zero 2W has a hardware H.264 encoder → record-to-SD and RTMP streaming.

## MVP status

Working: plasma source, demo clip, webcam source, ASCII filter (mono/color),
Matrix rain (pure rain ↔ source reveal), Game Boy 4-shade dither, waaave-style
feedback, colorize, playlist cycling, param editing, overlay UI, screenshots.
