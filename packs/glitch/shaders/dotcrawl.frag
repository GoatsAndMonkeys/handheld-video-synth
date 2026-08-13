// ntsc dot crawl: colour and brightness ride the same wire, and no
// decoder ever fully pulls them apart. colour edges beat against the
// 3.58mhz subcarrier and print a checkerboard of dots that walks up the
// picture a line at a time; fine luma detail falls inside the chroma
// band and comes back out as rainbow moire.
// x0 dots (chroma printing into luma), x1 moire (luma into chroma), x2 crawl,
// x3 std (which standard the decoder thinks it has — 0 is the ntsc checker
// this was built as; wound up the colour axis alternates line to line the
// way pal's does, so the dots pair off into hanover bars and what is left
// of the crawl leans diagonal)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    vec2 px = v_texcoord * u_resolution;
    float pitch = 2.0 + u_x2 * 2.6;          // subcarrier beat, in pixels

    // two taps an odd number of half-cycles apart, so the subcarrier
    // arrives inverted — all a delay-line decoder has to tell a colour
    // transition from a bright one. the long delay smears the mistake
    // over a few pixels the way the chroma filter rings
    vec3 a = texture2D(u_tex0, v_texcoord).rgb;
    vec3 b = texture2D(u_tex0, v_texcoord
                       + vec2(pitch * 1.5 / u_resolution.x, 0.0)).rgb;
    float ya = dot(a, W);
    float yb = dot(b, W);

    // phase flips half a cycle every line, and the line the pattern
    // starts on walks — that walk is the crawl. the reset is 8 lines,
    // an even count, so it lands back on the same checker and never jumps
    float yl = floor(px.y - fract(u_time * (0.15 + u_x2 * 2.2)) * 8.0);
    float ph = px.x / pitch + yl * mix(0.5, 0.25, u_x3);
    float pal = mix(1.0, fract(floor(px.y) * 0.5) * 4.0 - 1.0, u_x3);
    float c1 = abs(fract(ph) * 2.0 - 1.0) * 2.0 - 1.0;
    float c2 = abs(fract(ph + 0.25) * 2.0 - 1.0) * 2.0 - 1.0;

    // chroma into luma: the standing subcarrier of a saturated area,
    // plus the kick where the colour changes, both print as dots
    vec3 ca = a - ya;
    vec3 cb = b - yb;
    float leak = (ca.r - ca.b) * 0.5 + (ca.r - cb.r) - (ca.b - cb.b);
    vec3 col = a + leak * c1 * pal * u_x0 * 1.1;

    // luma into chroma: detail at subcarrier rate decodes as an i/q pair
    float hf = (ya - yb) * (0.6 + u_x1 * 5.0) * u_x1;
    float i = hf * c1;
    float q = hf * c2 * pal;
    col += vec3( 0.96 * i + 0.62 * q,
                -0.27 * i - 0.65 * q,
                -1.11 * i + 1.70 * q);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
