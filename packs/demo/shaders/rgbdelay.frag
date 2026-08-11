// RGB time split: red is now, green is the recent past, blue is deeper
// past (delay ring taps). Motion tears into color ghosts; stillness
// stays clean. x0 depth (how far back), x1 split amount, x2 wash
// (delayed channels bleed additively for luminous trails)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex2;   // ring tap at x0 depth
uniform sampler2D u_tex3;   // ring tap at half depth
uniform float u_x1;
uniform float u_x2;

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    vec3 now = texture2D(u_tex0, v_texcoord).rgb;
    vec3 mid = texture2D(u_tex3, v_texcoord).rgb;
    vec3 old = texture2D(u_tex2, v_texcoord).rgb;
    // ghosts from past *brightness* — the ring holds our own output, so
    // sampling past g/b directly would decay to nothing at full split
    vec3 split = vec3(dot(now, W), dot(mid, W), dot(old, W));
    vec3 wash = max(split, vec3(max(dot(mid, W), dot(old, W))) * 0.8);
    vec3 c = mix(split, wash, u_x2);
    gl_FragColor = vec4(mix(now, c, u_x1), 1.0);
}
