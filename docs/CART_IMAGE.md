# Pressing a cart: building a complete Handheld Video Synth SD image

The goal: one `.img` file containing RetroPie + Handheld Video Synth + your content,
flashable to any SD card — a finished cartridge. In the GPi Case the
cartridge shell holds the Pi and its SD card, so a flashed card *is* the
cart: build one master image, press as many carts as you like.

## 1. Start from RetroPie

1. Download the **RetroPie 4.8** image for *Raspberry Pi 2/3/Zero 2 W*
   from <https://retropie.org.uk/download/>.
2. Flash it to an SD card (8 GB+; 32 GB recommended for a video library)
   with Raspberry Pi Imager or balenaEtcher.
3. GPi Case screen + safe shutdown: run Retroflag's GPi Case 2W patch
   (from <https://github.com/RetroFlag/GPiCase2W-Script>) per their
   instructions — this sets the DPI display overlay and shutdown GPIO.
   **Do not** enable the vc4-kms GPU driver; Handheld Video Synth uses the legacy
   Broadcom stack the case ships with.
4. Boot in the case, configure WiFi (RetroPie menu → WIFI) and enable SSH
   (RetroPie menu → raspi-config → Interface Options). Note: the Zero 2 W
   is 2.4 GHz-only.

## 2. Install Handheld Video Synth

From your computer, in a checkout of this repo:

```sh
rsync -az --exclude .venv --exclude .git --exclude shots \
      ./ pi@retropie.local:/home/pi/VideoBoy/
ssh pi@retropie.local 'bash /home/pi/VideoBoy/pi/install_videoboy.sh'
```

The installer fetches python deps from piwheels (apt on Buster is EOL and
will not work), downloads a static ffmpeg, registers the **Handheld Video Synth**
system in EmulationStation, and copies the starter carts. Reboot the Pi;
the shelf appears.

## 3. Load content

```sh
.venv/bin/python ytget.py "https://youtube.com/playlist?list=..." --push
```

Each playlist becomes a collection in the Loader. Repeat per playlist.
Build a deck on the device if you want the cart to boot performance-ready
(decks live at `packs/demo/playlists/deck.json` on the card).

Optional: streaming endpoints in `/home/pi/VideoBoy/stream.json` —
remember a YouTube stream key is a **secret**; leave it out of images you
share.

## 4. Capture the image (macOS)

1. Shut the Pi down cleanly (Select+Start out of Handheld Video Synth, then
   EmulationStation → Quit → Shutdown), remove the SD card, insert it in
   your computer.
2. Find the disk — look for the card by size:

   ```sh
   diskutil list
   ```

3. Capture (replace `N`; `rdisk` is much faster than `disk`):

   ```sh
   sudo dd if=/dev/rdiskN of=vfxdeck-cart.img bs=1m status=progress
   ```

   This produces an image the full size of the card.

## 5. Shrink it (recommended)

A 32 GB dump flashes onto nothing smaller. [PiShrink](https://github.com/Drewsif/PiShrink)
trims the image to its used space and makes it auto-expand on first boot,
so one master image fits any card ≥ its content. Easiest on macOS via
Docker:

```sh
docker run --privileged --rm -v "$PWD":/workdir \
    monsieurborges/pishrink pishrink -z vfxdeck-cart.img
```

`-z` also gzips it. Result: `vfxdeck-cart.img.gz`, typically a few GB.

## 6. Press carts

Flash the (possibly .gz) image with Raspberry Pi Imager or balenaEtcher
onto each card. First boot auto-expands the filesystem, then boots to the
Handheld Video Synth shelf. Slot the card (or a whole Zero 2 W + card in a spare GPi
cartridge shell) and hand it to someone.

## Sharing images publicly

The Handheld Video Synth software is GPL-3.0 — share freely. But an image containing
**downloaded music videos is not yours to distribute**. For public
releases, capture the image *before* step 3 (content-free), or keep a
separate content-free master. Same for `stream.json` and saved WiFi
credentials (`sudo rm /etc/wpa_supplicant/wpa_supplicant.conf` before a
public capture, or use `raspi-config` to reset them).
