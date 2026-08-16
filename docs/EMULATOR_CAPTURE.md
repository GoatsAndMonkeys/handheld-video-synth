# Recording the emulators

*How gameplay from the RetroPie side of this card becomes a video source on
the synth side, why it is done the way it is, and what could not be checked
without the handheld in hand.*

The handheld already runs RetroPie. RetroPie already runs RetroArch.
RetroArch already knows how to record what it is emulating. So the shortest
honest path is not to build a screen recorder at all — it is to turn on the
one that is already installed, point it somewhere useful, and normalise what
comes out into a clip like any other.

Play a level, quit the game, open the synth: the session is sitting in the
Loader under **emulator**, with its own sound, ready to be melted.

---

## The decision

**RetroArch's built-in ffmpeg record driver, capturing the core's raw
framebuffer, toggled by a hotkey, staged as Matroska, and transcoded to a
320x240 mp4 clip when the emulator exits.**

Nothing screen-scrapes. Nothing touches the GPU. The synth is not running
while any of it happens.

```
  in a game            when you quit                when you launch the synth
  ──────────           ─────────────                ─────────────────────────
  Select + Y     →     runcommand-onend.sh    →     packs/hvs80-synth/
  RetroArch's          fires tools/emurec.py          clips/emulator/*.mp4
  ffmpeg recorder      (nice 19, background)        = the "emulator"
       ↓                      ↓                       collection in the Loader
  ~/gameplay/          320x240 30fps mp4,
  <game>.mkv           game audio as AAC
  (256x240, 30fps,
   FLAC, core's
   own framebuffer)
```

### Why the core's framebuffer, not the screen

`video_gpu_record = false` makes RetroArch encode the frame the *core*
produced — 256x240 for NES, 256x224 SNES, 240x160 GBA — straight out of
memory, before any scaling, shader or overlay. It is the cleanest possible
signal and it costs the GPU nothing.

The alternative, `video_gpu_record = true`, does a `glReadPixels` of the
whole viewport every single frame. On this device that is wrong three times
over:

1. it stalls the graphics pipeline the emulator is drawing with,
2. it bakes in RetroArch's own CRT shaders, overlays and menus — we want the
   picture clean so *our* effects are the ones doing the work,
