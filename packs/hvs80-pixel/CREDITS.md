# hvs80-pixel — credits

Every shader in this pack is original work by GoatsAndMonkeys for this
project, GPL-3.0 like the rest of the repo (see the root `LICENSE` and
`CREDITS.md`). No outside code is ported or adapted.

Some effects reproduce the *look* of real hardware and processes —
machine palettes (`c64`, `cga`, `zxclash`, `virtualboy`, `pico8`,
`gameboy`), display mechanics (`flipdot`, `eink`), print processes
(`halftone`, `risograph`, `photocopy`, `cyanotype`, `tritone`), the
web-safe GIF era (`websafe_y2k`), glyph terminals (`ascii`), and
block-transform compression (`bitstarve`, `jpegcrush`). Palettes and
published device behaviour are facts, not code; each shader implements
them from scratch.

The two compression effects are siblings and sit together in the deck.
`jpegcrush` runs a genuine 4x4 DCT in the shader, quantises the
coefficients and inverts it, so it destroys a *still* frame the way a
JPEG at the bottom of the quality scale does. `bitstarve` models the
visible signature of a starved MPEG-style *stream* — macroblock hold,
dead-zone quantisation, 4:2:0-style chroma subsampling, rolling intra
refresh, motion smear — without deriving from any codec source. Both are
written from the published behaviour of the transforms, not ported from
libjpeg, any MPEG reference encoder, or other codec code.
