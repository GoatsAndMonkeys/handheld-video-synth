// time gradient: brightness picks the era — highlights stay live,
// midtones lag behind, shadows dredge up the delay ring. Motion tears
// itself apart by luminance. x0 depth, x1 split, x2 wash, x3 edge — how
// abruptly one era gives way to the next (0 = smooth gradient)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex2;   // ring tap at x0 depth
uniform sampler2D u_tex3;   // ring tap at half depth
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    vec3 now = texture2D(u_tex0, v_texcoord).rgb;
    vec3 mid = texture2D(u_tex3, v_texcoord).rgb;
    vec3 old = texture2D(u_tex2, v_texcoord).rgb;
    float key = dot(now, W);
    float e = u_x3 * 0.5;   // squeeze both ramps toward a hard cut
    vec3 past = mix(old, mid, smoothstep(0.30 * e, 0.6 - 0.30 * e, key));
    vec3 graded = mix(past, now,
                      smoothstep(0.4 + 0.24 * e, 0.95 - 0.27 * e, key));
    vec3 wash = max(graded, max(mid, old) * 0.85);
    vec3 c = mix(graded, wash, u_x2);
    gl_FragColor = vec4(mix(now, c, u_x1), 1.0);
}
