// time-base corrector abuse: segments of the picture stop dead. on each
// stutter tick the held bands grab a frame out of the delay ring and
// then lock onto it, so they sit paused in the past while the rest of
// the frame runs live. x0 depth (how far back the ring tap reaches),
// x1 hold (how much of the frame freezes), x2 stutter (bands + rate),
// x3 fine (how finely the frame is cut up — at 0 the bands are the fat
// ones this was built with, wound up they split into line-thin slivers
// stuttering independently)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output — what a held band locks onto
uniform sampler2D u_tex2;   // ring tap at x0 depth — the moment it jumps to
uniform float u_time;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    float rate = 0.6 + u_x2 * 6.0;
    float clk = floor(u_time * rate);
    float segs = 2.0 + floor(u_x2 * 12.0 * (1.0 + u_x3 * 5.0));
    float s = floor(v_texcoord.y * segs);
    float held = step(hash(vec2(s, clk)), u_x1 * 0.92);

    vec3 live = texture2D(u_tex0, v_texcoord).rgb;
    vec3 latch = texture2D(u_tex1, v_texcoord).rgb;
    vec3 old = texture2D(u_tex2, v_texcoord).rgb;

    // each tick a held band re-grabs the ring, then locks onto itself.
    // the ring stores our own output, so a little live is folded in —
    // without it a band that keeps holding would stick on one frame
    vec3 grab = mix(old, live, 0.25);
    gl_FragColor = vec4(mix(live, mix(latch, grab,
                       step(fract(u_time * rate), 0.12)), held), 1.0);
}
