/** @file spectrum_slow.glsl
 *
 * @brief An earlier implementation of spectrum.glsl, that caused performance issues, demonstrates the limitations of loops in GLSL.
 *
 * @author Marcell Illyes (marcellillyes)
 *
 */
// Source: bzzzbz (https://github.com/daviderovell0/bzzzbz), src/shaders/spectrum_slow.glsl, GPL-3.0.
// Ported to the HVS-80 shader convention. This is the file the bzzzbz authors
// kept as a warning — a 33-pass loop over the fft to lay out 32 gapped columns,
// which "leads to serious performance issues on the Pi". The look is worth
// keeping and the loop is not: floor()/fract() place the columns in one pass.
// So this is the same meter, made affordable, and given LED segmentation and a
// VU heat ramp to hold it apart from the continuous fill of spectrum.frag.
// x0 leds, x1 drive, x2 video
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
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
    // 32 columns at roughly the original's 64% duty, no loop
    float col32 = v_texcoord.x * 32.0;
    float xb = floor(col32);
    float gap = step(fract(col32), 0.64);
    float p = (xb + 0.5) / 32.0;

    // three bands across the width, standing in for the 513-bin fft
    float wl = 1.0 - smoothstep(0.0, 0.55, p);
    float wh = smoothstep(0.45, 1.0, p);
    float band = wl * u_a0 + max(0.0, 1.0 - wl - wh) * u_a1 + wh * u_a2;

    // each column on its own clock so the meter idles alive in silence
    float seed = fract(xb * 0.7548 + 0.13);
    float flut = 0.40 + 0.60 * abs(wav(u_time * (0.19 + seed * 0.7) + seed * 5.0));

    // at full video mix the column heights read the picture across the middle
    float plum = dot(texture2D(u_tex0, vec2(p, 0.5)).rgb, vec3(0.299, 0.587, 0.114));

    float drive = 0.5 + 2.2 * u_x1;
    float h = clamp((0.20 + 1.4 * band) * flut * drive + u_x2 * plum * 0.9,
                    0.0, 1.0) * (1.0 - 0.25 * p);

    // stack the column out of discrete lamps rather than filling it solid
    float leds = 4.0 + floor(u_x0 * 20.0);
    float seg = floor(v_texcoord.y * leds);
    float lit = step(seg / leds + 0.5 / leds, h);
    float lamp = step(fract(v_texcoord.y * leds), 0.78);
    float on = gap * lit * lamp;

    // the original painted a flat 0.5 grey; the top of the stack runs hot
    float heat = seg / leds;
    vec3 vu = mix(vec3(0.5, 0.62, 0.5),
                  mix(vec3(1.0, 0.72, 0.15), vec3(1.0, 0.15, 0.1),
                      smoothstep(0.72, 0.95, heat)),
                  smoothstep(0.35, 0.8, heat));

    vec3 tint = mix(vu, texture2D(u_tex0, v_texcoord).rgb * 1.4, u_x2);
    gl_FragColor = vec4(clamp(tint * on, 0.0, 1.0), 1.0);
}
