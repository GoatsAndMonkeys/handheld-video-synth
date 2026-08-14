// comet trails: highlights refuse to die — anything above the key
// lingers in the feedback buffer and decays slowly, while shadows
// refresh instantly. x0 trail, x1 key, x2 drift, x3 float — the trails
// creep up or down the frame as they fade, 0.5 = pinned in place
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output frame
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

vec3 hueRotate(vec3 c, float a) {
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    vec3 prev = texture2D(u_tex1,
                v_texcoord + vec2(0.0, (u_x3 - 0.5) * 0.02)).rgb;
    float pl = dot(prev, W);
    float keep = smoothstep(u_x1 * 0.7, u_x1 * 0.7 + 0.2, pl);
    float decay = keep * mix(0.80, 0.995, u_x0);
    vec3 trail = hueRotate(prev, (u_x2 - 0.5) * 0.3) * decay;
    gl_FragColor = vec4(max(src, trail), 1.0);
}
