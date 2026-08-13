// circuit-bent mixer: somebody has wired the effect switches to a timer
// and is slamming them. every so often one closes — channels rotate, the
// whole frame inverts, the levels collapse to two steps, or the luma
// flips negative — the patch holds for as long as the switch is down,
// then lets go and the clean picture comes straight back.
// x0 rate (how often it fires), x1 hold (how long), x2 damage,
// x3 short (which of the four it is — at 0 the timer picks at random as
// built, and the rest of the range wires it to one switch and leaves it
// there: rotate, invert, levels, negative)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    // one wrapped ramp does both jobs: floor is which slot, fract is how
    // far into it. wrapping keeps the phase small however long we run
    float ramp = fract(u_time * (0.015 + u_x0 * 0.11)) * 32.0;
    float n = floor(ramp);
    float on = step(1.0 - (0.25 + u_x0 * 0.7), hash(vec2(n, 11.0)))
             * step(fract(ramp), 0.03 + u_x1 * 0.6);

    // a switch that hard this side of the panel yanks the picture over too
    float sx = v_texcoord.x + on * (hash(vec2(n, 41.0)) - 0.5) * u_x2 * 0.55;
    vec3 c = texture2D(u_tex0, vec2(fract(sx), v_texcoord.y)).rgb;

    // four shorts on the board, one of them closed at a time
    float lv = 5.0 - floor(u_x2 * 3.0);
    float m = mix(hash(vec2(n, 27.0)),
                  min(3.0, floor(max(0.0, u_x3 - 0.2) * 5.0)) * 0.25 + 0.125,
                  step(0.2, u_x3));
    vec3 bent = mix(vec3(c.g, c.b, c.r), 1.0 - c, step(0.25, m));
    bent = mix(bent, floor(c * lv + 0.5) / lv, step(0.5, m));
    bent = mix(bent, vec3(1.0 - dot(c, W)), step(0.75, m));

    gl_FragColor = vec4(mix(c, bent, on * (0.55 + u_x2 * 0.45)), 1.0);
}
