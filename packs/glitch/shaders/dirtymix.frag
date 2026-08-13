// dirty video mixing: two sources that were never genlocked, forced
// through one mixer. the previous output is the loose source — it
// scrolls sideways at its own rate, tears into lines, and the summed
// levels run past legal and wrap into false colour.
// x0 drift (scroll rate), x1 mix (loose source level), x2 break,
// x3 axis — which way it has come loose: rolling straight up at the
// bottom, the sideways drift this was built on at 0.5, back the other
// way at the top
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output = the unsynced source
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
    float rate = 0.04 + u_x0 * 0.7;
    vec2 dir = mix(mix(vec2(0.06, 1.0), vec2(1.0, 0.17), min(1.0, u_x3 * 2.0)),
                   vec2(-1.0, -0.35), max(0.0, u_x3 * 2.0 - 1.0));
    vec2 duv = v_texcoord + fract(u_time * rate * dir);

    // whole lines of the loose source lose their place
    float r = hash(vec2(floor(v_texcoord.y * 48.0), floor(u_time * 9.0)));
    duv.x += step(0.7, r) * (r - 0.5) * u_x2 * 1.6;
    duv = fract(duv);

    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    vec3 loose = texture2D(u_tex1, duv).rgb;

    // no genlock, no clamp: the sum overflows and folds the colour.
    // gains stay under unity round the feedback loop or the mixer just
    // sits there screaming noise at itself
    vec3 sum = src + loose * (0.15 + u_x1 * 0.4);
    vec3 fold = fract(sum * (1.0 + u_x2));
    vec3 c = mix(min(sum, 1.0), fold, u_x2 * 0.75);
    gl_FragColor = vec4(mix(src, c, 0.2 + u_x1 * 0.6), 1.0);
}
