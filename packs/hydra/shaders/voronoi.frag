// After Hydra's voronoi() source (hydra-synth, Olivia Jack, AGPL-3.0): a
// moving cellular field with visible cell walls. Reimplemented from scratch
// as the standard 3x3 neighbourhood search — nine candidate points on a
// constant-bound loop, each one orbiting inside its cell on the cheap
// parabola sine, tracking nearest and second-nearest so the wall is the
// classic F2-F1 ridge. Hydra's blending argument becomes the third knob:
// flat coloured cells at zero, walls lighting up as it rises. Bass pulses
// each cell's brightness on its own phase; highs pull the walls thinner.
// The per-cell hash is built from the parabola sine too — no real trig
// anywhere in this file.
//
// x0 scale, x1 speed, x2 wall glow, x3 video blend
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;
uniform float u_a1;
uniform float u_a2;

float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }
float cw(float x) { return sw(x + 0.25); }

vec3 pal(float h) {
    return 0.5 + 0.5 * vec3(sw(h), sw(h + 0.333), sw(h + 0.667));
}

// two decorrelated 0..1 randoms per lattice cell, no trig involved
vec2 hash2(vec2 p) {
    return fract(vec2(sw(dot(p, vec2(0.12707, 0.31171))) * 41.53,
                      sw(dot(p, vec2(0.26951, 0.18339))) * 37.61));
}

void main() {
    vec2 uv = v_texcoord;
    vec3 vid = texture2D(u_tex0, uv).rgb;

    float asp = u_resolution.x / u_resolution.y;
    float sc = 2.0 + u_x0 * u_x0 * 16.0;
    vec2 p = (uv - 0.5) * vec2(asp, 1.0) * sc;
    vec2 ic = floor(p);
    vec2 fc = fract(p);

    float t = u_time * (0.02 + u_x1 * 0.40);

    // nine neighbours, nearest and second-nearest squared distances
    float f1 = 8.0;
    float f2 = 8.0;
    vec2 bh = vec2(0.0);
    for (int j = 0; j < 3; j++) {
        for (int i = 0; i < 3; i++) {
            vec2 g = vec2(float(i) - 1.0, float(j) - 1.0);
            vec2 h = hash2(ic + g);
            // each point orbits its cell at its own rate and phase
            vec2 o = 0.5 + 0.38 * vec2(sw(t * (0.4 + 0.6 * h.x) + h.x),
                                       cw(t * (0.4 + 0.6 * h.y) + h.y));
            vec2 d = g + o - fc;
            float dd = dot(d, d);
            if (dd < f1) { f2 = f1; f1 = dd; bh = h; }
            else if (dd < f2) { f2 = dd; }
        }
    }
    float edge = sqrt(f2) - sqrt(f1);

    // cell colour from its hash, hue creeping so the mosaic slowly cycles;
    // bass pulses every cell's brightness on its own phase
    vec3 cellcol = pal(bh.x * 0.85 + bh.y * 0.10 + t * 0.03);
    float bright = 0.60 + 0.18 * sw(t * 0.4 + bh.y)
                 + u_a0 * 0.85 * (0.5 + 0.5 * sw(t * 0.8 + bh.x))
                 + u_a1 * 0.15;
    cellcol *= bright;

    // F2-F1 ridge: highs squeeze the width so hats etch the walls sharper
    float w = max(0.30 - u_a2 * 0.20, 0.04);
    float wall = 1.0 - smoothstep(0.0, w, edge);
    vec3 col = cellcol * (1.0 - 0.55 * u_x2 * wall);
    col += vec3(1.0, 0.95, 0.82) * wall * wall * u_x2 * (0.9 + u_a2 * 0.8);

    // video shows through where the mosaic runs dark
    col = clamp(col, 0.0, 1.0);
    float m = smoothstep(0.04, 0.45, dot(col, vec3(0.299, 0.587, 0.114)));
    vec3 ground = vid * u_x3 * 0.85;
    gl_FragColor = vec4(ground * (1.0 - m) + col * m, 1.0);
}
