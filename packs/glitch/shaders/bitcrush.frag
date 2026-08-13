// bitcrush: the picture is being carried by too few bits. each channel
// sits on its own ladder, so the bands drift apart and the greys go
// false-coloured. wind it up and blocks of the frame drop whole bits —
// the value wraps and the colour lands nowhere near what was sent.
// x0 bits (depth per channel), x1 bitrot (bits dropped), x2 blocks,
// x3 split (how far apart the three ladders are pulled — all three the
// same depth at the bottom, so the greys stay grey and only banding is
// left; the 3-3-2 split this was built on at 0.5; and past that blue is
// starved down towards one bit while green keeps its levels)
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
    // which bit a block loses: the top one first, then the next down.
    // losing the top bit is a half-scale wrap — the colour inverts about
    // the middle of the range rather than drifting
    vec2 g = vec2(6.0 + floor(u_x2 * 34.0), 5.0 + floor(u_x2 * 25.0));
    vec2 blk = floor(v_texcoord * g);
    float clk = floor(u_time * (1.0 + u_x2 * 9.0));
    float ta = 1.0 - u_x1 * 0.35;
    float tb = 1.0 - u_x1 * 0.15;

    vec3 r = vec3(hash(blk + clk * 1.7),
                  hash(blk + clk * 1.7 + 19.3),
                  hash(blk + clk * 1.7 + 41.1));
    vec3 flip = step(vec3(ta), r) * 0.5 + step(vec3(tb), r) * 0.25;

    // three ladders, deepest on green where the eye sits — the classic
    // 3-3-2 split, only worse
    float L = floor(1.0 / (0.03 + u_x0 * 0.5));
    vec3 ratio = mix(mix(vec3(1.0), vec3(1.0, 1.5, 0.5), min(1.0, u_x3 * 2.0)),
                     vec3(1.6, 2.2, 0.16), max(0.0, u_x3 * 2.0 - 1.0));
    vec3 lv = max(vec3(1.0), floor(L * ratio) + step(vec3(1.4), ratio));

    vec3 c = texture2D(u_tex0, v_texcoord).rgb;
    c = fract(c + flip);                    // the dropped bits wrap round
    c = floor(c * lv + 0.5) / lv;           // and the rest quantise hard
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
