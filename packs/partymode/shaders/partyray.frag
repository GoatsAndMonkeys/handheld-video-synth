// After party-mode's radial bursts: a circle of bars shooting out from the
// centre, reading like a round level meter. The d3 original binds the Web
// Audio waveform array to line elements; here the waveform is aud(), an
// oscillator sum over the engine's three bands, and each pixel checks how
// far its sector's bar reaches.
//
// x0 ray count, x1 reach, x2 colour spread, x3 video blend
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

// the stand-in waveform: three detuned oscillators, each band its own speed
float aud(float s) {
    return (sw(s * 3.0 + u_time * 0.27) * (0.30 + u_a0 * 1.6)
          + sw(s * 8.0 - u_time * 0.61) * (0.16 + u_a2 * 1.2)
          + sw(s * 13.0 + u_time * 0.13) * 0.10)
         * (0.5 + u_a1 * 1.0);
}

void main() {
    vec2 uv = v_texcoord;
    vec3 vid = texture2D(u_tex0, uv).rgb;

    float asp = u_resolution.x / u_resolution.y;
    vec2 p = uv - 0.5;
    p.x *= asp;
    float r = length(p);
    float th = atan(p.y, p.x) / 6.2831853 + 0.5;

    float n = floor(12.0 + u_x0 * 84.0);
    float spin = u_time * 0.03;
    float sect = floor(fract(th + spin) * n);
    float within = fract(fract(th + spin) * n) - 0.5;

    // this sector's bar: an inner hub, then reach driven by the waveform
    float hub = 0.06 + 0.05 * u_a0;
    float reach = hub + (0.10 + u_x1 * 0.38)
                * (0.35 + 0.65 * abs(aud(sect / n)));

    // inside the bar: past the hub, short of the tip, near the sector spine
    float half_w = 0.18 + 0.14 * u_a1;
    float across = abs(within) / half_w;
    float m = (1.0 - smoothstep(0.7, 1.0, across))
            * smoothstep(hub - 0.012, hub, r)
            * (1.0 - smoothstep(reach - 0.015, reach, r));

    // tips burn brighter, and a faint hub disc anchors the middle
    float tip = exp(-abs(r - reach) * 60.0) * m;
    float disc = 1.0 - smoothstep(hub * 0.55, hub * 0.8, r);

    float hue = u_time * 0.05 + sect * (0.004 + u_x2 * 0.03);
    vec3 bar = pal(hue);

    vec3 ground = vid * u_x3 * 0.85;
    vec3 col = ground * (1.0 - max(m, disc))
             + bar * m * (0.75 + 0.5 * tip)
             + pal(hue + 0.5) * disc * 0.7;
    gl_FragColor = vec4(col, 1.0);
}
