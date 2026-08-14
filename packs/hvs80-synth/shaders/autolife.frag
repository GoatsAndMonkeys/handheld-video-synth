// After artificial_life, Andrei Jay's "generative video oscillator system":
// a field of slow oscillators — two plane waves at skewed angles, two
// radial ones drifting off-centre, and a hyperbolic fifth voice — beating
// against each other, with the sum quantized into soft organic bands, like
// level curves of a sea that keeps rearranging itself. Where lifeosc chases
// the video with phase-mod chaos and feedback ring-mod, this is the pure
// oscillator organism: no feedback, nothing modulated by the picture, just
// interference breathing with the music.
//
// x0 scale, x1 tangle, x2 cycle, x3 video blend
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

// cheap sine on a unit period: sw(x) ~ sin(2*pi*x) — eleven of these per
// pixel is fine, eleven emulated sins per pixel is a slideshow
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }
float cw(float x) { return sw(x + 0.25); }

vec3 pal(float h) {
    return 0.5 + 0.5 * vec3(sw(h), sw(h + 0.333), sw(h + 0.667));
}

void main() {
    vec2 p = v_texcoord - 0.5;
    p.x *= u_resolution.x / u_resolution.y;

    float f = 1.5 + u_x0 * 6.5;            // cycles across the screen
    float k = u_x1;                        // how many voices join in
    float t = u_time;

    // frequencies sit at irrational-ish ratios so the field never repeats;
    // the radial voices' centres wander, the bass leans on one of them
    float field = sw(dot(p, vec2(0.9, 0.44)) * f + t * 0.043);
    field += sw(dot(p, vec2(-0.35, 0.94)) * f * 1.31 - t * 0.031)
             * (0.4 + 0.6 * k);
    field += sw(length(p - vec2(0.22 * sw(t * 0.011), 0.14)) * f * 0.83
                + t * 0.037 + u_a0 * 0.3) * (0.3 + 0.7 * k);
    field += sw(length(p + vec2(0.18, 0.12 * cw(t * 0.013))) * f * 1.7
                - t * 0.027) * k;
    field += sw(p.x * p.y * f * 2.6 + t * 0.05) * k * (0.5 + u_a2);

    field *= 0.28 * (0.75 + 0.5 * u_a1);   // level breathes with the room

    // a sine of the field turns its slopes into level curves — the bands —
    // and the tangle knob packs the contours tighter as voices pile in
    float bands = 0.5 + 0.5 * sw(field * (1.5 + k * 2.0));

    float hue = field * (0.10 + u_x2 * 0.25) + t * (0.01 + u_x2 * 0.10);
    vec3 col = pal(hue) * (0.25 + 0.75 * bands);

    vec3 vid = texture2D(u_tex0, v_texcoord).rgb;
    gl_FragColor = vec4(clamp(mix(col, vid, u_x3 * 0.8), 0.0, 1.0), 1.0);
}
