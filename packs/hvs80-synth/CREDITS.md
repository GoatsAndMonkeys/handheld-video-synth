# hvs80-synth — credits

The house pack: the video synthesizer core of the HVS-80. Every shader in
this folder is **original work by GoatsAndMonkeys**, written for this
project, and GPL-3.0 like the rest of the engine.

There is no third-party code in this pack, so there is no upstream `LICENSE`
to carry.

| shader | what it is |
| --- | --- |
| `feedback` | plain video feedback: amount, zoom, hue drift, spin |
| `colorize`, `colorpop` | linear grade; filmic punch with vibrance, bloom and split tone |
| `hype` | wide-angle lens and a pop grade in one pass |
| `fisheye`, `droste`, `moire`, `lenticular` | barrel lens; recursive self-containing spiral; interference fringes drawing the picture; ridged-postcard time flip |
| `vhs`, `nightvis`, `thermal` | tape decay; intensifier tube; heat camera |
| `solarize`, `melt`, `inkbleed`, `reactdiff` | darkroom tone fold; wax drip; nib bleeding through a fibre field; two invented chemicals fed by the picture |
| `rgbdelay`, `lumatrail`, `timegrad`, `timeposter`, `motionmilk`, `echostrobe` | RGB time split; comet trails; luma time-split; flipboard ticks; movement painted as light; tinted delay-tap echoes |
| `ruttetra` | luma lifts scanlines into a wire terrain |

`ruttetra` is a from-scratch homage to the **Rutt/Etra** video synthesizer's
deflection-modulation technique — 1972 analog hardware, no code lineage.
`feedback`'s header calls itself "waaave-style" because that is the idiom it
sits in; it is an original of this project, not a study of any particular
instrument.

## What used to be here

The eighteen effects after [Andrei Jay](https://andreijaycreativecoding.com)'s
waaave_pool / VSERPI family — `waaave` and its three banks, `gravity`,
`delay`, `convolve`, `cellular`, `slitscan`, `chromab`, `lifeosc`, `haeckel`,
`phosphor`, `glyphworld`, `scopexy`, `fourband`, `meshscan`, `autolife` —
now ship as their own pack, [`packs/vserpi`](../vserpi/CREDITS.md), so his
lineage appears under its own name in the FX deck instead of under ours.
They are clean-room reimplementations there exactly as they were here: his
repositories carry no determinable licence, so no code of his is in this
repository.

## Borrowed effects in the setlists

Two playlists here name effects from other packs. The engine's shader lookup
searches the current pack first, then every pack, so these load as long as
the other pack is installed; `checkpack.py` flags them as warnings, which is
the intended reading.

- `playlists/hvs80.json` — `risograph`, `photocopy`, `cyanotype` from
  `packs/hvs80-pixel`.
- `playlists/reactive.json` — `phosphor` and `glyphworld` from
  `packs/vserpi`; `spectrum`, `eqbars`, `cells`, `wavepat` from
  `packs/bzzzbz`; `radscope`, `gridcirc`, `mirrgrid`, `classicv`,
  `concentr`, `perspect` from `packs/eyesy`. It is a cross-pack curation of
  the audio-reactive effects by design.

## Clips

`clips/` holds the user's own downloaded video, which is not part of this
repository or of any release. See
[docs/SD_CARD_GUIDE.md](../../docs/SD_CARD_GUIDE.md).
