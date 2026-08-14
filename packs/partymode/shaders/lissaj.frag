// After curve-edit's Lissajous entry: x = sin(a·t + phase), y = sin(b·t),
// the figure two tuning forks draw on an oscilloscope. Whole-number ratios
// close into a standing knot; a hair off and the knot rolls over on itself
// forever, which is the state worth performing with.
//
// No closed form for "distance to a Lissajous", so this walks the curve —
// 24 segments, no texture fetches inside, the heaviest shader in the pack
// but still ALU-only. Each pixel keeps the nearest segment and a summed
// glow, which reads as phosphor rather than as a polyline.
//
// x0 ratio, x1 phase drift, x2 trace weight, x3 video blend
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

// cheap sine on a unit period: sw(x) ~ sin(2*pi*x). The chip has no
// hardware trig, and 48 of them per pixel is not the place to find out.
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

    // ratio lands near whole numbers but never exactly: the small offset is
    // what keeps the figure tumbling instead of standing still
    float a = 1.0 + floor(u_x0 * 5.0);
    float b = a + 1.0 + floor(u_x0 * 3.0);
    float drift = 0.004 + u_x1 * 0.03;
    float phase = u_time * (0.05 + 0.10 * u_x1) + u_a0 * 0.25;

    float amp = (0.20 + 0.16 * u_a1);
    float w = (0.006 + u_x2 * 0.022) * (0.8 + 0.5 * u_a2);

    float best = 1e9;
    float glow = 0.0;
    vec2 prev = vec2(sw(phase) , cw(0.0)) * amp;
    for (int i = 1; i <= 24; i++) {
        float t = float(i) / 24.0;
        vec2 q = vec2(sw((a + drift) * t + phase), cw(b * t)) * amp;
        vec2 e = q - prev;
        vec2 g = p - prev;
        float h = clamp(dot(g, e) / max(dot(e, e), 1e-6), 0.0, 1.0);
        float d = length(g - e * h);
        best = min(best, d);
        glow += exp(-d * d / max(w * w * 26.0, 1e-8));
        prev = q;
    }

    float m = 1.0 - smoothstep(w * 0.5, w, best);
    glow = min(glow * 0.16, 0.8);

    float hue = u_time * 0.04 + best * 1.5;
    vec3 line = pal(hue);

    vec3 ground = vid * u_x3 * 0.85;
    vec3 col = ground * (1.0 - m) + line * m + line * glow;
    gl_FragColor = vec4(col, 1.0);
}
