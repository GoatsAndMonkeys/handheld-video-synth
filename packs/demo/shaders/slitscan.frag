// temporal-vortex-style slit scan: a moving scanline writes fresh video,
// everything else stays frozen from the previous frame — time smears
// across space. x0 scan speed, x1 slit width, x2 direction (h/v zones)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

void main() {
    float pos = fract(u_time * (0.05 + u_x0 * 0.6));
    float axis = v_texcoord.y;
    if (u_x2 >= 0.5) { axis = v_texcoord.x; }
    float d = abs(axis - pos);
    d = min(d, 1.0 - d);                          // wrap distance
    float slit = 0.004 + u_x1 * 0.25;

    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    vec3 prev = texture2D(u_tex1, v_texcoord).rgb;
    float inSlit = step(d, slit);
    gl_FragColor = vec4(mix(prev, src, inSlit), 1.0);
}
