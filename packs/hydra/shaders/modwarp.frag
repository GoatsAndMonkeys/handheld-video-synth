// Modwarp: displace the sampling point by a generated oscillator field —
// hydra's modulate(osc(...)) (Olivia Jack's browser video synth),
// reimplemented from scratch: the classic hydra look of video flowing
// through invisible sine currents. The oscillator is never drawn, only its
// push on the coordinates is visible. All waves are the cheap parabola
// sine on a unit period — no hardware trig at all.
// x0 frequency (broad swells to tight ribbons), x1 warp depth, x2 scroll
// (the current flows past), x3 axis: 0 pushes horizontally only, up mixes
// in a crossed vertical wave until the field swirls in full 2D. Bass adds
// warp depth, highs add a fine fast ripple on top. The warped sample
// mirror-wraps at the frame edge so a hard push never smears the border.
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;
uniform float u_a2;

// cheap sine on a unit period: sw(x) ~ sin(2*pi*x)
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }
float cw(float x) { return sw(x + 0.25); }

void main() {
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    // aspect-corrected field coordinate so the currents run at the same
    // spatial rate in both directions
    vec2 q = v_texcoord;
    q.x *= aspect;

    float freq = mix(1.5, 14.0, u_x0);
    float t = u_time * u_x2 * 0.35;

    // squared so the low half of the knob is a gentle shimmer; bass leans on it
    float amp = u_x1 * u_x1 * 0.16 + u_a0 * 0.05;

    // the horizontal push, phase-crossed against the vertical wave: each
    // axis reads the other's coordinate, which is what makes it swirl
    // rather than just stretch
    vec2 off;
    off.x = sw(q.y * freq + t);
    off.y = u_x3 * cw(q.x * freq * 1.27 - t * 0.83 + 0.31);

    // fine fast ripple riding the highs
    off.x += u_a2 * 0.35 * sw(q.y * 41.0 + u_time * 1.9);

    vec2 uv = v_texcoord + amp * vec2(off.x / aspect, off.y);
    // mirrored repeat keeps a strong warp from streaking the frame edge
    vec2 s = 1.0 - abs(1.0 - 2.0 * fract(uv * 0.5));

    gl_FragColor = vec4(texture2D(u_tex0, s).rgb, 1.0);
}
