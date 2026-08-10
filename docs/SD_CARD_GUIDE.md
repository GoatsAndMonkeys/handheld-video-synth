# The full SD card guide

From a blank SD card to a working HVS-80 — and then to a
single `.img` file anyone can flash and slot into the device. No prior
Raspberry Pi experience assumed.

## Option A — flash the prebuilt image (easiest)

If a release image is available on the
[Releases page](https://github.com/GoatsAndMonkeys/handheld-video-synth/releases):

1. Download `hvs-cart.img.gz` and flash it to a 16 GB+ card with
   Raspberry Pi Imager or balenaEtcher.
2. Add your WiFi: put a `wpa_supplicant.conf` on the card's `boot`
   partition (template in step 2 below).
3. Slot the card, boot — first boot auto-expands, then lands on the
   HVS-80 shelf. Load your playlists with
   `ytget.py ... --push` (step 5 below).

That's the whole install. Everything below is **Option B: building the
image yourself** — also how release images are made (see "Releasing an
image" at the end).

## 0. What you need

**Hardware**

> **Alpha note:** this hardware list is for the current *alpha* build.
> The project is transitioning to the **CM4** (GPi Case 2) — don't buy a
> Zero 2 W for this project unless you already own one.

- Retroflag **GPi Case 2W** (with its cartridge shell)
- Raspberry Pi **Zero 2 W** (the case's cartridge holds the Pi + SD card)
- microSD card, 16–32 GB, class A1 or better
- An SD card reader for your computer
- 2.4 GHz WiFi (the Zero 2 W has no 5 GHz)

**Software (on your computer)**
- [Raspberry Pi Imager](https://www.raspberrypi.com/software/) (or balenaEtcher)
- A terminal with `ssh` and `rsync` (built into macOS/Linux; on Windows use WSL)
- A checkout of this repo:
  `git clone https://github.com/GoatsAndMonkeys/handheld-video-synth`

## 1. Flash RetroPie

1. Download **RetroPie 4.8** for *Raspberry Pi 2/3/Zero 2 W* from
   <https://retropie.org.uk/download/> (a `.img.gz` file).
2. Open Raspberry Pi Imager → *Choose OS* → *Use custom* → pick the
   downloaded file → *Choose Storage* → your SD card → **Write**.
   (Skip Imager's OS-customization prompts if offered — we do it by hand
   next, because RetroPie predates that feature.)

## 2. Headless WiFi + SSH (before first boot)

Re-insert the SD card if it ejected. A small partition named **`boot`**
appears. Create two files on it:

1. An empty file named exactly `ssh` (no extension) — enables SSH.
2. A file named `wpa_supplicant.conf` containing (edit country, name,
   password):

   ```
   country=US
   ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
   update_config=1

   network={
       ssid="YourWifiName"
       psk="YourWifiPassword"
   }
   ```

Eject the card.

## 3. First boot + GPi Case display driver

1. Put the SD card in the Pi, the Pi in the cartridge, the cartridge in
   the case. Power on (charged battery or USB-C).
2. **The screen will stay dark or wrong — that's expected.** The GPi's
   screen needs Retroflag's driver patch. The Pi is still booting fine
   underneath; give it two minutes on first boot (filesystem expansion).
3. From your computer:

   ```sh
   ssh pi@retropie.local        # password: raspberry
   ```

   (If `retropie.local` doesn't resolve, find the Pi's IP in your router's
   device list and `ssh pi@<ip>`.)
4. Install Retroflag's GPi Case 2W patch (display + safe power switch),
   following the current instructions at
   <https://github.com/RetroFlag/GPiCase2W-Script> — typically:

   ```sh
   wget -O - "https://raw.githubusercontent.com/RetroFlag/GPiCase2W-Script/main/install_gpi2w.sh" | sudo bash
   ```

   The Pi reboots; the built-in screen now shows EmulationStation.
   **Do not** enable the vc4-kms GPU driver at any point — the synth (and
   the case) use the stock legacy driver.
5. EmulationStation asks you to configure the gamepad on first boot:
   hold any button and follow the prompts (map d-pad, A/B/X/Y, Start,
   Select, L/R; skip the rest with any held button).

## 4. Install the HVS-80

From your computer, inside the cloned repo:

```sh
rsync -az --exclude .venv --exclude .git --exclude shots \
      ./ pi@retropie.local:/home/pi/handheld-video-synth/
ssh pi@retropie.local 'bash /home/pi/handheld-video-synth/pi/install.sh'
```

The installer pulls python dependencies from piwheels (note: `apt install`
does **not** work on this OS anymore — Buster is end-of-life; the
installer accounts for this), downloads a static ffmpeg, registers the
**HVS-80** shelf in EmulationStation, and copies the starter
carts. Reboot:

```sh
ssh pi@retropie.local 'sudo reboot'
```

## 5. Load videos

On your computer (needs `python3`, `ffmpeg`, and `pip install yt-dlp` —
or use the repo's venv):

```sh
python3 ytget.py "https://youtube.com/playlist?list=YOUR_PLAYLIST" --push
```

Each playlist becomes a browsable collection on the device. Repeat per
playlist. Private playlists: make them unlisted, or add
`--cookies chrome`.

## 6. Verify

On the device: EmulationStation → **HVS-80** shelf →
*HVS-80 Demo*. You should see the plasma with the control bar.
Press **Start** → Video source → pick your playlist → pick a video: it
plays with sound, effects on top. Press Select once for the help panel —
every control is documented on-screen.

Optional before imaging: build a deck (so carts boot performance-ready)
and/or add streaming endpoints to `/home/pi/handheld-video-synth/stream.json`
(**never** include a stream key in an image you share).

## 7. Capture the master image

1. Shut down cleanly: Select+Start out of the synth, then
   EmulationStation menu → Quit → **Shutdown system**. Wait for the LED,
   power off, remove the SD card, insert it in your computer.
2. macOS:

   ```sh
   diskutil list                       # find the card, e.g. /dev/disk4
   diskutil unmountDisk /dev/diskN
   sudo dd if=/dev/rdiskN of=hvs-cart.img bs=1m status=progress
   ```

   Linux: same idea with `/dev/sdX` and `bs=1M`.

## 8. Shrink the image

The raw dump is the size of the whole card. [PiShrink](https://github.com/Drewsif/PiShrink)
trims it to used space and makes it **auto-expand on first boot**, so one
image fits any card of sufficient size. Via Docker (works on macOS):

```sh
docker run --privileged --rm -v "$PWD":/workdir \
    monsieurborges/pishrink pishrink -z hvs-cart.img
```

Result: `hvs-cart.img.gz`, typically 3–6 GB depending on content.

## 9. Make carts

Flash `hvs-cart.img.gz` onto any SD card with Raspberry Pi Imager or
balenaEtcher. First boot expands the filesystem, then lands on the shelf.
One image → as many carts as you have cards. A spare GPi cartridge shell
+ a Zero 2 W (one you already have — see the alpha note in step 0) + a
flashed card = a complete, giftable instrument.

## Releasing an image

To turn a captured image into a publishable release in one step —
strips videos, decks, stream keys, WiFi credentials, histories and
logs, then shrinks (requires Docker):

```sh
tools/clean_image.sh hvs-cart.img
gh release create v1.0 hvs-cart.img.gz -t "HVS-80 v1.0" \
   -n "Flash, add wifi, boot. See docs/SD_CARD_GUIDE.md Option A."
```

Always flash-test the cleaned image on a spare card before publishing.
(GitHub release assets cap at 2 GiB per file; a content-free image fits
comfortably.)

## 10. Sharing images publicly

The software is GPL-3.0 — share images freely, **but**:

- **Not with downloaded music videos inside.** Capture a content-free
  master (before step 5) for public release; people load their own
  playlists with `ytget.py`.
- Remove your WiFi credentials first:
  `sudo rm /etc/wpa_supplicant/wpa_supplicant.conf` (then shut down and
  capture). Recipients add their own via step 2.
- Never include `stream.json` (stream keys are secrets).

## Troubleshooting

| symptom | fix |
| --- | --- |
| `retropie.local` not found | use the IP from your router; ensure your computer is on the same 2.4 GHz network |
| screen dark after step 3.4 | re-run the Retroflag script; check the ribbon cable seating in the case |
| `apt install` errors | expected — Buster is EOL; the installer avoids apt entirely |
| synth is a black screen | check `/tmp/videosynth.log` on the Pi |
| choppy video | clips should be 320×240 (ytget does this automatically); re-encode stray files |
| no audio | Loader → Audio source → "video's own sound"; check `amixer sget Headphone` volume |
| controls double-step or wrong buttons | quit and relaunch the cart (an old process may be running); button roles are on the Select help panel |
