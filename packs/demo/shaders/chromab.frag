// chromatic-aberration-style band colorizer/solarizer.
// x0 band count, x1 hue spread across bands, x2 solarize fold
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

vec3 hsb2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    // soft prefilter keeps the bands chunky instead of noisy
    vec2 px = vec2(0.0016, 0.0021);
    vec3 c = (texture2D(u_tex0, v_texcoord).rgb
            + texture2D(u_tex0, v_texcoord + px).rgb
            + texture2D(u_tex0, v_texcoord - px).rgb
            + texture2D(u_tex0, v_texcoord + vec2(px.x, -px.y)).rgb
            + texture2D(u_tex0, v_texcoord + vec2(-px.x, px.y)).rgb) / 5.0;
    float lum = dot(c, vec3(0.299, 0.587, 0.114));

    float nb = floor(2.0 + u_x0 * 6.0);          // 2..8 bands
    float band = floor(lum * nb) / nb;

    float hue = fract(band * (0.25 + u_x1 * 1.5) + u_time * 0.02);
    float z = lum * (1.0 + u_x2 * 3.0);
    z = abs(fract(z) * 2.0 - 1.0);               // brightness fold-over
    gl_FragColor = vec4(hsb2rgb(vec3(hue, 0.85, z)), 1.0);
}
