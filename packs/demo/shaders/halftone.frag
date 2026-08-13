// CMYK halftone: four rotated dot screens (15/75/0/45 degrees) print
// the image like a comic page; ink slider fades between one-ink
// newspaper grey and full process color. x0 dots, x1 ink, x2 gain,
// x3 screen angle — every screen turns together, 0 = the stock plate
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

// screen angles baked to literal cos/sin — 15, 75, 45 degrees
const vec2 A15 = vec2(0.96592567, 0.25881964);
const vec2 A75 = vec2(0.25881609, 0.96592662);
const vec2 A45 = vec2(0.70710548, 0.70710808);

// distance to the nearest dot centre of a screen rotated by cs
float cell(vec2 p, vec2 cs) {
    return length(fract(vec2(dot(p, cs), p.y * cs.x - p.x * cs.y)) - 0.5);
}

// dot coverage at that distance for a given ink density
float cov(float d, float dens) {
    float r = 0.63 * sqrt(clamp(dens, 0.0, 1.0));
    return 1.0 - smoothstep(r - 0.09, r + 0.09, d);
}

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    vec2 p = v_texcoord * vec2(1.0, u_resolution.y / u_resolution.x)
             * mix(90.0, 22.0, u_x0);
    // one rotation for all four plates: normalised so turning the
    // rosette never resizes the dots. 0 -> 45 degrees
    float a = u_x3;
    p = vec2(p.x - a * p.y, p.y + a * p.x) * inversesqrt(1.0 + a * a);
    float gain = 0.55 + u_x2 * 0.9;

    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    vec3 cmy = 1.0 - src;
    float k = min(min(cmy.r, cmy.g), cmy.b);
    vec3 c3 = (cmy - k * 0.6) * gain;   // partial undercolor removal

    float d45 = cell(p, A45);           // black and grey share one screen
    float cd = cov(cell(p, A15), c3.r);
    float md = cov(cell(p, A75), c3.g);
    float yd = cov(length(fract(p) - 0.5), c3.b);
    float kd = cov(d45, k * gain);
    float gd = cov(d45, (1.0 - dot(src, W)) * gain);

    vec3 paper = vec3(0.98, 0.96, 0.90);
    vec3 ink = paper;
    ink *= mix(vec3(1.0), vec3(0.05, 0.70, 0.90), cd);
    ink *= mix(vec3(1.0), vec3(0.90, 0.10, 0.55), md);
    ink *= mix(vec3(1.0), vec3(0.98, 0.86, 0.05), yd);
    ink *= 1.0 - kd * 0.92;

    gl_FragColor = vec4(mix(paper * (1.0 - gd * 0.92), ink, u_x1), 1.0);
}
