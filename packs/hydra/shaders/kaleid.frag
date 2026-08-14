// Kaleid: fold the frame into an n-sided kaleidoscope around the centre —
// hydra's kaleid(nSides) (Olivia Jack's browser video synth), reimplemented
// from scratch. One real atan finds the polar angle; the fold itself is a
// fract on a unit period and the direction comes back through the parabola
// sine, so that atan is the only hardware trig in the shader.
// x0 sides (2..12 whole sectors), x1 zoom, x2 spin, x3 drift — at 0 the
// mirror axis is locked dead centre, turned up it wanders slowly on two
// incommensurate waves, which is what keeps a long run alive. Bass breathes
// the zoom a little. The folded sample mirror-wraps at the frame edge so
// the kaleidoscope never smears a border pixel outward.
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;

// cheap sine on a unit period: sw(x) ~ sin(2*pi*x)
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }
float cw(float x) { return sw(x + 0.25); }

void main() {
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);

    // the mirror centre: two slow waves at unrelated rates trace a
    // lissajous wander, small enough that the axis stays on screen
    vec2 c = vec2(0.5) + u_x3 * 0.22 *
        vec2(sw(u_time * 0.031), sw(u_time * 0.043 + 0.37));

    vec2 p = v_texcoord - c;
    p.x *= aspect;

    float r = length(p);
    // 2 sectors at the bottom of the knob, 12 at the top
    float sector = 1.0 / floor(2.0 + u_x0 * 10.999);
    // polar angle on a unit period (1/2pi), spun by the rotation knob
    float a = atan(p.y, p.x) * 0.15915494 + u_time * u_x2 * 0.11;
    // fold every sector onto one and mirror its halves onto each other:
    // that reflection is what makes seams meet instead of cut
    a = abs(fract(a / sector) - 0.5) * sector;

    // zoom pulls from wide (2.2x out) to close (0.45x); bass leans in
    r *= mix(2.2, 0.45, u_x1) * (1.0 - u_a0 * 0.12);

    p = r * vec2(cw(a), sw(a));
    p.x /= aspect;
    // mirrored repeat: out-of-frame folds bounce back instead of streaking
    vec2 s = 1.0 - abs(1.0 - 2.0 * fract((p + c) * 0.5));

    gl_FragColor = vec4(texture2D(u_tex0, s).rgb, 1.0);
}
