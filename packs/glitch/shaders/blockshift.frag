// blockshift: the decoder is handed motion vectors that point nowhere
// near where the block actually came from, so whole tiles arrive dragged
// in from the wrong part of the picture, and the ones whose slice never
// turned up just keep showing what was already in the buffer. a vector
// stands until the next slice arrives, so blocks sit wrong for a while
// instead of shimmering every frame.
// x0 size (block grid), x1 shift (how wrong the vectors point), x2 hold,
// x3 aspect (the shape of the block the decoder thinks it is filling —
// tall columns at the bottom, the squarish macroblock this was built on
// at 0.5, and at the top the flat wide strips a lost slice leaves)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output = the decoded frame buffer
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
    vec2 g = vec2(floor(4.0 + (1.0 - u_x0) * 26.0));
    float ar = mix(mix(0.12, 1.0, min(1.0, u_x3 * 2.0)), 6.0,
                   max(0.0, u_x3 * 2.0 - 1.0));
    g.y = max(1.0, floor(g.x * 0.75 * ar));
    vec2 blk = floor(v_texcoord * g);

    // every block runs its own slice clock so they don't all re-roll on
    // the same tick — hold long enough and they stop arriving at all
    float rate = 8.0 - u_x2 * 7.6;
    float clk = floor(u_time * rate + hash(blk) * 4.0);
    vec2 s = blk + clk * 2.3;
    float r1 = hash(s);
    float r2 = hash(s + 37.9);

    float bad = step(1.0 - u_x1 * 0.8, r1);
    float held = bad * step(0.62 - u_x2 * 0.3, fract(r1 * 7.3));

    // most vectors are only a little wrong; the cube keeps the wild ones
    // rare, and they are the blocks pulled in from across the frame
    vec2 d = vec2(r2, fract(r2 * 13.7)) - 0.5;
    d *= abs(d) * 4.0;
    vec2 uv = fract(v_texcoord + d * bad * (0.01 + u_x1 * 0.35));

    vec3 c = texture2D(u_tex0, uv).rgb;
    vec3 stale = texture2D(u_tex1, v_texcoord).rgb;
    gl_FragColor = vec4(mix(c, stale, held), 1.0);
}
