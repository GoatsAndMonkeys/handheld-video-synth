// glyph-worlds-style audio glyph field: cells of type flickering with the
// bands, lit by the video underneath. x0 density, x1 audio drive, x2 palette,
// x3 alphabet size, 0 = the full glyph set, up = collapse onto solid blocks
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_atlas;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;
uniform float u_a1;
uniform float u_a2;

float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    float nglyphs = 10.0;
    float cols = mix(12.0, 64.0, u_x0);
    vec2 grid = vec2(cols, cols * (u_resolution.y / u_resolution.x) * 0.55);
    vec2 cell = floor(v_texcoord * grid);
    vec2 cuv = fract(v_texcoord * grid);

    float band = mod(cell.x + cell.y, 3.0);
    float av = band < 0.5 ? u_a0 : (band < 1.5 ? u_a1 : u_a2);
    float h = hash2(cell);
    float flick = floor(u_time * (2.0 + av * 10.0));
    float gspan = max(1.0, floor(mix(nglyphs - 2.0, 1.0, u_x3)));
    float gi = floor(hash2(cell + flick * 0.31) * gspan) + nglyphs - gspan;
    float g = texture2D(u_atlas, vec2((gi + cuv.x) / nglyphs, cuv.y)).r;

    float lum = dot(texture2D(u_tex0, (cell + 0.5) / grid).rgb,
                    vec3(0.299, 0.587, 0.114));
    float bright = clamp(h * 0.25 + av * u_x1 * 1.2 + lum * 0.55, 0.0, 1.0);
    vec3 col = 0.5 + 0.5 * cos(h * 6.2831 + u_x2 * 6.2831
                               + u_time * 0.2 + vec3(0.0, 2.1, 4.2));
    gl_FragColor = vec4(col * g * bright, 1.0);
}
