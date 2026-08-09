// waaave_pool-inspired feedback zone: coordinate-warped feedback with HSB
// color drift and lumakey routing (feedback grows out of the dark areas).
// x0 feedback mix + lumakey threshold, x1 zoom, x2 hue drift + rotate
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output frame
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

    // coordinate zone: zoom + rotate around center, toroidal wrap
    vec2 c = v_texcoord - 0.5;
    float zoom = mix(1.10, 0.90, u_x1);
    c *= zoom;
    float th = (u_x2 - 0.5) * 0.12;
    c = vec2(c.x * cos(th) - c.y * sin(th),
             c.x * sin(th) + c.y * cos(th));
    vec2 fbCoord = fract(c + 0.5);

    // color zone: HSB drift on the feedback path
    vec3 fb = texture2D(u_tex1, fbCoord).rgb;
    vec3 fbHsb = rgb2hsb(fb);
    fbHsb.x = fract(fbHsb.x + (u_x2 - 0.5) * 0.05
                    + 0.02 * sin(fbHsb.x * 6.2831));
    fbHsb.y = clamp(fbHsb.y * 1.02, 0.0, 1.0);
    fbHsb.z = clamp(fbHsb.z * 0.985, 0.0, 1.0);   // slow decay, no blowout
    fb = hsb2rgb(fbHsb);

    // mix + lumakey routing: feedback claims the shadows
    float fbMix = u_x0 * 0.9;
    vec3 outc = mix(src.rgb, fb, fbMix);
    if (srcLum < u_x0 * 0.5) { outc = fb; }
    gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
