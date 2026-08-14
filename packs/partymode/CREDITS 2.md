# party mode — credits

Five generators for the HVS-80, **reimplemented from scratch in GLSL** after
the visual world of [Mathew Preziotte](https://preziotte.com)
([@preziotte](https://github.com/preziotte)): the
[party-mode](https://github.com/preziotte/party-mode) music visualizer
(which grew into [vizz.fm](https://vizz.fm/)), the
[rose-curve-interpolation](https://github.com/preziotte/rose-curve-interpolation)
toy, and the
[butterfly-curve-editor](https://github.com/preziotte/butterfly-curve-editor).

**No party-mode code is copied, and none could be.** The originals are
JavaScript that builds SVG documents — d3 selections, CSS `stroke-dasharray`,
`:nth-of-type` palettes — driven by a Web Audio waveform array. None of that
translates to a fragment shader. Every file here is a per-pixel answer to the
same picture: instead of appending a thousand `<circle>` elements, each pixel
works out which ring and which dot it falls in. The waveform array becomes
`aud()`, a cheap oscillator sum driven by this engine's three audio bands
(`u_a0` bass, `u_a1` level, `u_a2` highs). The polar curves are public
mathematics — the rose is Grandi's, the butterfly is Temple H. Fay's — drawn
here as signed-distance glows rather than plotted paths.

Preziotte's repositories carry no licence, which is exactly why this pack
contains only original code after the ideas, with credit. These files are
GPL-3.0 like the rest of the engine.

| shader   | after |
|----------|-------|
| partydot | party-mode: concentric rings of dots swelling to the music |
| dashring | party-mode: dashed SVG circles, arcs chasing their own tails |
| partyray | party-mode: a radial burst of bars reading like a round meter |
| rosecurv | rose-curve-interpolation: r = cos(kθ) morphing between petal counts |
| butterfl | butterfly-curve-editor: Fay's butterfly beating its wings |
| superfrm | curve-edit: Gielis's superformula — circle to starfish to flower |
| spirals  | curve-edit: its Archimedean, Fermat and golden spirals on one knob |
| lissaj   | curve-edit: Lissajous figures, the oscilloscope knot |
| cardbrd  | curve-edit: the times-table braid, chords bunching into a cardioid |

The last four come from [curve-edit](https://github.com/preziotte/curve-edit),
whose `data.json` collects polar curves as d3 plotting functions with sliders
over their constants. The curves themselves are long-published mathematics —
Gielis's superformula (1997), Archimedes' and Fermat's spirals, Lissajous
figures, the times-table string figure — and each is written here as a
per-pixel field rather than a plotted path: `superfrm` and `spirals` are
solved analytically, while `lissaj` and `cardbrd` walk a bounded loop of
segments with the engine's cheap sine, since this GPU has no hardware trig.

Not drawn from: the `awesome-*` repositories. Those are curated link lists
pointing at other artists' work, not visuals of his — every project in them
belongs to someone else, under its own licence.
