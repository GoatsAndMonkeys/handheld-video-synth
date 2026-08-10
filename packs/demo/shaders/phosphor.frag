// phosphorm-style audio scope: Lissajous traces drawn by the music,
// decaying like phosphor on a CRT. x0 figure ratio, x1 audio amp, x2 decay
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_a0;
uniform float u_a1;
uniform float u_a2;

void main() {
    vec2 p = v_texcoord - 0.5;
    p.x *= u_resolution.x / u_resolution.y;

    float fa = 1.0 + floor(u_x0 * 5.0);
    float fb = 2.0 + floor(u_x0 * 3.0);
    float amp = (0.16 + 0.30 * u_x1) * (0.4 + u_a1);
    float d = 1e3;
    for (int i = 0; i < 16; i++) {
        float t = float(i) / 16.0 * 6.2831 + u_time * 0.7;
        vec2 pt = amp * vec2(sin(fa * t + u_time * 0.31 + u_a0 * 2.0),
                             sin(fb * t + u_a2 * 2.0));
        d = min(d, length(p - pt));
    }
    float glow = exp(-d * 55.0);
    vec3 beam = vec3(0.25 + u_a0 * 0.6, 1.0, 0.4 + u_a2 * 0.6) * glow;
    float lum = dot(texture2D(u_tex0, v_texcoord).rgb,
                    vec3(0.299, 0.587, 0.114));
    beam += vec3(0.06, 0.12, 0.08) * lum;   // source ghosts under the beam
    vec3 prev = texture2D(u_tex1, v_texcoord).rgb;
    gl_FragColor = vec4(max(beam, prev * mix(0.78, 0.965, u_x2)), 1.0);
}
