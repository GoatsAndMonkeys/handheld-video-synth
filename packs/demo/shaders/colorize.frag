// clean-ish pass: x0 contrast, x1 saturation, x2 hue rotate
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

vec3 hueRotate(vec3 c, float a) {
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

void main() {
    vec3 c = texture2D(u_tex0, v_texcoord).rgb;
    c = (c - 0.5) * mix(0.4, 2.4, u_x0) + 0.5;
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(lum), c, mix(0.0, 2.0, u_x1));
    c = hueRotate(c, (u_x2 - 0.5) * 6.2831);
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
