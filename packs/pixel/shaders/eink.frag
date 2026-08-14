// E-paper. Video luma crushed to a handful of grays on a paper ground,
// and the two things every e-reader owner knows: ghosting — the last
// page haunting this one, here the previous frame blended back in from
// the feedback buffer, mix factor capped well under 1 so ghosts always
// fade — and the periodic full refresh, that traveling black flash
// where the panel shows the negative for a beat and comes back clean.
// The wipe drops the ghost trail behind it, exactly what a real refresh
// is for. Rows behind the front are freshly settled; rows ahead still
// carry their ghosts. A hard bass slam can fire an extra sweep early.
//
// x0 ghosting, x1 refresh rate, x2 gray levels, x3 paper warmth
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output frame
uniform sampler2D u_dither;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;

void main() {
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    float lum = dot(src, vec3(0.299, 0.587, 0.114));

    // 2..6 gray levels, 4 at noon like the real panels; the Bayer nudge
    // doubles as the faint capsule grain of the display itself
    float lv = floor(2.0 + u_x2 * 4.0);
    float d = texture2D(u_dither, v_texcoord * u_resolution / 4.0).r;
    float ql = floor(clamp(lum + (d - 0.5) * 0.6 / lv, 0.0, 1.0) * (lv - 1.0) + 0.5) / (lv - 1.0);

    // paper and ink both warm together: cool gray-white to old cream
    vec3 paper = mix(vec3(0.85, 0.88, 0.92), vec3(0.94, 0.89, 0.78), u_x3);
    vec3 ink = mix(vec3(0.09, 0.10, 0.12), vec3(0.13, 0.11, 0.08), u_x3);
    vec3 fresh = mix(ink, paper, ql);
    vec3 neg = mix(ink, paper, 1.0 - ql);

    // ghosting: the previous frame refuses to fully leave. 0.85 ceiling
    // keeps at least 15% new page per frame, so ghosts pile up
    // believably but always decay — the buffer can never lock up
    vec3 prev = texture2D(u_tex1, v_texcoord).rgb;
    vec3 col = mix(fresh, prev, u_x0 * 0.85);

    // the full refresh: every few seconds a front sweeps down the panel
    // in about half a second. Inside the band the panel shows the
    // negative with a black leading edge; behind it, the clean page with
    // no ghost at all — next frame's feedback starts over from there
    float period = mix(14.0, 3.0, u_x1);
    float phase = fract(u_time / period);
    float flashFrac = 0.6 / period;
    float bw = 0.22;
    float row = 1.0 - v_texcoord.y;
    float dfr = phase / flashFrac * (1.0 + bw) - row;
    float inF = 1.0 - step(flashFrac, phase);
    float behind = step(bw, dfr);
    float inBand = step(0.0, dfr) * (1.0 - behind);
    vec3 flashcol = mix(vec3(0.03), neg, smoothstep(0.0, bw * 0.5, dfr));
    col = mix(col, fresh, inF * behind);
    col = mix(col, flashcol, inF * inBand);

    // a real slam of bass fires a spare sweep wherever its clock happens
    // to be — the panel twitching a refresh in early
    float slam = smoothstep(0.85, 0.98, u_a0);
    float d2 = fract(u_time * 0.9) * (1.0 + bw) - row;
    col = mix(col, neg, step(0.0, d2) * (1.0 - step(bw, d2)) * slam * 0.8);

    // paper tooth on top of everything, ghosts and flash included
    col += (d - 0.5) * 0.04;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
