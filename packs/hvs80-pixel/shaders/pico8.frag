// PICO-8: every pixel snapped to the fantasy console's sixteen colors by
// nearest-match search — palettes are data, so the sweetness is all in the
// picture finding its own dithers. Knob three sweeps every entry toward
// the console's hidden second sixteen (the "secret" palette poked in past
// the end of the first), murk and neon where the originals were candy.
// Bayer offset goes in before the search, so the stipple falls along the
// palette's own edges. Clockless — the cart sits still until the video
// moves. Highs add a little sparkle to the dither.
//
// x0 pixel size, x1 dither, x2 secret palette, x3 saturation drive
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_dither;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a2;

void main() {
    float px = mix(280.0, 56.0, u_x0);
    vec2 grid = vec2(px, px * u_resolution.y / u_resolution.x);
    vec2 cell = floor(v_texcoord * grid);
    vec3 src = texture2D(u_tex0, (cell + 0.5) / grid).rgb;

    // drive saturation into the quantizer: grey finds the palette's stones
    // and slates, oversaturated slams everything onto the brights
    vec3 grey = vec3(dot(src, vec3(0.299, 0.587, 0.114)));
    vec3 c = mix(grey, src, u_x3 * 2.0);

    // ordered dither ahead of the search — the offset makes neighbouring
    // cells land on different palette entries and the flats turn to weave
    float d = texture2D(u_dither, cell / 4.0).r - 0.5;
    c = clamp(c + d * (u_x1 * 0.5 + u_a2 * 0.12), 0.0, 1.0);

    // the sixteen, each mixed toward its secret twin by knob three.
    // ES 1.00 has no array initializers, so the table is built by hand
    float w = u_x2;
    vec3 P[16];
    P[0]  = mix(vec3(0.000, 0.000, 0.000), vec3(0.161, 0.094, 0.078), w);
    P[1]  = mix(vec3(0.114, 0.169, 0.325), vec3(0.067, 0.114, 0.208), w);
    P[2]  = mix(vec3(0.494, 0.145, 0.325), vec3(0.259, 0.129, 0.212), w);
    P[3]  = mix(vec3(0.000, 0.529, 0.318), vec3(0.071, 0.325, 0.349), w);
    P[4]  = mix(vec3(0.671, 0.322, 0.212), vec3(0.455, 0.184, 0.161), w);
    P[5]  = mix(vec3(0.373, 0.341, 0.310), vec3(0.286, 0.200, 0.231), w);
    P[6]  = mix(vec3(0.761, 0.765, 0.780), vec3(0.635, 0.533, 0.475), w);
    P[7]  = mix(vec3(1.000, 0.945, 0.910), vec3(0.953, 0.937, 0.490), w);
    P[8]  = mix(vec3(1.000, 0.000, 0.302), vec3(0.745, 0.071, 0.314), w);
    P[9]  = mix(vec3(1.000, 0.639, 0.000), vec3(1.000, 0.424, 0.141), w);
    P[10] = mix(vec3(1.000, 0.925, 0.153), vec3(0.659, 0.906, 0.180), w);
    P[11] = mix(vec3(0.000, 0.894, 0.212), vec3(0.000, 0.710, 0.263), w);
    P[12] = mix(vec3(0.161, 0.678, 1.000), vec3(0.024, 0.353, 0.710), w);
    P[13] = mix(vec3(0.514, 0.463, 0.612), vec3(0.459, 0.275, 0.396), w);
    P[14] = mix(vec3(1.000, 0.467, 0.659), vec3(1.000, 0.431, 0.349), w);
    P[15] = mix(vec3(1.000, 0.800, 0.667), vec3(1.000, 0.616, 0.506), w);

    // nearest match, luma-weighted so skin doesn't jump to green; the
    // select is branchless — VideoCore prefers a mix to an if
    vec3 best = P[0];
    float bd = 8.0;
    for (int i = 0; i < 16; i++) {
        vec3 e = c - P[i];
        float dd = dot(e * e, vec3(0.30, 0.59, 0.11));
        float t = step(dd, bd);
        bd = mix(bd, dd, t);
        best = mix(best, P[i], t);
    }
    gl_FragColor = vec4(best, 1.0);
}
