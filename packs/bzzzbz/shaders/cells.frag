/** @file cells.glsl
 *
 * @brief Example shader used to demonstrate BZZZBZ. Audio reactive and can also be controlled with potentiometers.
 * @author Peter Nagy (deetrone)
 *
 */
// Source: bzzzbz (https://github.com/daviderovell0/bzzzbz), src/shaders/cells.glsl, GPL-3.0.
// Ported to the HVS-80 shader convention. The original's own note:
//   "The pattern is based on five cells (cellular noise) created with the loop
//    and the interaction of shaping functions."
// Five fixed feature points; every pixel takes the distance to its nearest one,
// and two shaping waves ring outward off that distance field. Where the two
// waves cancel, the original's divide blows out into bright filaments — that
// blue-white lacework is the whole signature, so it is kept (guarded).
// x0 bands (ring frequency), x1 moire (second wave), x2 video
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_a0;
uniform float u_a1;
uniform float u_a2;

// the original rings on sin(); five of those per pixel is more than the
// VideoCore will give up, so this parabola pair stands in for sin(2pi x)
float wav(float x) {
    float t = fract(x) - 0.5;
    return 16.0 * t * (abs(t) - 0.5);
}

void main() {
    // the original's off-centre framing, kept: X - 0.42, Y + 0.2
    vec2 st = vec2(v_texcoord.x - 0.42, v_texcoord.y + 0.2);

    // nearest of the five cell centres. squared distances all the way down,
    // one sqrt at the end — min(sqrt a, sqrt b) == sqrt(min(a, b))
    vec2 d = st - vec2(0.0, 0.2);   float m = dot(d, d);
    d = st - vec2(0.8, 0.4);        m = min(m, dot(d, d));
    d = st - vec2(0.5, 0.8);        m = min(m, dot(d, d));
    d = st - vec2(1.0, 1.0);        m = min(m, dot(d, d));
    d = st - vec2(0.1, 1.0);        m = min(m, dot(d, d));
    float md = sqrt(m);

    // video: luma bends the ring phase, so at full mix the bands contour
    // the picture instead of the empty plane
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    float lum = dot(src, vec3(0.299, 0.587, 0.114));

    // the original swept ring frequency across a huge range as A turned;
    // bass pushes it the way the fft bins used to
    float k = (4.0 + 320.0 * u_x0 * u_x0) * (1.0 + 1.6 * u_a0);
    float ph = u_time * 0.06 + u_a1 * 0.7 + u_x2 * lum * 4.5;
    float c1 = wav(md * st.x * k + ph);

    // second, much finer wave along Y*X — the original got this out of a
    // tan() inside a pow(); the moire it left behind is what mattered
    float k2 = (8.0 + 900.0 * u_x1 * u_x1) * (1.0 + 1.2 * u_a2);
    float c2 = 0.3 * wav(md * st.y * st.x * k2 + ph * 1.7);

    float s = c1 + c2;
    float inv = 0.2 * c1 / (abs(s) + 0.32);   // the blow-out, kept but guarded
    float pat = 0.8 * s + inv;

    // hue as published: red coefficient 0.0, green 0.72, blue 1.0 — the thing
    // is blue-cyan by construction. highs are allowed a little red on top.
    vec3 col = vec3(u_a2 * 0.5 * pat,
                    0.72 * pat,
                    0.8 * (s + u_a1 * 0.6) + inv);

    // at full video the lacework keys the incoming picture instead of itself
    col = mix(col, src * clamp(pat + 0.15, 0.0, 1.6), u_x2);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
