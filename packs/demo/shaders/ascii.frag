// ASCII filter via glyph atlas. x0 cell count, x1 green->source-color, x2 gain
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_atlas;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

void main() {
    float nglyphs = 10.0;
    float cols = mix(16.0, 120.0, u_x0);
    vec2 grid = vec2(cols, cols * (u_resolution.y / u_resolution.x) * 0.55);
    vec2 cell = floor(v_texcoord * grid);
    vec2 cuv = fract(v_texcoord * grid);
    vec3 src = texture2D(u_tex0, (cell + 0.5) / grid).rgb;
    float lum = dot(src, vec3(0.299, 0.587, 0.114));
    lum = clamp(lum * (0.6 + u_x2 * 2.0), 0.0, 1.0);
    float gi = floor(lum * (nglyphs - 1.0) + 0.5);
    float g = texture2D(u_atlas, vec2((gi + cuv.x) / nglyphs, cuv.y)).r;
    vec3 mono = vec3(0.35, 1.0, 0.45) * g;
    vec3 colr = src * g * 1.7;
    gl_FragColor = vec4(mix(mono, colr, u_x1), 1.0);
}
