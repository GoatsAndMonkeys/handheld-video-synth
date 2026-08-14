// mdwarp — the heart of MilkDrop: the per-pixel warp field. The previous
// frame is resampled through a coordinate transform built from the three
// pieces the per-pixel stage always has — a zoom about the centre, a
// rotation, and a sinusoidal warp displacement whose dx comes from a wave
// of y and dy from a wave of x at a fixed warp scale. Each pass decays a
// little, so the field can never saturate, and the live picture keeps
// seeding structure into it, so it can never empty out either.
//
// After MilkDrop's engine (MilkDrop3 / BeatDrop, BSD 3-Clause, Copyright
// (c) 2018 Maxim Volskiy and individual contributors, descending from Ryan
// Geiss's Nullsoft MilkDrop 2). The construction is reimplemented here from
// the documented behaviour of that engine; no .milk preset content is used
// anywhere in this pack — presets belong to their own authors and are not
// covered by that grant. The notice is carried in the pack LICENSE.
//
// x0 zoom (1:1 at rest, bass pumps it), x1 rotation (0.5 = still),
// x2 warp amount, x3 video seed
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output frame — the warp buffer
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;

// house sine, period 1, no hardware trig
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }
float cw(float x) { return sw(x + 0.25); }

void main() {
    vec2 c = v_texcoord - 0.5;

    // phases wrapped to 0..1 before they reach sw(): its period is 1, so a
    // wrapped phase is continuous and mediump never holds a big number
    float p0 = fract(u_time * 0.11);
    float p1 = fract(u_time * 0.083);

    // the warp proper: cross terms, plus a slower second wave on each axis
    // so the flow knots instead of just shearing
    float amp = u_x2 * 0.055;
    float ws = 2.7;
    vec2 d;
    d.x = sw(c.y * ws + p0) + 0.45 * cw(c.x * ws * 0.63 - p1);
    d.y = cw(c.x * ws - p1) + 0.45 * sw(c.y * ws * 0.63 + p0);
    c += d * amp;

    // zoom about the centre with the bass pushing it inward, then a signed
    // small-angle rotation — a few degrees a frame is all a spiral needs
    float zoom = mix(0.90, 1.10, u_x0) + u_a0 * 0.05;
    float a = (u_x1 - 0.5) * 0.09;
    c = vec2(c.x - a * c.y, c.y + a * c.x) / zoom;

    vec2 uv = clamp(c + 0.5, 0.002, 0.998);
    vec3 prev = texture2D(u_tex1, uv).rgb * 0.94;
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;

    // max against the decayed tap: the result is bounded above by the
    // source, so no knob can wind the buffer white, and 0.94 a frame clears
    // whatever the last effect left in there inside a second
    vec3 outc = max(prev, src * (0.35 + u_x3 * 0.65));
    gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
