// After Hydra's osc() source (hydra-synth, Olivia Jack, AGPL-3.0): rolling
// sinusoid colour bands, the first thing anyone types into Hydra. The idea
// is reimplemented from scratch — Hydra evaluates a sine per channel with
// the third argument pulling the red and blue phases apart; here the same
// three waves are built on the pack's cheap unit-period sine. Bass leans on
// the bands' contrast, highs feed a faint cross-ripple into the phase so
// hi-hats shimmer the stripe edges.
//
// x0 frequency, x1 sync (scroll speed), x2 colour offset, x3 video blend
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;
uniform float u_a1;
uniform float u_a2;

float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }

void main() {
    vec2 uv = v_texcoord;
    vec3 vid = texture2D(u_tex0, uv).rgb;

    // 1.5 bands at the bottom of the knob, ~26 at the top, squared so the
    // low half of the travel is where the musical band counts live
    float freq = 1.5 + u_x0 * u_x0 * 25.0;

    // Hydra's sync: how fast the whole pattern rolls sideways
    float ph = uv.x * freq + u_time * (0.02 + u_x1 * 0.55);

    // highs write a faint secondary ripple across the bands
    ph += u_a2 * 0.08 * sw(uv.y * 5.0 - u_time * 0.23);

    // colour offset: phase-shift red and blue apart around green. At 0 the
    // three channels agree (monochrome bands); up high it is full fringing.
    float offs = u_x2 * u_x2 * 0.5;
    vec3 osc = 0.5 + 0.5 * vec3(sw(ph - offs), sw(ph), sw(ph + offs));

    // bass pushes contrast about the midpoint, level keeps it breathing
    float gain = 1.0 + u_a0 * 1.6 + u_a1 * 0.4;
    osc = clamp(0.5 + (osc - 0.5) * gain, 0.0, 1.0);

    // video shows through in the troughs; with the knob down they stay dark
    float lum = dot(osc, vec3(0.299, 0.587, 0.114));
    float m = smoothstep(0.06, 0.55, lum);
    vec3 ground = vid * u_x3 * 0.85;
    vec3 col = ground * (1.0 - m) + osc * m;
    gl_FragColor = vec4(col, 1.0);
}
