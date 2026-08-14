// Moire: two ruled gratings laid over each other, and the picture lives
// in their argument — video brightness bends one ruling's phase, so the
// interference fringes dislocate along every edge and the image is drawn
// by the beat pattern rather than by any pixel of it. Both rulings are
// parabola-sine of a projected coordinate; the frequency ceiling keeps a
// good few pixels per line on the 640-wide surface so the fringes stay
// fringes instead of aliasing into sand. Highs put a fine tremble into
// the modulated ruling.
//
// x0 line frequency, x1 detune (beat scale), x2 angle spread, x3 ink<->video
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a2;

// cheap sine on a unit period: sw(x) ~ sin(2*pi*x)
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }
float cw(float x) { return sw(x + 0.25); }

void main() {
    vec2 uv = (v_texcoord - 0.5) * vec2(1.33333, 1.0);
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    float lum = dot(src, vec3(0.299, 0.587, 0.114));

    // ~8 lines across at the bottom of the knob, ~70 at the top —
    // never finer than about five pixels a cycle
    float f1 = 8.0 + u_x0 * 62.0;
    float f2 = f1 * (1.0 + u_x1 * 0.16);

    // the rulings fan apart around vertical, up to ~29 degrees each way
    float a = u_x2 * 0.08;
    vec2 d1 = vec2(cw(a), sw(a));
    vec2 d2 = vec2(cw(-a), sw(-a));

    float ph = u_time * 0.04;
    float shiver = u_a2 * 0.05 * sw(u_time * 2.3);

    // soft-square rulings; luma bends the first one's phase by up to
    // three quarters of a period, which is what traces the picture
    float g1 = smoothstep(-0.4, 0.4, sw(dot(uv, d1) * f1 + lum * 0.75 + ph + shiver));
    float g2 = smoothstep(-0.4, 0.4, sw(dot(uv, d2) * f2 - ph));

    float fringe = g1 * g2;
    vec3 ink = vec3(smoothstep(0.02, 0.85, fringe));
    vec3 tinted = src * (0.30 + 0.85 * fringe);
    vec3 outc = mix(ink, tinted, u_x3);
    gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
