"""A 4x8 bitmap font in a 5x9 cell, for on-screen menus.

Drawn for this project rather than borrowed. That is partly licensing —
an outside font would be another entry in the credit ledger and another
file to get onto the device — and partly that nothing off the shelf is
built for this job. The menus used DejaVu Sans Mono with its
anti-aliasing thresholded away, which squares off the edges but leaves
outline-font proportions underneath: thin stems, round bowls, glyphs
that were never meant to land on a 5-pixel grid. A character cell that
*is* the grid gives the flat, chunky look of a VCR or set-top display,
where every stroke is one pixel wide because the hardware had no way to
draw a half.

Metrics: glyphs are 4x8 with a one-pixel gutter right and below, so the
advance is 5x9. Integer scale only — half a pixel is exactly what this
font exists to avoid — and on the deck's 640-wide panel that means scale
2: a 10x18 cell, 64 columns.

Four columns, not five, and the reason is that integer scaling leaves
very little choice. A five-wide glyph gives a 6px cell, which is 106
columns at scale 1 (unreadably small) and 53 at scale 2 — wider than the
11px outline face it replaced, and much heavier, since 10 of those 12
pixels are ink where an outline font at that size is mostly side
bearing. Four wide lands on 64 columns: narrower than the 58 the old
menus had, with room recovered for the long rows in the FX deck.

Rows 0-6 carry caps and digits, with the baseline on row 6; lowercase
x-height runs rows 2-6, and row 7 is the descender. That eighth row is
not decoration. Drawn at seven rows, g/j/p/q/y had to be lifted onto the
baseline, and a lifted g is a 9 — "glide" read as "9lide" in the first
proof. Anything that hangs (g j p q y , ;) and the underscore are drawn
by hand rather than shifted, because moving them mechanically drops the
dot off j.

No dependencies: the renderer sets pixels through a callback, so the
Pi's PIL path and the desktop's pygame path share one source of truth.
"""

W = 4           # glyph box
H = 8
ADV = 5         # cell advance, glyph plus gutter
LINE = 9

