# hvs80-pixel — credits

Every shader in this pack is original work by GoatsAndMonkeys for this
project, GPL-3.0 like the rest of the repo (see the root `LICENSE` and
`CREDITS.md`). No outside code is ported or adapted.

Some effects reproduce the *look* of real hardware and processes —
machine palettes (`c64`, `cga`, `zxclash`, `virtualboy`, `pico8`,
`gameboy`), display mechanics (`flipdot`, `eink`), print processes
(`halftone`, `risograph`, `photocopy`, `cyanotype`, `tritone`), the
web-safe GIF era (`websafe_y2k`), glyph terminals (`ascii`), and
block-transform video compression (`bitstarve`). Palettes and published
device behaviour are facts, not code; each shader implements them from
scratch. `bitstarve` models the visible signature of a starved MPEG-style
stream (macroblock hold, dead-zone quantisation, 4:2:0-style chroma
subsampling, rolling intra refresh) without deriving from any codec
source — distinct from `jpegcrush` in `packs/hvs80-glitch`, which runs a
genuine DCT.
