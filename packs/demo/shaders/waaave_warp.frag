// waaave bank 2 — drift controls. x0 x-displace, x1 y-displace, x2 rotate
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;

vec3 rgb2hsb(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

void main() {
    vec4 src = texture2D(u_tex0, v_texcoord);
    float srcLum = rgb2hsb(src.rgb).z;

    vec2 c = v_texcoord - 0.5;
    c *= 0.995;                                   // gentle inward pull
    float th = (u_x2 - 0.5) * 0.3;
    c = vec2(c.x * cos(th) - c.y * sin(th),
             c.x * sin(th) + c.y * cos(th));
    c += vec2((u_x0 - 0.5) * 0.12, (u_x1 - 0.5) * 0.12);
    vec2 fbCoord = fract(c + 0.5);                // toroid wrap

    vec3 fb = texture2D(u_tex1, fbCoord).rgb * 0.985;
    vec3 outc = mix(src.rgb, fb, 0.85);
    if (srcLum < 0.25) { outc = fb; }             // lumakey routing
    gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