# '#' is ink, anything else is ground. Written out rather than packed into
# bit constants because this is a drawing, and a drawing should be legible
# in the file you edit it in.
_G = {
    " ": ("    ", "    ", "    ", "    ", "    ", "    ", "    ", "    "),
    "!": (" #  ", " #  ", " #  ", " #  ", " #  ", "    ", " #  ", "    "),
    '"': ("# # ", "# # ", "    ", "    ", "    ", "    ", "    ", "    "),
    "#": (" # #", "####", " # #", "####", " # #", "    ", "    ", "    "),
    "$": (" #  ", " ###", "#   ", " ## ", "   #", "### ", " #  ", "    "),
    "%": ("#  #", "   #", "  # ", " #  ", "#   ", "#  #", "    ", "    "),
    "&": (" #  ", "# # ", " #  ", "# # ", "#  #", "#  #", " ###", "    "),
    "'": (" #  ", " #  ", "    ", "    ", "    ", "    ", "    ", "    "),
    "(": ("  # ", " #  ", "#   ", "#   ", "#   ", " #  ", "  # ", "    "),
    ")": (" #  ", "  # ", "   #", "   #", "   #", "  # ", " #  ", "    "),
    "*": ("    ", "# # ", " ## ", "####", " ## ", "# # ", "    ", "    "),
    "+": ("    ", " #  ", " #  ", "####", " #  ", " #  ", "    ", "    "),
    ",": ("    ", "    ", "    ", "    ", "    ", "    ", " #  ", "#   "),
    "-": ("    ", "    ", "    ", " ## ", "    ", "    ", "    ", "    "),
    ".": ("    ", "    ", "    ", "    ", "    ", " ## ", " ## ", "    "),
    "/": ("   #", "   #", "  # ", "  # ", " #  ", "#   ", "#   ", "    "),
    "0": (" ## ", "#  #", "# ##", "## #", "#  #", "#  #", " ## ", "    "),
    "1": (" #  ", "##  ", " #  ", " #  ", " #  ", " #  ", "### ", "    "),
    "2": (" ## ", "#  #", "   #", "  # ", " #  ", "#   ", "####", "    "),
    "3": ("### ", "   #", "   #", " ## ", "   #", "   #", "### ", "    "),
    "4": ("  # ", " ## ", "# # ", "####", "  # ", "  # ", "  # ", "    "),
    "5": ("####", "#   ", "### ", "   #", "   #", "#  #", " ## ", "    "),
    "6": (" ## ", "#   ", "#   ", "### ", "#  #", "#  #", " ## ", "    "),
    "7": ("####", "   #", "  # ", "  # ", " #  ", " #  ", " #  ", "    "),
    "8": (" ## ", "#  #", "#  #", " ## ", "#  #", "#  #", " ## ", "    "),
    "9": (" ## ", "#  #", "#  #", " ###", "   #", "   #", " ## ", "    "),
    ":": ("    ", " ## ", " ## ", "    ", " ## ", " ## ", "    ", "    "),
    ";": ("    ", " ## ", " ## ", "    ", " ## ", "  # ", " #  ", "    "),
    "<": ("   #", "  # ", " #  ", "#   ", " #  ", "  # ", "   #", "    "),
    "=": ("    ", "    ", "####", "    ", "####", "    ", "    ", "    "),
    ">": ("#   ", " #  ", "  # ", "   #", "  # ", " #  ", "#   ", "    "),
    "?": (" ## ", "#  #", "   #", "  # ", " #  ", "    ", " #  ", "    "),
    "@": (" ## ", "#  #", "# ##", "# ##", "#   ", "#   ", " ## ", "    "),
    "A": (" ## ", "#  #", "#  #", "####", "#  #", "#  #", "#  #", "    "),
    "B": ("### ", "#  #", "#  #", "### ", "#  #", "#  #", "### ", "    "),
    "C": (" ## ", "#  #", "#   ", "#   ", "#   ", "#  #", " ## ", "    "),
    "D": ("### ", "#  #", "#  #", "#  #", "#  #", "#  #", "### ", "    "),
    "E": ("####", "#   ", "#   ", "### ", "#   ", "#   ", "####", "    "),
    "F": ("####", "#   ", "#   ", "### ", "#   ", "#   ", "#   ", "    "),
    "G": (" ## ", "#  #", "#   ", "# ##", "#  #", "#  #", " ###", "    "),
    "H": ("#  #", "#  #", "#  #", "####", "#  #", "#  #", "#  #", "    "),
    "I": ("### ", " #  ", " #  ", " #  ", " #  ", " #  ", "### ", "    "),
    "J": ("  ##", "   #", "   #", "   #", "   #", "#  #", " ## ", "    "),
    "K": ("#  #", "# # ", "##  ", "##  ", "# # ", "#  #", "#  #", "    "),
    "L": ("#   ", "#   ", "#   ", "#   ", "#   ", "#   ", "####", "    "),
    "M": ("#  #", "####", "####", "#  #", "#  #", "#  #", "#  #", "    "),
    "N": ("#  #", "## #", "## #", "# ##", "# ##", "#  #", "#  #", "    "),
    "O": (" ## ", "#  #", "#  #", "#  #", "#  #", "#  #", " ## ", "    "),
    "P": ("### ", "#  #", "#  #", "### ", "#   ", "#   ", "#   ", "    "),
    "Q": (" ## ", "#  #", "#  #", "#  #", "# ##", "#  #", " ###", "    "),
    "R": ("### ", "#  #", "#  #", "### ", "# # ", "#  #", "#  #", "    "),
    "S": (" ###", "#   ", "#   ", " ## ", "   #", "   #", "### ", "    "),
    "T": ("####", " #  ", " #  ", " #  ", " #  ", " #  ", " #  ", "    "),
    "U": ("#  #", "#  #", "#  #", "#  #", "#  #", "#  #", " ## ", "    "),
    "V": ("#  #", "#  #", "#  #", "#  #", "#  #", " ## ", " ## ", "    "),
    "W": ("#  #", "#  #", "#  #", "#  #", "####", "####", "#  #", "    "),
    "X": ("#  #", "#  #", " ## ", " ## ", " ## ", "#  #", "#  #", "    "),
    "Y": ("#  #", "#  #", "#  #", " ## ", " #  ", " #  ", " #  ", "    "),
    "Z": ("####", "   #", "  # ", " #  ", "#   ", "#   ", "####", "    "),
    "[": (" ## ", " #  ", " #  ", " #  ", " #  ", " #  ", " ## ", "    "),
    "\\": ("#   ", "#   ", " #  ", " #  ", "  # ", "   #", "   #", "    "),
    "]": (" ## ", "  # ", "  # ", "  # ", "  # ", "  # ", " ## ", "    "),
    "^": (" #  ", "# # ", "    ", "    ", "    ", "    ", "    ", "    "),
    "_": ("    ", "    ", "    ", "    ", "    ", "    ", "    ", "####"),
    "`": ("#   ", " #  ", "    ", "    ", "    ", "    ", "    ", "    "),
    "a": ("    ", "    ", " ## ", "   #", " ###", "#  #", " ###", "    "),
    "b": ("#   ", "#   ", "### ", "#  #", "#  #", "#  #", "### ", "    "),
    "c": ("    ", "    ", " ## ", "#   ", "#   ", "#  #", " ## ", "    "),
    "d": ("   #", "   #", " ###", "#  #", "#  #", "#  #", " ###", "    "),
    "e": ("    ", "    ", " ## ", "#  #", "####", "#   ", " ## ", "    "),
    "f": ("  ##", " #  ", "### ", " #  ", " #  ", " #  ", " #  ", "    "),
    "g": ("    ", "    ", " ###", "#  #", "#  #", " ###", "   #", " ## "),
    "h": ("#   ", "#   ", "### ", "#  #", "#  #", "#  #", "#  #", "    "),
    "i": (" #  ", "    ", "##  ", " #  ", " #  ", " #  ", "### ", "    "),
    "j": ("  # ", "    ", " ## ", "  # ", "  # ", "  # ", "# # ", " #  "),
    "k": ("#   ", "#   ", "#  #", "# # ", "##  ", "# # ", "#  #", "    "),
    "l": ("##  ", " #  ", " #  ", " #  ", " #  ", " #  ", "### ", "    "),
    # three stems will not fit in four columns. Tried as a top bar over two
    # stems and it read as an n; the shouldered form below keeps enough of
    # the two-hump silhouette to stay an m. Proofed against "milkdrop
    # memory", which is the string that actually has to survive it.
    "m": ("    ", "    ", "## #", "####", "# ##", "#  #", "#  #", "    "),
    "n": ("    ", "    ", "### ", "#  #", "#  #", "#  #", "#  #", "    "),
    "o": ("    ", "    ", " ## ", "#  #", "#  #", "#  #", " ## ", "    "),
    "p": ("    ", "    ", "### ", "#  #", "#  #", "### ", "#   ", "#   "),
    "q": ("    ", "    ", " ###", "#  #", "#  #", " ###", "   #", "   #"),
    "r": ("    ", "    ", "# ##", "##  ", "#   ", "#   ", "#   ", "    "),
    "s": ("    ", "    ", " ###", "#   ", " ## ", "   #", "### ", "    "),
    "t": (" #  ", " #  ", "### ", " #  ", " #  ", " # #", "  # ", "    "),
    "u": ("    ", "    ", "#  #", "#  #", "#  #", "#  #", " ###", "    "),
    "v": ("    ", "    ", "#  #", "#  #", "#  #", " ## ", " ## ", "    "),
    "w": ("    ", "    ", "#  #", "#  #", "####", "####", "# # ", "    "),
    "x": ("    ", "    ", "#  #", " ## ", " ## ", " ## ", "#  #", "    "),
    "y": ("    ", "    ", "#  #", "#  #", "#  #", " ###", "   #", " ## "),
    "z": ("    ", "    ", "####", "  # ", " #  ", "#   ", "####", "    "),
    "{": ("  ##", " #  ", " #  ", "##  ", " #  ", " #  ", "  ##", "    "),
    "|": (" #  ", " #  ", " #  ", " #  ", " #  ", " #  ", " #  ", "    "),
    "}": ("##  ", "  # ", "  # ", "  ##", "  # ", "  # ", "##  ", "    "),
    "~": ("    ", "    ", " # #", "# # ", "    ", "    ", "    ", "    "),
    "—": ("    ", "    ", "    ", "####", "    ", "    ", "    ", "    "),
    "♪": ("  ##", "  ##", "  # ", "  # ", "### ", "### ", "    ", "    "),
}

