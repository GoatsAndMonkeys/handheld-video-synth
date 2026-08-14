// Droste: the picture holds a smaller, turned copy of itself, and that
// copy holds another, spiralling into the vanishing point. Built as
// feedback — each frame the previous whole output is scaled, twisted and
// recentred inside the live image, so the recursion deepens one level per
// frame for free and the spiral is really the buffer's own history. The
// inner tap is gated to the buffer and mirrored at the edge so a drifting
// centre never drags garbage in. Bass squeezes the recursion scale for a
// breath; the vanishing point can orbit slowly.
//
// x0 recursion scale, x1 twist per level, x2 centre drift, x3 live<->recursion
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output frame
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
    // the vanishing point orbits at x2 radius, two incommensurate rates
    float drift = u_x2 * 0.16;
    vec2 cen = vec2(0.5) + drift * vec2(cw(u_time * 0.037), sw(u_time * 0.023));

    // each level sits sc times smaller inside the last
    float sc = mix(0.52, 0.90, u_x0);
    sc *= 1.0 - u_a0 * 0.10;

    // twist per level as a fraction of a turn, either way from 0.5
    float turn = (u_x1 - 0.5) * 0.16;
    float s = sw(turn);
    float c = cw(turn);

    // aspect-true rotation about the centre (surface is 640x480)
    vec2 p = (v_texcoord - cen) * vec2(1.33333, 1.0);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    vec2 q = cen + p * vec2(0.75, 1.0) / max(sc, 0.05);

    // the previous frame only exists where q lands inside the buffer;
    // everywhere else the live picture is the frame around it
    vec2 inb = step(vec2(0.0), q) * step(q, vec2(1.0));
    float inside = inb.x * inb.y;

    // mirror the tap so the boundary row never streaks
    vec2 qm = 1.0 - abs(fract(q * 0.5) * 2.0 - 1.0);
    vec3 prev = texture2D(u_tex1, qm).rgb * 0.995;
    vec3 live = texture2D(u_tex0, v_texcoord).rgb;

    float fb = inside * mix(0.35, 0.985, u_x3);
    vec3 outc = mix(live, prev, fb);
    gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
