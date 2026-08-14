// After curve-edit's three spirals — Archimedean (r = a·t), Fermat
// (r = a·√t) and the golden/logarithmic spiral — put on one knob so the
// arms tighten and loosen continuously instead of switching.
//
// Analytic: instead of walking the curve, invert it. Given this pixel's
// radius, work out which turn of the spiral would pass through it, then
// measure the angular gap to the turn that actually does.
//
// x0 tightness, x1 type, x2 arms, x3 video blend
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

const float TAU = 6.2831853;

float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }

vec3 pal(float h) {
    return 0.5 + 0.5 * vec3(sw(h), sw(h + 0.333), sw(h + 0.667));
}

void main() {
    vec2 uv = v_texcoord;
    vec3 vid = texture2D(u_tex0, uv).rgb;

    float asp = u_resolution.x / u_resolution.y;
    vec2 p = uv - 0.5;
    p.x *= asp;
    float r = max(length(p), 1e-4);
    float th = atan(p.y, p.x) / TAU + 0.5;          // 0..1 around

    // type: 0.5 = Fermat (arms wide out, tight in), 1.0 = Archimedean
    // (even spacing), above = arms that crowd outward
    float pw = 0.45 + u_x1 * 1.15;
    float a = (0.05 + u_x0 * 0.28) * (0.85 + 0.3 * u_a1);
    float arms = floor(1.0 + u_x2 * 5.0);

    // which turn would reach this radius, and how far the real one is
    float turns = pow(r / a, 1.0 / pw);              // in revolutions
    float spin = u_time * (0.05 + 0.06 * u_a0);
    float gap = fract((turns - th + spin) * arms);
    gap = min(gap, 1.0 - gap);                       // nearest arm either way

    // convert the angular gap into a screen distance: local spacing between
    // turns is dr/dturn, so a fixed stroke stays a fixed stroke everywhere
    float spacing = a * pw * pow(max(turns, 1e-3), pw - 1.0) / max(arms, 1.0);
    float d = gap * max(spacing, 1e-4);

    float w = (0.10 + 0.16 * u_a2) * max(spacing, 1e-4);
    float m = 1.0 - smoothstep(w * 0.5, w, d);
    float glow = exp(-d * d / max(w * w * 8.0, 1e-8)) * 0.35;

    // colour runs along the arm, so the spiral reads as travelling outward
    float hue = u_time * 0.05 + turns * 0.12;
    vec3 line = pal(hue);

    vec3 ground = vid * u_x3 * 0.85;
    vec3 col = ground * (1.0 - m) + line * m + line * glow;
    gl_FragColor = vec4(col, 1.0);
}
