/** @file spectrum.glsl
 *
 * @brief Example shader demonstrating audio reactive capabilites and can be used to test real time responsiveness.
 * @author Marcell Illyes (marcellillyes), Davide Rovelli (daviderovell0)
 *
 */
// Source: bzzzbz (https://github.com/daviderovell0/bzzzbz), src/shaders/spectrum.glsl, GPL-3.0.
// Ported to the HVS-80 shader convention. The original bins a 513-point fft
// across the screen and fills each column white up to fft[bin]. We do not get
// 513 bins — we get three bands (u_a0 bass / u_a1 level / u_a2 highs) — so the
// envelope is interpolated across those three and each column is given its own
// flutter, which is what a real analyser looks like anyway. Peak-hold decay
// (the falling caps) comes off the feedback buffer.
// x0 bins, x1 hold, x2 video
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_a0;
uniform float u_a1;
uniform float u_a2;

float wav(float x) {
    float t = fract(x) - 0.5;
    return 16.0 * t * (abs(t) - 0.5);
}

void main() {
    // "Casting creates the bin" — floor() does the same job without the int
    float bins = 8.0 + floor(u_x0 * 56.0);
    float xb = floor(v_texcoord.x * bins);
    float p = (xb + 0.5) / bins;            // where this column sits, 0..1

    // three bands smeared across the width: bass at the left, highs at the right
    float wl = 1.0 - smoothstep(0.0, 0.55, p);
    float wh = smoothstep(0.45, 1.0, p);
    float band = wl * u_a0 + max(0.0, 1.0 - wl - wh) * u_a1 + wh * u_a2;

    // per-column flutter, each one on its own clock, so the bank still moves
    // when nothing is playing (with no audio source every u_a is flat zero)
    float seed = fract(xb * 0.7548 + 0.13);
    float flut = 0.45 + 0.55 * abs(wav(u_time * (0.09 + seed * 0.30) + seed * 7.0));

    // probe the picture one row up the middle: at full video mix the bank
    // traces the frame's own brightness across the width
    vec3 probe = texture2D(u_tex0, vec2(p, 0.5)).rgb;
    float plum = dot(probe, vec3(0.299, 0.587, 0.114));

    float amp = 0.40 + 1.4 * band + u_x2 * plum * 0.9;
    float bar = clamp(amp * flut, 0.0, 1.0) * (1.0 - 0.32 * p);  // spectra fall off

    float level = step(v_texcoord.y, bar);
    float cap = step(abs(v_texcoord.y - bar), 0.018);            // lit top edge

    // white as published; video fills the columns as the mix comes up
    vec3 fill = mix(vec3(1.0), texture2D(u_tex0, v_texcoord).rgb * 1.4, u_x2);
    vec3 col = fill * level * 0.85 + vec3(0.65, 0.9, 1.0) * cap;

    // peak hold: last frame, faded — the caps fall back down through it
    vec3 prev = texture2D(u_tex1, v_texcoord).rgb * mix(0.55, 0.90, u_x1);
    gl_FragColor = vec4(clamp(max(col, prev), 0.0, 1.0), 1.0);
}
