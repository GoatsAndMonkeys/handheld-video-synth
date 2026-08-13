// gravity-waaaves-style feedback: an orbiting attractor lenses the
// feedback buffer toward itself. x0 feedback mix, x1 gravity strength,
// x2 orbit speed + radius, x3 a mirrored twin that pushes instead of
// pulls, 0 = the single attractor
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

vec3 rgb2hsb(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

void main() {
    float w = 0.2 + u_x2 * 1.4;
    float orbit = 0.12 + u_x2 * 0.25;
    vec2 attractor = vec2(0.5) + orbit * vec2(sin(u_time * w),
                                              cos(u_time * w * 1.31));
    vec2 toA = attractor - v_texcoord;
    float d = length(toA) + 0.04;
    vec2 pull = (toA / d) * u_x1 * 0.012 / d;

    // twin at the mirrored point, same mass but repelling: the buffer
    // streams from one well into the other
    vec2 toB = (1.0 - attractor) - v_texcoord;
    float db = length(toB) + 0.04;
    pull -= (toB / db) * u_x1 * u_x3 * 0.012 / db;

    vec2 fbCoord = fract((v_texcoord - 0.5) * 0.997 + 0.5 + pull);
    vec3 fb = texture2D(u_tex1, fbCoord).rgb * 0.985;
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    float srcLum = rgb2hsb(src).z;

    float fbMix = u_x0 * 0.92;
    vec3 outc = mix(src, fb, fbMix);
    if (srcLum < u_x0 * 0.4) { outc = fb; }
    gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
