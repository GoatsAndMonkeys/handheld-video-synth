// mdwave — MilkDrop's waveform: the luminous scope ribbon drawn over the
// warped frame. There is no sample buffer on this instrument, so the trace
// is synthesised — three house-sine harmonics at different frequencies,
// each driven by one of the three audio bands, summed into a vertical
// displacement so it wiggles the way a scope does. Additive glow with a
// thickness falloff, laid over the feedback buffer so the ribbon trails
// behind itself. The additive gain shrinks as the trail lengthens, which
// is what keeps a long smear from stacking up into a white sash.
//
// After MilkDrop's engine (MilkDrop3 / BeatDrop, BSD 3-Clause, Copyright
// (c) 2018 Maxim Volskiy and individual contributors, descending from Ryan
// Geiss's Nullsoft MilkDrop 2). Reimplemented from the documented
// behaviour of that engine; no .milk preset content is used anywhere in
// this pack — presets belong to their own authors and are not covered by
// that grant. The notice is carried in the pack LICENSE.
//
// x0 amplitude, x1 thickness + glow, x2 harmonics, x3 trail
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;
uniform float u_a1;
uniform float u_a2;

// house sine, period 1, no hardware trig
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }
float cw(float x) { return sw(x + 0.25); }

void main() {
    float p = fract(u_time * 0.29);
    float q = fract(u_time * 0.17);

    // harmonics fade in one at a time across the knob
    float h1 = clamp(u_x2 * 2.0, 0.0, 1.0);
    float h2 = clamp(u_x2 * 2.0 - 1.0, 0.0, 1.0);

    float x = v_texcoord.x;
    float w = sw(x * 1.3 + p) * (0.55 + u_a0 * 0.90);
    w += cw(x * 3.7 - q * 1.7) * 0.50 * h1 * (0.35 + u_a1 * 1.00);
    w += sw(x * 8.9 + p * 2.1) * 0.28 * h2 * (0.25 + u_a2 * 1.30);

    // a floor under the level term so the trace is alive in silence
    float amp = (0.04 + u_x0 * 0.30) * (0.45 + u_a1 * 0.55);
    float y = 0.5 + w * amp;

    float th = 0.004 + u_x1 * 0.030;
    float dist = abs(v_texcoord.y - y);
    float g = th / (dist + th);
    g = g * g * (0.50 + u_x1 * 0.70);

    // the trail tap creeps outward a hair so old ribbons disperse rather
    // than stacking on the spot
    vec2 tc = clamp((v_texcoord - 0.5) * 0.994 + 0.5, 0.002, 0.998);
    float f = 0.70 + u_x3 * 0.25;
    vec3 prev = texture2D(u_tex1, tc).rgb * f;
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    vec3 bed = max(prev, src * 0.42);

    // ink per frame falls as the trail lengthens: the ribbon settles at the
    // same brightness either way, it just takes longer to get there
    float ink = (1.0 - f) * 2.70;
    vec3 tint = vec3(0.55 + u_a0 * 0.45, 0.85, 1.0);
    vec3 outc = bed + tint * g * ink;
    gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
