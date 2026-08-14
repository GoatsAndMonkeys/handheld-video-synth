# Project notes for Claude

## Credits and licences are part of every change

Whenever effects, packs, or borrowed techniques are added, removed, or
renamed, update **in the same commit**:

- the root `CREDITS.md` (the licence-compatibility ledger — every outside
  work, how it's used, why it's compatible),
- the pack's own `CREDITS.md` (per-shader provenance) and, for ported code,
  the pack `LICENSE`,
- the pack table and effects table in `README.md`.

Licence policy (details in `PLUGINS.md` §7): this repo is GPL-3.0. Ported
code needs a GPL-compatible licence (MIT/BSD/Apache-2/GPL/PD) with upstream
notices preserved. Unlicensed or CC-NC sources → clean-room reimplementation
of the idea only, with credit. `packs/recurboy/*.frag` stay byte-identical
to upstream.

## Validation

`python3 tools/checkpack.py packs/<name>` must pass with 0 errors before a
pack ships; compile shaders on the device with `tools/checkshader.py`
(real GLES context) before calling them done.

## The GPi is a live instrument

Never run tests or deploy on the GPi without telling the user first — it may
be mid-performance.
