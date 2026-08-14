// generative source: warped plasma. x0 scale, x1 palette shift, x2 warp
varying vec2 v_texcoord;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

void main() {
    float t = u_time;
    vec2 p = (v_texcoord - 0.5) * mix(2.0, 10.0, u_x0);
    p.x *= u_resolution.x / u_resolution.y;
    p += u_x2 * 0.9 * vec2(sin(p.y * 1.7 + t), cos(p.x * 1.3 - t * 0.8));
    float v = sin(p.x + t)
            + sin(p.y + t * 1.3)
            + sin(length(p) * 1.5 - t * 1.7)
            + sin((p.x + p.y) * 0.7 + t * 0.6);
    vec3 col = 0.5 + 0.5 * cos(v * 1.2 + vec3(0.0, 2.1, 4.2) + u_x1 * 6.2831);
    gl_FragColor = vec4(col, 1.0);
}
