// circuit bending: stray wires across the processor board. channels get
// rotated and inverted by shorts that come and go, the supply rail sags
// into slow brightness bands, and random scan lines print themselves
// over the picture. x0 bend (channel corruption), x1 lines, x2 volts,
// x3 short (which subsystem the stray wire lands on — colour alone at
// the bottom, colour and a little geometry as built at 0.5, and past
// half it moves off the colour path onto deflection and the rail, so
// the short yanks the picture sideways and slams the level instead)
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
    float clk = floor(u_time * 2.7);
    float on = step(1.0 - u_x0 * 1.15, hash(vec2(clk, 5.0)));

    float geo = min(1.0, u_x3 * 2.0);
    float lvl = max(0.0, u_x3 * 2.0 - 1.0);

    vec2 uv = v_texcoord;
    float yank = on * (hash(vec2(clk, 33.0)) - 0.5) * u_x0 * lvl * 0.55;
    float sk = (hash(vec2(clk, 9.0)) - 0.5) * u_x0 * geo * 0.08;
    vec3 a = texture2D(u_tex0, fract(uv + vec2(yank, 0.0))).rgb;
    vec3 b = texture2D(u_tex0, fract(uv + vec2(sk + yank, 0.0))).rgb;

    // whichever short is closed this moment
    vec3 bent = mix(vec3(b.b, a.r, a.g), vec3(1.0 - a.r, b.g, a.b),
                    step(0.5, hash(vec2(clk, 21.0))));
    vec3 c = mix(a, bent, on * (0.35 + u_x0 * 0.65) * (1.0 - lvl));
    c *= 1.0 + (hash(vec2(clk, 63.0)) - 0.5) * on * lvl * 1.6;

    // rail sag: slow triangle banding drifting down the frame
    float tri = abs(fract(uv.y * (1.5 + u_x2 * 9.0) + u_time * 0.3) * 2.0 - 1.0);
    c *= 1.0 + (tri - 0.5) * u_x2 * 1.3;

    // stray lines shorted across the deflection
    float hl = step(1.0 - u_x1 * 0.07,
                    hash(vec2(floor(uv.y * 240.0), floor(u_time * 14.0))));
    float vl = step(1.0 - u_x1 * 0.045,
                    hash(vec2(floor(uv.x * 320.0) + 77.0,
                              floor(u_time * 6.0))));
    c = mix(c, vec3(1.0, 0.92, 0.72), hl * 0.85);
    c = mix(c, vec3(0.1, 0.9, 1.0), vl * 0.7);
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
