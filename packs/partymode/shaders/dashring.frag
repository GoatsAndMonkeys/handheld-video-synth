// After party-mode's dashed circles: the SVG original leans hard on
// stroke-dasharray — rings whose arcs chase their own tails at different
// speeds, gaps and dashes trading places on the beat. Per pixel: find the
// nearest ring, then whether this angle lands on a dash of that ring's
// pattern, every ring dashed and phased differently.
//
// x0 ring pitch, x1 dash count, x2 colour spread, x3 video blend
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
    float th = atan(p.y, p.x) / 6.2831853 + 0.5;

    float pitch = 0.030 + u_x0 * 0.09;
    float ring = floor(r / pitch + 0.5);
    float rr = abs(r - ring * pitch);

    // each ring gets its own dash count, direction and speed — odd rings
    // run against even ones, and the bass nudges everything along
    float dashes = floor(3.0 + u_x1 * 14.0 + mod(ring * 5.0, 7.0));
    float dir = mod(ring, 2.0) * 2.0 - 1.0;
    float phase = u_time * (0.04 + 0.02 * mod(ring, 3.0)) * dir
                + u_a0 * 0.15 * dir;
    float duty = 0.35 + 0.30 * sw(ring * 0.23 + u_time * 0.07)
               + u_a1 * 0.25;
    float on = step(fract(th * dashes + phase), clamp(duty, 0.08, 0.92));

    // stroke width breathes with the highs; a soft glow hugs the line
    float w = pitch * (0.10 + 0.10 * u_a2 + 0.05 * u_a0);
    float m = (1.0 - smoothstep(w * 0.5, w, rr)) * on;
    float glow = exp(-rr * rr / max(w * w * 6.0, 1e-6)) * on * 0.30;

    float hue = u_time * 0.04 + ring * (0.03 + u_x2 * 0.18);
    vec3 line = pal(hue);

    vec3 ground = vid * u_x3 * 0.85;
    vec3 col = ground * (1.0 - m) + line * m + line * glow;
    gl_FragColor = vec4(col, 1.0);
}
