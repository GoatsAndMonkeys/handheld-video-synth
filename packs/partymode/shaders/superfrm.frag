// After curve-edit's superformula entry: Johan Gielis's 1997 generalisation
// of the superellipse,
//   r(t) = ( |cos(m t / 4)/a|^n2 + |sin(m t / 4)/b|^n3 ) ^ (-1/n1)
// one equation that becomes a circle, a triangle, a starfish or a flower
// depending on four numbers. The editor exposes those numbers as sliders;
// here the symmetry and the exponents are knobs, and the music leans on
// them so the shape keeps changing form.
//
// Analytic — no loop. Each pixel evaluates r at its own angle and measures
// how far it sits from the curve.
//
// x0 symmetry, x1 shape, x2 pinch, x3 video blend
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

float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }

vec3 pal(float h) {
    return 0.5 + 0.5 * vec3(sw(h), sw(h + 0.333), sw(h + 0.667));
}

void main() {
    vec2 uv = v_texcoord;
    vec3 vid = texture2D(u_tex0, uv).rgb;

    float asp = u_resolution.x / u_resolution.y;
    vec2 p = uv - 0.5;
    p.x *= asp;
    float r = length(p);
    float th = atan(p.y, p.x) + u_time * 0.07;

    // m need not be a whole number — fractional symmetry leaves the shape
    // open, which is half the fun of the original editor
    float m = 2.0 + floor(u_x0 * 12.0) + 0.5 * sw(u_time * 0.04);
    float n1 = 0.30 + u_x1 * 2.2 + u_a0 * 0.5;      // roundness
    float n23 = 0.40 + u_x2 * 3.0 + u_a2 * 0.6;     // pinch of the lobes

    float q = m * th * 0.25;
    float c = abs(cos(q));
    float s = abs(sin(q));
    float term = pow(c, n23) + pow(s, n23);
    float R = pow(max(term, 1e-4), -1.0 / max(n1, 0.05));
    R *= (0.13 + 0.10 * u_a1);                      // level breathes the size

    float d = abs(r - R);
    float w = 0.004 + 0.012 * (1.0 - u_x1 * 0.5) + 0.004 * u_a2;
    float mm = 1.0 - smoothstep(w * 0.5, w, d);
    float glow = exp(-d * d / max(w * w * 30.0, 1e-6)) * 0.45;

    float hue = u_time * 0.04 + th * 0.08 + r * 0.5;
    vec3 line = pal(hue);

    vec3 ground = vid * u_x3 * 0.85;
    vec3 col = ground * (1.0 - mm) + line * mm + line * glow;
    gl_FragColor = vec4(col, 1.0);
}