# anything not drawn shows as a hollow box, which is a visible bug rather
# than a silent hole in a word
_MISSING = ("####", "#  #", "#  #", "#  #", "#  #", "#  #",
            "####", "    ")


MIN_COLS = 52       # never set a panel narrower than this many characters


def scale_for(width, min_cols=MIN_COLS):
    """Largest whole-pixel scale that still fits min_cols characters.

    One definition, used by both backends and by the engine's own column
    arithmetic. It used to be a magic 0.6-of-the-row-height factor in
    three places, which happened to agree with the font by luck; anything
    that right-aligns text needs the real number, not a coincidence."""
    return max(1, int(width) // (ADV * min_cols))


def glyph(ch):
    return _G.get(ch, _MISSING)


def text_width(s, scale=1):
    """Advance width in pixels. Trailing gutter included, as a monospace
    cell always carries it."""
    return len(s) * ADV * scale


def text_height(scale=1):
    return LINE * scale


def columns(px, scale=1):
    """How many characters fit in px pixels."""
    return max(0, int(px) // (ADV * scale))


def draw(s, x, y, scale, put):
    """Stamp s at (x, y), calling put(px, py) for every ink pixel.

    The caller owns colour and clipping; this only decides which pixels
    are ink. Keeping it that way is what lets the PIL and pygame paths
    share the glyphs instead of drifting apart."""
    for i, ch in enumerate(s):
        rows = glyph(ch)
        gx = x + i * ADV * scale
        for ry in range(H):
            row = rows[ry]
            for rx in range(W):
                if row[rx] != " ":
                    px, py = gx + rx * scale, y + ry * scale
                    if scale == 1:
                        put(px, py)
                    else:
                        for sy in range(scale):
                            for sx in range(scale):
                                put(px + sx, py + sy)


def runs(s, x, y, scale):
    """Ink as horizontal runs: (x, y, width, height) rectangles.

    Whole-rectangle fills are far cheaper than per-pixel calls through
    PIL, and a bitmap font is mostly short horizontal runs anyway."""
    out = []
    for i, ch in enumerate(s):
        rows = glyph(ch)
        gx = x + i * ADV * scale
        for ry in range(H):
            row = rows[ry]
            rx = 0
            while rx < W:
                if row[rx] == " ":
                    rx += 1
                    continue
                start = rx
                while rx < W and row[rx] != " ":
                    rx += 1
                out.append((gx + start * scale, y + ry * scale,
                            (rx - start) * scale, scale))
    return out
