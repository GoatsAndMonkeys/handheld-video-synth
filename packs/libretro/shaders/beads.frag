/*
   Author: Themaister
   License: Public domain
*/
// Source: libretro/common-shaders, misc/bead.cg
// Ported to the HVS-80 shader convention (single pass, GLES2, 3 params).
// Each source pixel becomes a bead: inside a ring the colour is flat, outside
// it rolls off exponentially, so the grid reads as strung glass rather than
// as a scanline mask. The original beads one emulator pixel at a time; here
// the cell size is a performance param and the colour is fetched from the
// cell centre (nearest neighbour), which is what turns a subpixel trick into
// a chunky, visible scaling artefact. exp(-6x) is written as exp2(-8.66x),
// the same curve with the instruction the VideoCore actually has.
// x0 size (cell size), x1 bead (ring inner/outer radius), x2 soft (roll-off)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

void main() {
    float cells = floor(mix(96.0, 10.0, u_x0)) + 1.0;
    vec2 grid = vec2(cells, cells * u_resolution.y / u_resolution.x);

    vec2 pn = v_texcoord * grid;
    vec2 cell = (floor(pn) + 0.5) / grid;
    vec3 color = texture2D(u_tex0, cell).rgb;

    // original: delta = dist(frac(pixel_no), vec2(0.5))
    float delta = length(fract(pn) - 0.5);

    float high = 0.10 + 0.45 * u_x1;      // original BEAD_HIGH 0.35
    float low  = high * mix(0.9, 0.15, u_x1);  // original BEAD_LOW  0.2
    float roll = -8.66 * mix(4.0, 0.35, u_x2);

    float outside = exp2(roll * max(delta - high, 0.0));
    float inside  = exp2(roll * max(low - delta, 0.0));
    float m = min(outside, inside);       // flat between low and high

    gl_FragColor = vec4(color * m, 1.0);
}
