// convolutional-chaos-style morphing kernel: blur <-> sharpen with
// self-exciting feedback resonance.
// x0 blur<->sharpen, x1 feedback resonance, x2 dry<->wet
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

vec3 conv(sampler2D t, vec2 uv, vec2 px, float a) {
    vec3 c = texture2D(t, uv).rgb;
    vec3 n = texture2D(t, uv + vec2(px.x, 0.0)).rgb
           + texture2D(t, uv - vec2(px.x, 0.0)).rgb
           + texture2D(t, uv + vec2(0.0, px.y)).rgb
           + texture2D(t, uv - vec2(0.0, px.y)).rgb;
    // a < 0: blur toward neighbors; a > 0: unsharp punch
    return c * (1.0 + 4.0 * a) - n * a;
}

void main() {
    vec2 px = 1.5 / u_resolution;
    float a = (u_x0 - 0.35) * 2.2;
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    vec3 res = conv(u_tex0, v_texcoord, px, a);
    vec3 ring = conv(u_tex1, v_texcoord, px * 2.0, a) * u_x1 * 0.55;
    vec3 outc = mix(src, res, u_x2) + ring;
    gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
