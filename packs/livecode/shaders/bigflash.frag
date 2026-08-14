// Bigflash: after Sarah Groff Hennigh-Palermo's la-habra (MIT,
// https://github.com/sarahgp/la-habra) — the poster end of her sets: a few
// enormous flat shapes against a field of solid colour, everything
// jump-cutting on a clock. A dome rises from the bottom edge, one big
// circle and one triangle land somewhere new each state, a row of dots
// marches across, and the background flashes through the palette with them.
// No gradients anywhere; SVG-flat fills only. La-habra composes SVG in
// ClojureScript, so nothing here is a port — original per-pixel GLSL after
// the look. Bass drags the next cut in early, loud passages remap the
// palette, highs rattle the shapes' scale.
//
// x0 shape size, x1 snap rate, x2 palette, x3 video windows
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
float cw(float x) { return sw(x + 0.25); }

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
    vec2 p = uv - 0.5;
    p.x *= asp;

    // the state clock: sixteen layouts, hard cuts between them. Bass shoves
    // the phase so a kick lands the next cut early; small state numbers keep
    // the hashes clean in mediump.
    float rate = 0.15 + u_x1 * 1.6;
    float st = floor(mod(u_time * rate + u_a0 * 1.4, 16.0));
    float shift = floor(u_x2 * 5.999) + step(0.55, u_a1) * 3.0;

    float ha = fract(st * 0.6137 + 0.113);
    float hb = fract(st * 0.7477 + 0.417);
    float hc = fract(st * 0.3167 + 0.771);
    float hd = fract(st * 0.8191 + 0.271);
    float he = fract(hd * 5.17 + 0.31);

    float sz = 0.55 + u_x0 * 0.75;

    // dome off the bottom edge: a circle whose centre sits on the frame line
    float rd = (0.20 + hb * 0.28) * sz
             * (1.0 + u_a2 * (fract(ha * 7.13) - 0.5) * 0.6);
    vec2 pd = p - vec2((ha - 0.5) * 0.9, -0.5);
    float mdome = step(dot(pd, pd), rd * rd);

    // big triangle, apex up, somewhere new each state
    float rt = (0.12 + he * 0.18) * sz
             * (1.0 + u_a2 * (fract(hc * 7.13) - 0.5) * 0.6);
    vec2 tp = p - vec2((hc - 0.5) * 1.1, (hd - 0.5) * 0.6);
    float mtri = step(tp.y, rt * 0.8 - abs(tp.x) * 1.9) * step(-rt * 0.7, tp.y);

    // big circle with the slightest drift so a frozen state still lives
    float rc = (0.10 + hc * 0.16) * sz
             * (1.0 + u_a2 * (fract(hb * 7.13) - 0.5) * 0.6);
    vec2 cp = p - vec2((hb - 0.5) * 1.1 + 0.02 * sw(u_time * 0.07),
                       (hc - 0.5) * 0.55 + 0.05);
    float mcirc = step(dot(cp, cp), rc * rc);

    // a row of dots on a band that jumps per state, each dot bobbing
    float n = floor(5.0 + u_x0 * 9.0);
    float qx = (p.x / asp + 0.5) * n;
    float yb = (fract(hc * 3.71) - 0.5) * 0.7
             + 0.015 * cw(u_time * 0.21 + floor(qx) * 0.17);
    vec2 dd = vec2(fract(qx) - 0.5, (p.y - yb) * n / asp);
    float mdot = step(dot(dd, dd), 0.08);

    // every fill snaps around the same six-colour wheel; the knob and loud
    // passages rotate which flat lands where
    vec3 bg   = pick(mod(st + shift,       6.0));
    vec3 dome = pick(mod(st + shift + 2.0, 6.0));
    vec3 tri  = pick(mod(st + shift + 4.0, 6.0));
    vec3 circ = pick(mod(st + shift + 1.0, 6.0));
    vec3 dots = pick(mod(st + shift + 5.0, 6.0));

    // shapes open as windows into the video, one at a time up the knob —
    // the picture is just another flat in the deck
    circ = mix(circ, vid, step(0.2, u_x3));
    tri  = mix(tri,  vid, step(0.5, u_x3));
    dome = mix(dome, vid, step(0.8, u_x3));

    vec3 col = bg;
    col = mix(col, dome, mdome);
    col = mix(col, tri,  mtri);
    col = mix(col, circ, mcirc);
    col = mix(col, dots, mdot);
    gl_FragColor = vec4(col, 1.0);
}
