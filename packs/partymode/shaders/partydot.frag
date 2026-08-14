// After party-mode's signature look: concentric rings of dots, every dot
// swelling to the music, the whole constellation slowly turning. The SVG
// original appends circle elements ring by ring; here each pixel finds its
// ring, then its sector within the ring, then its distance to that sector's
// dot — one dot evaluated per pixel, however many appear on screen.
//
// x0 ring pitch, x1 pulse depth, x2 colour spread, x3 video blend
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
    float th = atan(p.y, p.x) / 6.2831853 + 0.5;   // 0..1 around

    float pitch = 0.035 + u_x0 * 0.10;
    float ring = floor(r / pitch + 0.5);           // nearest ring
    float rr = r - ring * pitch;                   // radial offset from it

    // more dots on outer rings, the way the SVG packs them; each ring
    // counter-rotates against its neighbours so the field never locks up
    float n = 4.0 + ring * 6.0;
    float spin = u_time * 0.05 * (mod(ring, 2.0) * 2.0 - 1.0)
               + ring * 0.13;
    float sect = fract(th * n + spin) - 0.5;

    // local distance to the dot centre: angular offset scaled out to arc
    // length at this ring's radius, radial offset as-is
    float arc = sect * 6.2831853 * ring * pitch / n;
    float dist = length(vec2(arc, rr));

    // every dot breathes with the band mix, phased by ring so pulses run
    // outward across the field the way the original's transitions do
    float pulse = 0.30 + u_a0 * 1.5 * sw(u_time * 0.4 - ring * 0.09)
                + u_a2 * 0.7 * sw(u_time * 0.9 + ring * 0.21);
    float rad = pitch * (0.14 + u_x1 * 0.30 * max(pulse, 0.05))
              * (0.6 + 0.4 * u_a1);
    float m = 1.0 - smoothstep(rad * 0.55, rad, dist);
    float glow = exp(-dist * dist / max(rad * rad * 4.0, 1e-5)) * 0.35;

    float hue = u_time * 0.03 + ring * (0.03 + u_x2 * 0.20)
              + floor(th * n + spin) * 0.002;
    vec3 dot_col = pal(hue);

    vec3 ground = vid * u_x3 * 0.85;
    vec3 col = ground * (1.0 - m) + dot_col * m + dot_col * glow;
    gl_FragColor = vec4(col, 1.0);
}
