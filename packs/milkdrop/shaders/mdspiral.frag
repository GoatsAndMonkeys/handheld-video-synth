// mdspiral — the Geiss spiral, the tunnel every MilkDrop set falls into
// eventually. Coordinates are turned by an angle that grows with radius:
// the edge of the frame rotates further each pass than the middle does, so
// a straight line becomes a spiral within a handful of frames. No atan and
// no log are needed for it — radius-scaled rotation on the house sine is
// the whole trick. The feedback buffer turns the spiral into a tunnel, and
// the zoom knob is the suck down it.
//
// After MilkDrop's engine (MilkDrop3 / BeatDrop, BSD 3-Clause, Copyright
// (c) 2018 Maxim Volskiy and individual contributors, descending from Ryan
// Geiss's Nullsoft MilkDrop 2). Reimplemented from the documented
// behaviour of that engine; no .milk preset content is used anywhere in
// this pack — presets belong to their own authors and are not covered by
// that grant. The notice is carried in the pack LICENSE.
//
// x0 twist per radius (0.5 = flat), x1 zoom rate (0.5 = still),
// x2 tint drift, x3 video blend
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

// house sine, period 1, no hardware trig
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }
float cw(float x) { return sw(x + 0.25); }

// hue walked around the grey axis, then rescaled so the brightest channel
// is no brighter than it started — a rotation alone can push a saturated
// colour past 1 and creep the tunnel toward white over a long set
vec3 tintRotate(vec3 c, float turns) {
    const vec3 k = vec3(0.57735);
    float ca = cw(turns);
    float sa = sw(turns);
    vec3 t = max(c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca), 0.0);
    float mc = max(c.r, max(c.g, c.b));
    float mt = max(t.r, max(t.g, t.b));
    return t * min(1.0, mc / max(mt, 1e-3));
}

void main() {
    float asp = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 c = (v_texcoord - 0.5) * vec2(asp, 1.0);
    float r = length(c);

    // the twist itself: a small base turn plus a share of it per unit of
    // radius, signed, so the spiral winds either way from the middle
    float tw = (u_x0 - 0.5) * (0.012 + r * 0.050);
    float p = fract(u_time * 0.07);
    tw += 0.004 * sw(p);            // a slow breath so a parked knob never locks

    float s = sw(tw);
    float co = cw(tw);
    vec2 rc = vec2(c.x * co - c.y * s, c.x * s + c.y * co) / mix(0.94, 1.06, u_x1);

    vec2 uv = clamp(rc / vec2(asp, 1.0) + 0.5, 0.002, 0.998);
    vec3 prev = tintRotate(texture2D(u_tex1, uv).rgb * 0.95, (u_x2 - 0.5) * 0.05);
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;

    // the live picture always feeds the mouth of the tunnel, so the centre
    // cannot starve to black however the zoom is set
    vec3 outc = max(prev, src * (0.20 + u_x3 * 0.80));
    gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
