// VHS playback: per-line tracking jitter with occasional hard slips,
// chroma riding a lagging smeared signal, tape noise, dropout streaks,
// and a head-switch tear at the bottom of the frame.
// x0 wear (noise + dropouts), x1 tracking (jitter + slips), x2 chroma
// bleed, x3 vertical hold (picture creeps down, snaps back, then rolls)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

// sine-free hashes: no hardware sin on this gpu
float hash1(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

float hash(vec2 p) {
    vec3 q = fract(p.xyx * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
}

// four decorrelated values for the price of one hash
vec4 hash4(vec2 p) {
    vec4 q = fract(p.xyxy * vec4(0.1031, 0.1030, 0.0973, 0.1099));
    q += dot(q, q.wzxy + 33.33);
    return fract((q.xxyz + q.yzzw) * q.zywx);
}

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    vec2 uv = v_texcoord;
    float frame = floor(u_time * 30.0);

    // vertical hold: the whole tape frame slips, so lines, dropouts and
    // the head-switch band all ride along with it
    uv.y = fract(uv.y + u_x3 * fract(u_time * 0.23));
    float line = floor(uv.y * 240.0);

    // one hash per line/frame drives jitter, slips and dropouts
    vec4 h = hash4(vec2(line, frame));

    // per-line tracking wiggle, with occasional hard slips
    float r = h.x;
    uv.x += (r - 0.5) * u_x1 * 0.006;
    float slip = step(1.0 - u_x1 * 0.04, h.y);
    uv.x += slip * (r - 0.5) * 0.12;

    // head-switch tear: the last few lines shear hard
    float band = clamp(1.0 - uv.y * 20.0, 0.0, 1.0);
    uv.x += band * (0.03 + 0.08 * hash1(frame)) * (0.3 + u_x1);

    vec3 now = texture2D(u_tex0, uv).rgb;

    // chroma lags and smears rightward; luma stays put
    float co = 0.006 + u_x2 * 0.03;
    vec3 cA = texture2D(u_tex0, uv + vec2(co, 0.0)).rgb;
    vec3 cB = texture2D(u_tex0, uv + vec2(co * 2.0, 0.002)).rgb;
    vec3 chroma = (cA + cB) * 0.5;
    vec3 c = chroma + dot(now - chroma, W);
    c = mix(now, c, clamp(u_x2 * 2.0, 0.0, 1.0));

    // tape wear: luma noise, plus dropout streaks on unlucky lines
    float n = hash(uv * 331.0 + frame);
    c += (n - 0.5) * u_x0 * 0.3;
    float dl = step(1.0 - u_x0 * 0.03, h.z);
    float seg = step(abs(uv.x - h.w), 0.05 + 0.25 * r);
    c = mix(c, vec3(0.95), dl * seg * 0.8);

    // the tear band is mostly hash
    c = mix(c, vec3(n), band * 0.6);

    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
