/** @file wavepatterns.glsl
 *
 * @brief Example shader to demonstrate SPI control of BZZZBZ.
 *
 * @author Marcell Illyes (marcellillyes)
 *
 */
// Source: bzzzbz (https://github.com/daviderovell0/bzzzbz), src/shaders/wavepatterns.glsl, GPL-3.0.
// Ported to the HVS-80 shader convention. The original's own note: "The 'if'
// statement is used to draw the shapes" — one wave down the frame plus one
// across it, and a mod() test that lights only the pixels sitting on a contour
// of their sum. Iso-lines of an interference field, and they drift.
// The published colouring is kept: red everywhere, green climbing with height,
// a trace of blue. Line thickness was knob C; here the music breathes it.
// x0 freq, x1 fold (contour density), x2 video
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_a0;
uniform float u_a1;
uniform float u_a2;

// stands in for sin(2pi x) — the original called cos() and sin() per pixel
float wav(float x) {
    float t = fract(x) - 0.5;
    return 16.0 * t * (abs(t) - 0.5);
}

void main() {
    float x = v_texcoord.x;
    float y = v_texcoord.y;

    // video: luma shifts the phase, so at full mix the contours become a
    // topographic map of the incoming frame
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    float lum = dot(src, vec3(0.299, 0.587, 0.114));
    float warp = u_x2 * lum * 1.2;

    // the original's two carriers, near enough its 5-ish cycles per axis
    float fy = 1.0 + 5.5 * u_x0;
    float fx = 1.0 + 5.5 * u_x0 * 1.15;      // slightly detuned, as published
    float amp = (0.5 + 7.5 * u_x1) * (1.0 + 1.1 * u_a0);   // bass folds it harder
    float v = amp * (wav(y * fy + u_time * 0.030 + warp)
                   + wav(x * fx + u_time * 0.045 + warp));

    // light only the pixels standing on a contour. knob C set this width in
    // the original; highs and level do it here, so the lines swell on transients
    float duty = 0.08 + 0.30 * u_a2 + 0.12 * u_a1;
    float line = step(fract(v), duty);

    // published hue: r 1.0, g rises up the frame, b 0.1
    vec3 col = vec3(1.0, (0.5 + 0.2 * u_x0) * y, 0.1) * line;
    col = mix(col, src * (0.25 + 1.5 * line), u_x2);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
