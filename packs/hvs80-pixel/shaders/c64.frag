// Commodore 64: chunky pixels ordered-dithered into the sixteen muted
// colours of the pepto palette, the measured VIC-II set. The cell knob
// pulls the picture toward the 8x8 colour-cell limit — cells flatten to
// one colour and dark detail comes back as black ink, the hires
// character look. Scanlines on the fourth knob for the family TV.
// Clockless: it sits still until the picture moves.
// x0 chunk, x1 dither, x2 cells, x3 scanline
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_dither;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

// parabolic stand-in for sin(2pi*x): no hardware sin on this gpu
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }

// running nearest-colour: acc is (best colour, best distance so far)
vec4 pick(vec4 acc, vec3 p, vec3 c) {
    vec3 d = c - p;
    float dd = dot(d, d);
    return mix(acc, vec4(p, dd), step(dd, acc.w));
}

// snap to the nearest of the sixteen pepto colours, seeded with black.
// Fifteen compares, all ALU — no fetch, no loop, no array
vec3 pepto(vec3 c) {
    vec4 b = vec4(0.0, 0.0, 0.0, dot(c, c));
    b = pick(b, vec3(1.0), c);                       // white
    b = pick(b, vec3(0.408, 0.216, 0.169), c);       // red
    b = pick(b, vec3(0.439, 0.643, 0.698), c);       // cyan
    b = pick(b, vec3(0.435, 0.239, 0.525), c);       // purple
    b = pick(b, vec3(0.345, 0.553, 0.263), c);       // green
    b = pick(b, vec3(0.208, 0.157, 0.475), c);       // blue
    b = pick(b, vec3(0.722, 0.780, 0.435), c);       // yellow
    b = pick(b, vec3(0.435, 0.310, 0.145), c);       // orange
    b = pick(b, vec3(0.263, 0.224, 0.0), c);         // brown
    b = pick(b, vec3(0.604, 0.404, 0.349), c);       // light red
    b = pick(b, vec3(0.267), c);                     // dark grey
    b = pick(b, vec3(0.424), c);                     // grey
    b = pick(b, vec3(0.604, 0.824, 0.518), c);       // light green
    b = pick(b, vec3(0.424, 0.369, 0.710), c);       // light blue
    b = pick(b, vec3(0.584), c);                     // light grey
    return b.rgb;
}

void main() {
    // 160 chunks across at rest — the multicolour mode's width
    float n = mix(256.0, 64.0, u_x0);
    vec2 grid = vec2(n, n * u_resolution.y / u_resolution.x);
    vec2 chunk = floor(v_texcoord * grid);
    vec3 pix = texture2D(u_tex0, (chunk + 0.5) / grid).rgb;

    // the colour cell is 8 chunks square, like the character grid
    vec2 cgrid = grid / 8.0;
    vec3 cc = texture2D(u_tex0, (floor(v_texcoord * cgrid) + 0.5) / cgrid).rgb;

    // pulling pixels toward their cell's colour is the VIC-II limit:
    // at full, the whole cell quantises to one flat colour...
    vec3 feed = mix(pix, cc, u_x2);
    float d = texture2D(u_dither, chunk / 4.0).r;
    feed += (d - 0.5) * u_x1 * 0.4;
    vec3 c = pepto(clamp(feed, 0.0, 1.0));

    // ...and the detail comes back as black ink wherever the pixel sits
    // clearly darker than its cell, dither wobbling the threshold
    const vec3 W = vec3(0.299, 0.587, 0.114);
    float inkm = step(dot(pix, W) + (d - 0.5) * 0.2, dot(cc, W) - 0.18);
    c *= 1.0 - u_x2 * inkm;

    // scanlines: one soft dark line per each of the 200 rows
    c *= 1.0 - u_x3 * 0.4 * (0.5 - 0.5 * sw(v_texcoord.y * 200.0));
    gl_FragColor = vec4(c, 1.0);
}
