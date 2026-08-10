// true video delay line: u_tex2 is a tap into the engine's ring of past
// frames — echoes, not just 1-frame feedback.
// x0 delay time (engine-driven tap depth), x1 dry<->echo, x2 regen trails
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform sampler2D u_tex2;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

void main() {
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    vec3 wet = texture2D(u_tex2, v_texcoord).rgb;
    vec3 prev = texture2D(u_tex1, v_texcoord).rgb;
    vec3 outc = mix(src, wet, u_x1);
    outc = max(outc, prev * (u_x2 * 0.95));
    gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
