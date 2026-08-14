// Matrix digital rain as a filter. x0 density, x1 rain->reveal-source, x2 fall speed
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_atlas;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

float hash1(float n) { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    float nglyphs = 10.0;
    float cols = mix(24.0, 90.0, u_x0);
    vec2 grid = vec2(cols, cols * (u_resolution.y / u_resolution.x) * 0.55);
    vec2 cell = floor(v_texcoord * grid);
    vec2 cuv = fract(v_texcoord * grid);

    float t = u_time * (0.3 + u_x2 * 1.4);
    float speed = 0.35 + hash1(cell.x * 1.71) * 0.85;
    float head = fract(hash1(cell.x * 7.13) + t * speed);
    float yc = 1.0 - v_texcoord.y;               // fall downward
    float d = fract(yc - head);
    float trail = pow(clamp(1.0 - d * mix(2.2, 5.5, hash1(cell.x)), 0.0, 1.0), 1.6);

    float flicker = floor(t * 9.0);
    float gi = floor(hash2(cell + flicker * 0.37) * (nglyphs - 2.0)) + 2.0;
    float g = texture2D(u_atlas, vec2((gi + cuv.x) / nglyphs, cuv.y)).r;

    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    float bright = trail * g;
    float headglow = step(d, 1.5 / grid.y) * g;
    vec3 rain = vec3(0.25, 1.0, 0.4) * bright + vec3(0.8, 1.0, 0.85) * headglow;
    vec3 reveal = src * (bright * 1.6 + headglow);
    gl_FragColor = vec4(mix(rain, reveal, u_x1), 1.0);
}
