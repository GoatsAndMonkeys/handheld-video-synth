// waaave bank 3 — feedback color life/death. x0 fb saturation, x1 fb
// brightness (below mid = decay, above = bloom), x2 chaotic huezones
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

vec3 rgb2hsb(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsb2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec4 src = texture2D(u_tex0, v_texcoord);
    float srcLum = rgb2hsb(src.rgb).z;

    vec2 c = (v_texcoord - 0.5) * 1.012;          // slow outward zoom
    vec2 fbCoord = fract(c + 0.5);

    vec3 fbHsb = rgb2hsb(texture2D(u_tex1, fbCoord).rgb);
    // chaotic huezones: hue self-modulates, waaave_pool's signature acid
    fbHsb.x = fract(fbHsb.x + u_x2 * 0.25 * sin(fbHsb.x * 6.2831 + srcLum * 3.0));
    fbHsb.y = clamp(fbHsb.y * mix(0.9, 1.12, u_x0), 0.0, 1.0);
    fbHsb.z = clamp(fbHsb.z * mix(0.94, 1.015, u_x1), 0.0, 1.0);
    vec3 fb = hsb2rgb(fbHsb);

    vec3 outc = mix(src.rgb, fb, 0.85);
    if (srcLum < 0.25) { outc = fb; }
    gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
