// Game Boy 4-shade dither. x0 pixel size, x1 palette hue, x2 dither strength
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_dither;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

vec3 hueRotate(vec3 c, float a) {
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

void main() {
    float px = mix(160.0, 48.0, u_x0);
    vec2 grid = vec2(px, px * u_resolution.y / u_resolution.x);
    vec2 cell = floor(v_texcoord * grid);
    vec3 src = texture2D(u_tex0, (cell + 0.5) / grid).rgb;
    float lum = dot(src, vec3(0.299, 0.587, 0.114));
    float d = texture2D(u_dither, cell / 4.0).r;
    lum = clamp(lum + (d - 0.5) * u_x2 * 0.7, 0.0, 1.0);
    float shade = floor(lum * 3.999) / 3.0;
    vec3 dark = vec3(0.059, 0.219, 0.059);
    vec3 lite = vec3(0.608, 0.737, 0.059);
    vec3 c = mix(dark, lite, shade);
    c = hueRotate(c, (u_x1 - 0.5) * 6.2831);
    gl_FragColor = vec4(c, 1.0);
}
