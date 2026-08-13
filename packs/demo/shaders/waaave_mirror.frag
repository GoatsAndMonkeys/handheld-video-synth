// waaave bank 4 — symmetry switches. x0 feedback mix, x1 zoom,
// x2 mirror mode zones: off / horizontal / vertical / kaleido (both),
// x3 how many times the zone repeats across the frame: 1 (low) .. 4
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
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
    vec4 src = texture2D(u_tex0, v_texcoord);
    float srcLum = rgb2hsb(src.rgb).z;

    vec2 c = (v_texcoord - 0.5) * mix(1.08, 0.92, u_x1);
    float rep = 1.0 + floor(u_x3 * 3.99);         // 1..4 zone repeats
    if (rep > 1.5) { c = fract(c * rep + 0.5) - 0.5; }
    // mirror switches, straight out of waaave_pool's coordinate zones
    if (u_x2 > 0.25 && u_x2 < 0.75 && c.x > 0.0) { c.x = -c.x; }   // horizontal
    if (u_x2 > 0.5 && c.y > 0.0) { c.y = -c.y; }                    // vertical
    vec2 fbCoord = fract(c + 0.5);

    vec3 fb = texture2D(u_tex1, fbCoord).rgb * 0.985;
    float fbMix = u_x0 * 0.92;
    vec3 outc = mix(src.rgb, fb, fbMix);
    if (srcLum < u_x0 * 0.4) { outc = fb; }
    gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