3. **it does not work here anyway.** The dispmanx video driver, which is what
   this Pi uses, has `read_viewport = NULL`
   ([`gfx/drivers/dispmanx_gfx.c`](https://github.com/libretro/RetroArch/blob/master/gfx/drivers/dispmanx_gfx.c)),
   so RetroArch silently falls back to the framebuffer path regardless.

One consequence worth knowing: hardware-rendered cores (N64, PSX with a GL
renderer) force `video_gpu_record` on by themselves, which on dispmanx means
they will record nothing useful. That is a limitation of the platform, not of
this design, and those cores do not run acceptably on a Zero 2 W anyway.

### Why a hotkey and not "record everything"

Because this is an instrument, not a DVR. You want the thirty seconds where
the boss explodes, not forty minutes of the menu. `--record` on the command
line would capture whole sessions and fill the card; the hotkey records what
you meant to record.

The cost is that RetroArch ships the recording toggle **unbound** in every
default keybind set (`config.def.keybinds.h` lists
`RETROK_UNKNOWN, RARCH_RECORDING_TOGGLE, NO_BTN, NO_BTN`), so
`pi/emurec_setup.sh` has to name a button — see *The unverifiable parts*.

### Why Matroska into a staging folder, and not mp4 straight into the pack

Two reasons, and the first one is a scar this project already has.

**mp4 does not survive an interrupted write.** A recording that ends with a
flat battery, a wedged core or a yanked cartridge leaves an mp4 with no
`moov` atom: every byte present, nothing able to play it. The engine's own
recorder learned this the expensive way (`Streamer.close()` in `main.py`
still carries the comment about a take that got killed mid-flush and lost its
index). Matroska writes clusters as it goes and plays up to wherever it
stopped. The mp4 is made afterwards, deliberately, from a file that is
already complete.

**Staging keeps half-written files away from the loader.** `Sources._scan()`
globs `packs/*/clips/**/*.mp4` and will happily open anything it finds. A
capture in progress inside that folder is a source that opens and then dies.
Captures live in `~/gameplay/` until they are whole; the finished clip is
written as `.part` and *renamed* into place, which is atomic.

### Why the clips end up at 320x240, 30fps

Because that is what every other clip on this card is, and the reason is in
the README's hardware notes: 320x240 is an exact 2x integer scale to the
640x480 screen, so pixels stay square and chunky instead of scaling-blurred.
Game footage is the material that benefits from this most.

`tools/emurec.py` fits the capture inside 320x240 **without ever scaling it
up**, then letterboxes:

| core | native | in the clip | resampled? |
| --- | --- | --- | --- |
| NES | 256x240 | 256x240, bars left/right | no — 1:1 |
| SNES | 256x224 | 256x224, bars all round | no — 1:1 |
| Mega Drive | 320x224 | 320x224, bars top/bottom | no — 1:1 |
| Game Boy | 160x144 | 160x144, centred | no — 1:1 |
| GBA | 240x160 | 240x160, centred | no — 1:1 |
| PS1 | 320x240 | 320x240, exact fill | no — 1:1 |

Every core the Zero 2 W can actually run lands 1:1. The ffmpeg `scale`
expression that achieves this is deliberately *not*
`force_original_aspect_ratio=decrease`, which fits **and upscales** — it
would blow a 240x160 GBA frame up to 320x213 and smear every pixel edge for
nothing. Anything that genuinely is too big (an N64 core at 640x480) is
downscaled with **nearest-neighbour**, because the material is pixel art.

Letterbox rather than crop, for the same reason `tools/ingest_clips.py` does:
cropping a game screen throws away the score, the health bar and half the
level, and you cannot get them back. `--stretch` is there for anyone who
would rather lose the edges than see bars.

### Why the transcode happens on the Pi and not on a laptop

Because the point is that the handheld is self-contained: record on the sofa,
melt on the sofa. `tools/emurec.py` is stdlib-only Python 3.7 and shells out
to the same static ffmpeg `pi/install.sh` already installs, so it adds
nothing to the device.

It is not free, though — see *Performance* — which is why it runs `nice -n 19`
in the background from the `runcommand-onend` hook, at a moment when the only
thing competing with it is EmulationStation redrawing a menu, and never while
the synth is running.

---

## Exactly what gets configured

`pi/emurec_setup.sh` writes this block into
`/opt/retropie/configs/all/retroarch.cfg`, between markers, having commented
out (never deleted) any existing line for the same keys:

```
record_driver              = "ffmpeg"
video_record_quality       = "0"        # CUSTOM — see the warning below
video_record_config        = "/home/pi/handheld-video-synth/pi/hvs_record.cfg"
recording_output_directory = "/home/pi/gameplay/"
video_gpu_record           = "false"
video_post_filter_record   = "false"
video_record_scale_factor  = "1"
video_record_threads       = "2"
input_recording_toggle_btn = "<the pad's Y button number>"
input_recording_toggle     = "f10"      # for a USB keyboard
```

> **`video_record_quality = "0"` is load-bearing.** RetroArch only parses
> `video_record_config` when the quality is `0` = `RECORD_CONFIG_TYPE_RECORDING_CUSTOM`.
> Every other value runs a hardcoded C preset and ignores the config file
> **without saying so** — [libretro/RetroArch#17559](https://github.com/libretro/RetroArch/issues/17559).
> If recordings ever come out looking like `pi/hvs_record.cfg` was never
> read, this is the first thing to check.

The record preset itself is [`pi/hvs_record.cfg`](../pi/hvs_record.cfg), which
carries its own reasoning per key. The short version:

| key | value | why |
| --- | --- | --- |
| `vcodec` | `libx264` | RetroArch's recorder has **no** hardware-encoder path — every built-in preset is libx264/libx264rgb/libvpx, and there is no `hw_device_ctx` anywhere in `record_ffmpeg.c` |
| `video_preset` / `video_tune` / `video_crf` | `ultrafast` / `animation` / `23` | passed through as x264 AVOptions: any key starting `video_` has the prefix stripped and is handed to the encoder |
| `pix_fmt` | `yuv420p` | keeps x264 off `libx264rgb` at `qp 0`, which is the driver's lossless-RGB default and unaffordable here |
| `frame_drop_ratio` | `2` | **the single best lever** — halves the encoder's work at the source, and 60/2 = 30fps is already what every clip is normalised to |
| `scale_factor` | `1` | native core resolution; resizing happens once, later, off the critical path |
| `threads` | `2` | two cores encode, two run the game |
| `acodec` | `flac` | the driver's own default, cheap, and it steps around the standing AAC-recording bug [#13021](https://github.com/libretro/RetroArch/issues/13021) |
| `format` | `matroska` | survives an interrupted write |
| `sample_rate` | *unset* | left alone, RetroArch stamps audio by sample count and video by frame count, so they cannot drift from each other; naming a rate installs a fixed-ratio resampler instead |

A/V sync, for the record, works the same way this project's own recorder
learned to: both streams are timestamped from counters, not wall clock
(`conv_frame->pts = video.frame_cnt++`, `frame->pts = audio.frame_cnt`). They
stay locked to each other by construction. They *can* both drift against real
time if the core does not run at the fps it declares — during slowdown or
fast-forward — and there is no correction for that. In practice a wobbly
gameplay clip is a feature.

### The hook

`/opt/retropie/configs/all/runcommand-onend.sh`, which RetroPie's
`runcommand.sh` calls as `bash "$script" "$SYSTEM" "$EMULATOR" "$ROM"
"$COMMAND"` after the emulator exits (`user_script()` in
[`runcommand.sh`](https://github.com/RetroPie/RetroPie-Setup/blob/master/scriptmodules/supplementary/runcommand/runcommand.sh)).
RetroPie allows exactly one, so if you already had one it is moved to
`runcommand-onend.hvs-prev.sh` and ours calls it first.

Hooks run in a subshell and **cannot modify `$COMMAND`** — which is why
recording cannot be injected as a command-line flag from a hook, and why the
trigger is a hotkey.

---

## What was rejected, and why

**dispmanx / KMS screen capture.** Reading the display back means
`vc_dispmanx_snapshot` or `glReadPixels` on the same VideoCore the emulator
is rendering with, on a machine where the synth alone manages ~20fps. It
would also capture RetroArch's overlays and menus. And on this driver
RetroArch's own GPU-record path is a no-op for exactly this reason
(`read_viewport = NULL`), which is a strong hint about how well the hardware
takes it.

**`raspi2png` / periodic grabs.** Same GPU cost per frame, plus a PNG encode
per frame, plus no audio, plus no timing. Fine for a screenshot; not a video
path.

**`ffmpeg -f fbdev -i /dev/fb0`.** Costs no GPU, and captures nothing: the
libretro cores render through dispmanx, not the Linux framebuffer. `/dev/fb0`
holds the console.

**Recording whole sessions with `--record` on the command line.** This does
work and is a legitimate alternative: RetroPie builds every `lr-*` launch
line into `/opt/retropie/configs/<system>/emulators.cfg`, so a second entry
per system pointed at a wrapper script that inserts
`--record <path> --recordconfig <path>` would give you a "record this game"
choice in the runcommand launch menu. It was rejected as the *default*
because it is per-system surgery on the user's emulator configuration, it
records everything including the bits you did not want, and the card is 16GB.
If you want it, the shape is:

```
lr-fceumm-rec = "/home/pi/handheld-video-synth/pi/hvsrec-wrap.sh /opt/retropie/emulators/retroarch/bin/retroarch -L /opt/retropie/libretrocores/lr-fceumm/fceumm_libretro.so --config /opt/retropie/configs/nes/retroarch.cfg %ROM%"
```

with the wrapper inserting `--record` before the ROM argument. Everything
downstream — staging, the hook, the ingest, the collection — works unchanged.

**Transcoding on the laptop instead of the Pi.** Faster, and it breaks the
thing that makes this device worth carrying.

**Feeding the emulator into the synth live.** Not possible without a capture
device. The README already documents the UVC dongle path for live input; that
is the CM4-era answer to "melt the game as you play it", and it is a
different feature from this one.

---

## Performance

Honest accounting, split into the part that costs you something while you are
playing and the part that does not.

**While recording (unverified on this device — see below).** RetroArch's
encoder runs on its own thread with its own FIFOs, so it is off the emulation
thread, but it is still software x264 on the same four A53s. With
`frame_drop_ratio = 2` it encodes 256x240 at 30fps, which is about 1.8
megapixels a second — roughly a quarter of what a naive 60fps capture would
ask for. The nearest published data point is a Pi 3 B+ recording with
`ultrafast`/`yuv420p`/`threads 3`, where light cores (Nestopia, snes9x,
Genesis Plus GX) were fine and heavy ones (pcsx_rearmed, MAME 2003 Plus) felt
laggy. The Zero 2 W is the same quad A53 at ~1.0 GHz against the 3 B+'s
1.4 GHz, so budget roughly 30% less headroom: expect 8-bit and light 16-bit
cores to hold up and anything already marginal to stop being playable while
recording.

**The transcode afterwards (measured, on a desktop).** 60 seconds of
256x240@60 into a 320x240@30 mp4, single-threaded `libx264 -preset veryfast`
at 320k: **1.38s**, i.e. ~43x realtime, producing 3.2 MB. `ultrafast` was
0.88s (~68x). The Zero 2 W is perhaps 15–25x slower per core for x264, which
puts a single-threaded software ingest at roughly 2x realtime — a ten-minute
session is a five-minute wait.

That is why `tools/emurec.py` reaches for **the Pi's hardware H.264 encoder**
(`h264_v4l2m2m`, `/dev/video11`) when there is one, with the same
`-num_capture_buffers 64` the engine's own recorder needs to stop the driver
deadlocking on four buffers. This is safe here specifically because an ingest
never overlaps the synth: the hook runs after the emulator exits, and
`launch.sh` sweeps before `main.py` starts. If the hardware encoder refuses a
file, the tool says so and retries it in software; `--soft` forces software
outright.

**Storage.** A capture is around 400–800 kbps of video plus FLAC, so roughly
5–8 MB a minute staged, and the finished clip is ~3.2 MB a minute (320 kbps
video + 96k AAC). The staged capture is deleted once the clip exists, so the
card never holds two copies of a session.

---

## The unverifiable parts

Everything below was designed from source and documentation and **could not
be tested**, because the device is a live instrument and this work was done
entirely on a desktop.

1. **Whether this particular RetroArch has the recorder compiled in.**
   RetroPie 4.8's `scriptmodules/emulators/retroarch.sh` only passes
   `--disable-ffmpeg` when `$__os_debian_ver` is older than 9, and installs
   `libavcodec-dev libavformat-dev libavdevice-dev` on 9 and above — so a
   Buster source build should have it. A *pre-compiled binary* install
   inherits whatever the build server produced. The only honest test is on
   the device:

   ```sh
   /opt/retropie/emulators/retroarch/bin/retroarch --features | grep -i ffmpeg
   ```

   `pi/emurec_setup.sh` runs exactly this and refuses to change anything if
   the answer is no. Note that `retroarch --help` listing `--record` proves
   nothing: that getopt entry has no `#ifdef` around it.

2. **The toggle button number.** The GPi's pad enumerates as an Xbox 360 pad
   and button numbering is per-controller, so the setup script reads
   `input_player1_y_btn` out of RetroPie's own joypad autoconfig in
   `/opt/retropie/configs/all/retroarch-joypads/` and prints what it found.
   Y was chosen because RetroPie's default hotkey table leaves it free
   (Select+Start exit, Select+L/R load/save, Select+X menu, Select+B reset,
   Select+←/→ state slot). If Select+Y does nothing in a game, re-run with
   `EMUREC_BTN=<n>`.

3. **The actual frame-rate cost of recording while playing.** No published
   measurement for a Zero 2 W exists and none was taken here. If games
   stutter, the levers in order of effect are `frame_drop_ratio = 3` or `4`,
   then `threads = 1`, then `video_crf = 30`.

4. **`h264_v4l2m2m` as the ingest encoder on this device.** The engine's own
   recorder uses it successfully, which is good evidence, but the ingest's
   filter chain and mp4 muxing were only exercised against `libx264` on a
   desktop. The automatic fallback exists precisely because of this.

5. **Whether RetroArch's dated auto-filename matches what `slug()` strips.**
   The staged name is `<content name>-<date>-<time>.mkv`;
   `tools/emurec.py` strips trailing 6- and 8-digit runs and dashed dates,
   and deliberately does **not** strip short trailing numbers so that
   `Sonic 3` and `Final Fantasy 7` survive. If the real names come out
   differently the clips are still made — they just keep an ugly suffix.

6. **That the Pi's clock will be wrong.** This is not a doubt, it is a
   certainty, and the design assumes it: nothing here orders or names files
   by timestamp. Captures are swept in filename order, "is this file still
   being written" is answered by sampling its size twice rather than reading
   its mtime, the date is stripped out of the name, and the pointer to the
   newest clip is a file (`.latest`) written by the process that made it.

---

## No engine change was needed

`main.py` is untouched, and that is not a coincidence — the whole feature is
shaped to land in things the engine already does:

* `Sources._scan()` globs `packs/*/clips/*/*.mp4` and `_collection_of()` names
  a collection after its folder, so writing into `clips/emulator/` **is** the
  registration step. There is no list to add to.
* The Loader's *Video source* menu enumerates whatever `collections()`
  returns, so "emulator" appears beside the YouTube pulls with no UI work.
* Clip audio already plays through `RadioAudio` in "clip" mode, so the game's
  own sound is an audio source — and therefore an LFO source — for free.
* The *Gameplay* cart boots onto a specific clip with the existing `--clip`
  flag, which matches a substring of a clip's filename. `launch.sh` reads the
  name out of `.latest` and passes it, so the cart needs no new ROM-JSON key.

The one small engine change that would be *nice* but is not required:
`--clip` currently matches `args.clip in os.path.basename(p)`. Matching the
whole path instead (`args.clip in p`) is a strict superset — every basename
match still matches — and would let a `.vsb` cart address a whole collection
(`--clip clips/emulator/`) rather than one file. Worth doing only if some
other cart wants it.

---

## Files

| file | what |
| --- | --- |
| `pi/emurec_setup.sh` | one-time device setup; `--undo` reverses all of it |
| `pi/hvs_record.cfg` | the RetroArch ffmpeg record preset |
| `pi/runcommand-onend.sh` | RetroPie hook: fires the ingest when a game exits |
| `tools/emurec.py` | capture → 320x240 mp4 clip |
| `pi/roms/Gameplay.vsb` | the cart: sweep, then boot onto the last session |
| `launch.sh`, `pi/launch.sh` | `{"mode": "emurec"}` handling for that cart |
