// After CHROMATIC_ABERRATION1: the search for sasquatch — Andrei Jay's
// "helpful 4 band colorizer/solarizer specially optimized for filming
// bigfoot". Luma is cut into exactly four bands, hardware-style: each band
// owns a hue, each ramps or folds its own brightness, and the first knob
// slides the band edges through the tonal range so the cut lands on the
// subject instead of the sky. Where chromab counts its bands on a knob and
// maps them onto a drifting gradient, this is the fixed four-channel
// instrument the original was: four hues a fixed step apart, folded per
// band. No clock is declared — the picture moves, the bands answer.
//
// x0 edges, x1 hue rotate, x2 solar fold, x3 band contrast
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

// cheap sine on a unit period: sw(x) ~ sin(2*pi*x)
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }

vec3 pal(float h) {
    return 0.5 + 0.5 * vec3(sw(h), sw(h + 0.333), sw(h + 0.667));
}

void main() {
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    float lum = dot(src, vec3(0.299, 0.587, 0.114));

    // the edge knob is a gamma warp: low crowds the four cuts into the
    // shadows, high pushes them up into the lights, 0.5 is quarter stops
    float g = mix(0.45, 2.6, u_x0);
    float l = pow(max(lum, 1e-4), g);

    float b = min(floor(l * 4.0), 3.0);    // which of the four bands
    float t = l * 4.0 - b;                 // where inside it

    // ramp inside the band, steepened or flattened by the contrast knob,
    // then folded back on itself: at full fold every band is a little
    // solarized tent, bright in its middle and dark at both edges
    float v = clamp(0.5 + (t - 0.5) * (0.35 + u_x3 * 1.5), 0.0, 1.0);
    float tent = 1.0 - abs(t * 2.0 - 1.0);
    v = mix(v, tent, u_x2);

    // four hues a fixed quarter-ish step apart, spun together by one knob;
    // 0.23 rather than 0.25 so the wheel never quite closes on itself
    vec3 col = pal(fract(u_x1 + b * 0.23)) * (0.12 + 0.88 * v);

    // a sixth of the source keeps the sasquatch readable inside the bands
    gl_FragColor = vec4(clamp(mix(col, src, 0.16), 0.0, 1.0), 1.0);
}
