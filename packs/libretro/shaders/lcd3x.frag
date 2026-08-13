/*
   Author: Gigaherz
   License: Public domain
*/
// Source: libretro/common-shaders, handheld/shaders/lcd3x.cg
// Ported to the HVS-80 shader convention (single pass, GLES2, 3 params).
// The libretro vertex stage (which precomputed omega = 2*pi*texture_size) is
// folded in. The original's four sin() calls are replaced with a fract-based
// cosine approximation - the VideoCore IV has no cheap trig, and at a 2-4px
// subpixel pitch the two are indistinguishable. The original's compile-time
// constants brighten_scanlines/brighten_lcd become live params.
// x0 cells (LCD pixel pitch), x1 depth (subpixel contrast), x2 scan (row gaps)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

// ~cos(2*pi*t) with t in turns: triangle wave, smoothed by a cubic
float cw(float t) {
    float x = abs(fract(t) * 4.0 - 2.0) - 1.0;
    return x * (1.5 - 0.5 * x * x);
}

void main() {
    // original: omega = 3.141592654 * 2 * texture_size, angle = texCoord * omega
    // in turns that is simply texCoord * cells
    float cellsX = floor(mix(320.0, 40.0, u_x0));
    float cellsY = floor(cellsX * u_resolution.y / u_resolution.x);
    float brighten_lcd = mix(16.0, 0.6, u_x1);
    float brighten_scanlines = mix(48.0, 0.6, u_x2);

    // original sampled with SamplePoint (nearest) - snap to the cell centre so
    // the panel reads as discrete pixels rather than a filtered smear
    vec2 cells = vec2(cellsX, cellsY);
    vec2 uv = (floor(v_texcoord * cells) + 0.5) / cells;
    vec3 res = texture2D(u_tex0, uv).rgb;

    vec2 angle = v_texcoord * cells;

    // offsets: pi * (1/2, 1/2 - 2/3, 1/2 - 4/3) -> cosine turns (0, -1/3, -2/3)
    float yfactor = (brighten_scanlines + cw(angle.y - 0.25))
                  / (brighten_scanlines + 1.0);
    vec3 xfactors = (brighten_lcd + vec3(cw(angle.x - 0.25),
                                         cw(angle.x - 0.25 - 0.3333333),
                                         cw(angle.x - 0.25 - 0.6666667)))
                  / (brighten_lcd + 1.0);

    gl_FragColor = vec4(yfactor * xfactors * res, 1.0);
}
