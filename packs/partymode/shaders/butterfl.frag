// After butterfly-curve-editor: Temple H. Fay's butterfly,
//   r = e^{sin t} - 2 cos 4t + sin^5((2t - pi)/24),
// public mathematics since 1989 and the reason polar plotters exist. The
// editor lets you bend each term; here the terms breathe with the music
// instead — bass beats the wings, highs sharpen the fringe. Each pixel
// measures its distance to the curve at its own angle, both branches.
//
// x0 wingspan, x1 stroke, x2 flutter, x3 video blend
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

vec3 pal(float h) {
    return 0.5 + 0.5 * vec3(sw(h), sw(h + 0.333), sw(h + 0.667));
}

float fay(float t, float flap) {
    float s = sin((2.0 * t - 3.14159265) / 24.0);
    float s5 = s * s * s * s * s;
    return exp(sin(t)) - flap * cos(4.0 * t) + s5;
}

void main() {
    vec2 uv = v_texcoord;
    vec3 vid = texture2D(u_tex0, uv).rgb;

    float asp = u_resolution.x / u_resolution.y;
    vec2 p = uv - 0.5;
    p.x *= asp;
    // the butterfly stands on its tail: rotate so the wings open upward,
    // and let the whole body sway gently
    float sway = 0.10 * sw(u_time * 0.06) * (0.5 + u_x2);
    float ca = cos(sway), sa = sin(sway);
    p = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
    float r = length(p);
    float th = atan(p.x, -p.y);          // 0 at the top, wings symmetric

    // bass beats the wings: the cos 4t term is what pinches the four
    // lobes, so driving it flaps them
    float flap = 2.0 * (0.75 + 0.25 * sw(u_time * 0.5) * (0.4 + u_x2)
                        + 0.35 * u_a0);
    float scale = (0.055 + u_x0 * 0.075) * (0.85 + 0.30 * u_a1);

    float c1 = abs(r - abs(scale * fay(th, flap)));
    float c2 = abs(r - abs(scale * fay(th + 3.14159265, flap)));
    float d = min(c1, c2);

    float w = 0.004 + u_x1 * 0.018 + 0.004 * u_a2;
    float m = 1.0 - smoothstep(w * 0.5, w, d);
    float glow = exp(-d * d / max(w * w * 34.0, 1e-6)) * 0.5;

    float hue = u_time * 0.03 + th * 0.05 + r * 0.4;
    vec3 line = pal(hue);

    vec3 ground = vid * u_x3 * 0.85;
    vec3 col = ground * (1.0 - m) + line * m + line * glow;
    gl_FragColor = vec4(col, 1.0);
}
