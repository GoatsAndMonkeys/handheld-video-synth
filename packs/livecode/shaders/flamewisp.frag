// Flamewisp: the fractal-flame look, rebuilt for a GPU that cannot run
// fractal flames. After bl4st (Cameron Alexander), a browser livecoding
// tool that renders true iterated-function-system flames — point clouds
// pushed through random affine/sinusoidal transforms with log-density
// tone mapping. That algorithm needs millions of scattered samples per
// frame; VideoCore IV gets one fragment per pixel. The bl4st repository
// also carries no licence, so nothing here is ported: this is a
// clean-room build of the look alone, written without reading the
// original source. Eight passes of a contractive sinusoidal fold, twist
// and shrink walk each pixel toward an attractor; an orbit trap (distance
// to a breathing ring) is measured every pass and shaped into stacked
// gaussian sheets, which is what reads as wisps of self-similar luminous
// smoke. Hue ramps with trap distance and pass depth the way flame
// palettes ramp with density. Bass widens the wisps, highs pull the
// filament cores tighter, the overall level lifts the glow.
//
// x0 fold character, x1 filament detail, x2 palette, x3 video blend
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

// cheap sine on a unit period: sw(x) ~ sin(2*pi*x). Real trig is emulated
// on this chip and there are dozens of these per pixel.
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }
float cw(float x) { return sw(x + 0.25); }

vec3 pal(float h) {
    return 0.5 + 0.5 * vec3(sw(h), sw(h + 0.333), sw(h + 0.667));
}

void main() {
    vec2 uv = v_texcoord;
    vec3 vid = texture2D(u_tex0, uv).rgb;

    float asp = u_resolution.x / u_resolution.y;
    vec2 p = (uv - 0.5) * vec2(asp, 1.0) * 1.5;

    float t = u_time * 0.06;

    // the map, chosen continuously by the fold knob: two fold axes swing
    // around with it, the twist angle steepens with it, the fold depth
    // ripples with it. Every value of the knob is a different attractor.
    float f = 1.1 + u_x1 * 2.4;
    vec2 k1 = vec2(cw(u_x0 * 0.43), sw(u_x0 * 0.43)) * f;
    vec2 k2 = vec2(cw(u_x0 * 0.61 + 0.29), sw(u_x0 * 0.61 + 0.29)) * f;
    float amp = 0.30 + 0.16 * sw(u_x0 * 0.9 + 0.07);
    float ang = 0.045 + u_x0 * 0.12 + 0.006 * sw(t * 0.13);
    float ca = cw(ang);
    float sa = sw(ang);

    // orbit trap: a ring that breathes slowly and swells on the kick.
    // Wisp width narrows as detail rises and widens with bass; the core
    // sheet is a much tighter gaussian that highs tighten further.
    float r = 0.30 + 0.08 * sw(t * 0.07) + u_a0 * 0.10;
    float w = (0.15 - u_x1 * 0.105) * (1.0 + u_a0 * 0.9);
    float wn = w * 0.35 / (1.0 + u_a2 * 2.2);
    float w2 = max(w * w, 1e-6);
    float wn2 = max(wn * wn, 1e-7);

    vec3 acc = vec3(0.0);
    float core = 0.0;
    for (int i = 0; i < 8; i++) {
        float fi = float(i);
        // sinusoidal fold with drifting phase, then twist and contract —
        // contraction keeps every coordinate bounded for mediump
        p += amp * vec2(sw(dot(p, k1) + t * 0.11 + fi * 0.19),
                        cw(dot(p, k2) - t * 0.09 + fi * 0.23));
        p = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y) * 0.86;

        float trap = abs(length(p) - r);
        acc += exp(-trap * trap / w2) * pal(u_x2 + fi * 0.045 + trap * 0.5 + t * 0.02);
        core += exp(-trap * trap / wn2);
    }

    float lift = 0.55 + u_a1 * 0.65;
    vec3 flame = acc * 0.17 * lift;
    // white-hot filament cores riding on top of the coloured smoke
    float c = min(core * 0.12, 1.0);
    flame += mix(pal(u_x2 + 0.06 + t * 0.02), vec3(1.0), 0.4) * c * 0.45 * lift;

    // video glows through the dark ground; the wisps mask it out where
    // they burn brightest
    float lum = clamp(max(flame.r, max(flame.g, flame.b)), 0.0, 1.0);
    vec3 ground = vid * u_x3 * 0.85;
    vec3 col = ground * (1.0 - lum) + flame;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
