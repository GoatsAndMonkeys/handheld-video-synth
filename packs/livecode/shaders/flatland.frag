// Flatland: after Sarah Groff Hennigh-Palermo's la-habra (MIT,
// https://github.com/sarahgp/la-habra), the ClojureScript livecoding app
// behind her sets — rows of flat SVG shapes in saturated colour, no
// gradients, whole compositions strobing between states. Nothing ports:
// la-habra builds SVG documents; this is a per-pixel field written from
// scratch after the look. Each row marches one shape — circle, triangle,
// dome or square — and the whole grid jump-cuts to a new layout on a clock.
// Bass shoves the clock over the line early, loud passages remap the
// palette, highs rattle every shape's scale.
//
// x0 grid density, x1 snap rate, x2 palette, x3 video windows
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;
uniform float u_a1;
uniform float u_a2;

// cheap sine on a unit period: sw(x) ~ sin(2*pi*x)
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }

// six flats, la-habra colours: ink, paper, hot pink, teal, yellow, blue
vec3 pick(float i) {
    vec3 c = vec3(0.07, 0.07, 0.09);
    c = mix(c, vec3(0.96, 0.93, 0.86), step(0.5, i));
    c = mix(c, vec3(1.00, 0.18, 0.46), step(1.5, i));
    c = mix(c, vec3(0.00, 0.72, 0.64), step(2.5, i));
    c = mix(c, vec3(1.00, 0.83, 0.12), step(3.5, i));
    c = mix(c, vec3(0.18, 0.29, 1.00), step(4.5, i));
    return c;
}

void main() {
    vec2 uv = v_texcoord;
    vec3 vid = texture2D(u_tex0, uv).rgb;
    float asp = u_resolution.x / max(u_resolution.y, 1.0);

    // the state clock: compositions do not animate, they SNAP. Bass adds to
    // the phase, so a kick lands the next state early — that is the strobe.
    // Sixteen states then the cycle repeats, keeping the hashed value small
    // enough for mediump to fract cleanly.
    float rate = 0.15 + u_x1 * 1.6;
    float st = floor(mod(u_time * rate + u_a0 * 1.4, 16.0));
    float shift = floor(u_x2 * 5.999) + step(0.55, u_a1) * 3.0;

    // square-ish lattice, alternate rows staggered half a cell
    float cols = floor(2.0 + u_x0 * 9.0);
    float rows = max(floor(cols * u_resolution.y / max(u_resolution.x, 1.0) + 0.5), 2.0);
    vec2 gs = vec2(cols, rows);
    vec2 q = uv * gs;
    q.x += fract(floor(q.y) * 0.5);
    vec2 cell = floor(q);
    vec2 dp = (fract(q) - 0.5) / gs;
    dp.x *= asp;                          // screen-height units, shapes round

    float h1 = fract(dot(cell, vec2(0.137, 0.291)) + st * 0.6137);
    float h2 = fract(h1 * 7.13 + 0.317);
    float h3 = fract(h1 * 3.71 + st * 0.129);
    float h4 = fract(h2 * 5.17 + 0.713);

    // one shape per row, re-dealt every state
    float t = floor(fract(cell.y * 0.373 + st * 0.6137) * 3.999);

    // radius in cell terms: highs rattle it, a slow breath keeps a silent
    // room from freezing solid
    float r = 0.26 + h2 * 0.10;
    r *= 1.0 + u_a2 * (h3 - 0.5) * 0.8;
    r *= 1.0 + 0.06 * sw(u_time * 0.11 + cell.x * 0.07);
    r = clamp(r, 0.06, 0.47) / rows;

    float mc = step(dot(dp, dp), r * r);                       // circle
    float mt = step(dp.y, r * 0.8 - abs(dp.x) * 1.9)           // triangle
             * step(-r * 0.7, dp.y);
    vec2 hp = dp + vec2(0.0, r * 0.45);                        // dome
    float mh = step(dot(hp, hp), r * r) * step(0.0, hp.y);
    float ms = step(max(abs(dp.x), abs(dp.y)), r * 0.72);      // square

    float m = mc;
    m = mix(m, mt, step(0.5, t));
    m = mix(m, mh, step(1.5, t));
    m = mix(m, ms, step(2.5, t));

    // background bands by row parity, ink two steps up the wheel; when they
    // land on the same flat a shape vanishes for that state — let it
    vec3 bg = pick(mod(st + shift + step(0.5, fract(cell.y * 0.5)) * 3.0, 6.0));
    vec3 fg = pick(mod(st + shift + 2.0 + floor(h1 * 3.0), 6.0));

    // some shapes are windows straight into the video — the picture plays
    // the part of a seventh flat
    vec3 ink = mix(fg, vid, step(1.0 - u_x3, h4));

    gl_FragColor = vec4(mix(bg, ink, m), 1.0);
}
