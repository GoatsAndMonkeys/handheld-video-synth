// After curve-edit's cardioid-braid entry: the times-table string figure.
// Mark N points round a circle, join point i to point k*i, and the chords
// crowd into an envelope — a cardioid at k=2, a nephroid at k=3, and on up.
// The picture is made of straight lines only; every curve you see is where
// they bunch.
//
// 20 chords, ALU-only, cheap sine throughout. k need not be a whole
// number, and sliding it is what makes the envelope roll open and shut.
//
// x0 multiplier, x1 chord count, x2 line weight, x3 video blend
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

void main() {
    vec2 uv = v_texcoord;
    vec3 vid = texture2D(u_tex0, uv).rgb;

    float asp = u_resolution.x / u_resolution.y;
    vec2 p = uv - 0.5;
    p.x *= asp;

    // k sweeps continuously: 2 gives the cardioid, 3 the nephroid, and the
    // fractions between them are where the envelope comes apart and reforms
    float k = 2.0 + u_x0 * 7.0 + 0.35 * sw(u_time * 0.03) + u_a0 * 0.4;
    float used = floor(6.0 + u_x1 * 14.0);      // chords actually drawn
    float R = (0.30 + 0.08 * u_a1);
    float spin = u_time * 0.02;

    float w = (0.0025 + u_x2 * 0.010) * (0.8 + 0.5 * u_a2);
    float best = 1e9;
    float glow = 0.0;
    for (int i = 0; i < 20; i++) {
        if (float(i) >= used) { break; }
        float t = float(i) / used;
        vec2 A = vec2(cw(t + spin), sw(t + spin)) * R;
        vec2 B = vec2(cw(k * t + spin), sw(k * t + spin)) * R;
        vec2 e = B - A;
        vec2 g = p - A;
        float h = clamp(dot(g, e) / max(dot(e, e), 1e-6), 0.0, 1.0);
        float d = length(g - e * h);
        best = min(best, d);
        glow += exp(-d * d / max(w * w * 30.0, 1e-8));
    }

    float m = 1.0 - smoothstep(w * 0.5, w, best);
    glow = min(glow * 0.12, 0.7);

    // the ring the chords hang from, drawn faintly so the figure reads
    float ring = 1.0 - smoothstep(0.002, 0.005, abs(length(p) - R));

    float hue = u_time * 0.04 + best * 2.0;
    vec3 line = pal(hue);

    vec3 ground = vid * u_x3 * 0.85;
    vec3 col = ground * (1.0 - max(m, ring * 0.4))
             + line * m + line * glow + pal(hue + 0.5) * ring * 0.30;
    gl_FragColor = vec4(col, 1.0);
}
