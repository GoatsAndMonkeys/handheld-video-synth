// Old-web dithered GIF look: web-safe palette (6 levels per channel,
// the Netscape 216) with ordered dithering, chunky pixels.
// x0 pixel size, x1 dither strength, x2 color crush (216 colors -> 8),
// x3 bit split (even palette -> blue-starved 3-3-2)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_dither;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

void main() {
    float px = mix(320.0, 64.0, u_x0);
    vec2 grid = vec2(px, px * u_resolution.y / u_resolution.x);
    vec2 cell = floor(v_texcoord * grid);
    vec3 src = texture2D(u_tex0, (cell + 0.5) / grid).rgb;
    // web-safe = 6 levels/channel; crush morphs down toward 2 (8 colors)
    float levels = mix(6.0, 2.0, u_x2) - 1.0;
    // 8-bit indexed palettes spend their bits unevenly and blue goes first
    vec3 lv = max(levels - u_x3 * vec3(2.0, 0.0, 3.0), 1.0);
    float d = texture2D(u_dither, cell / 4.0).r;
    vec3 c = src + (d - 0.5) * u_x1 / lv;
    c = floor(clamp(c, 0.0, 1.0) * lv + 0.5) / lv;
    gl_FragColor = vec4(c, 1.0);
}
