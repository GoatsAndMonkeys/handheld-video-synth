// After Hydra's noise() source (hydra-synth, Olivia Jack, AGPL-3.0): a
// drifting field of soft value noise. Hydra scrolls simplex noise through a
// third dimension; this rebuild is written from scratch as classic 2D value
// noise — hash the lattice corners, smooth-bilinear between them — summed
// over three unrolled octaves. The field wanders on a slow bounded orbit
// instead of scrolling forever, which keeps the coordinates small enough
// for a mediump GPU. The corner hash is the classic fract(sin(n)*43758.55)
// scramble done as one vec4 sin per octave; those three sins are the entire
// trig spend, everything else runs on the cheap parabola sine.
//
// x0 scale, x1 drift speed, x2 contrast shaping, x3 video blend
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

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0;
    vec4 h = fract(sin(vec4(n, n + 1.0, n + 57.0, n + 58.0)) * 43758.5453);
    return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
}

void main() {
    vec2 uv = v_texcoord;
    vec3 vid = texture2D(u_tex0, uv).rgb;

    float asp = u_resolution.x / u_resolution.y;
    float sc = 1.5 + u_x0 * u_x0 * 14.0;
    vec2 p = (uv - 0.5) * vec2(asp, 1.0) * sc;

    // bounded Lissajous wander instead of an ever-growing scroll; bass
    // shoves the whole field a little so kicks make the clouds lurch
    float t = u_time * (0.015 + u_x1 * 0.28);
    vec2 drift = vec2(sw(t * 0.310), cw(t * 0.233)) * 2.5;
    drift += vec2(u_a0 * 0.45, u_a0 * 0.20);
    p += drift;

    // three octaves, unrolled, each offset so the lattices never line up
    float n = 0.571 * vnoise(p)
            + 0.286 * vnoise(p * 2.03 + vec2(13.1, 7.7))
            + 0.143 * vnoise(p * 4.05 + vec2(5.3, 27.9));

    // contrast shaping: linear cloud at 0, inky thresholded blobs up high;
    // the overall level breathes the gain so the field pumps with the music
    float gain = (1.0 + u_x2 * u_x2 * 14.0) * (0.75 + u_a1 * 0.8);
    float g = clamp((n - 0.5) * gain + 0.5, 0.0, 1.0);

    // mostly monochrome like the original, with a faint slow colour wash;
    // highs tip a touch more colour in
    float h = 0.6 + 0.1 * sw(t * 0.05) + g * 0.12;
    vec3 tint = 0.5 + 0.5 * vec3(sw(h), sw(h + 0.333), sw(h + 0.667));
    vec3 fld = mix(vec3(g), tint * g, 0.22 + u_a2 * 0.25);

    vec3 ground = vid * u_x3 * 0.85;
    vec3 col = ground * (1.0 - g) + fld;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
