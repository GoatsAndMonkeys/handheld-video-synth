// waaave-style video feedback. x0 feedback amount, x1 zoom, x2 hue drift
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output frame
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

vec3 hueRotate(vec3 c, float a) {
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

void main() {
    vec2 c = v_texcoord - 0.5;
    float zoom = mix(0.93, 1.07, u_x1);
    vec3 prev = texture2D(u_tex1, c / zoom + 0.5).rgb;
    prev = hueRotate(prev, (u_x2 - 0.5) * 0.35);
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    float fb = u_x0 * 0.96;
    vec3 outc = mix(src, max(prev, src), fb);
    gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
