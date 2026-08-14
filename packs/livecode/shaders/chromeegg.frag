// Chrome eggs: a log-polar well of liquid-metal rings. Distance from centre
// goes through a log so the rings crowd the middle and stretch outward, a
// cellular field multiplies that distance so every cell bends its own patch
// of rings into an egg-shaped bulge, and the whole thing rolls slowly inward.
// The three channels read the rings at slightly different phases in the
// proportions of The Force's orange, which is what gives the fringes their
// chrome sheen. The previous frame is folded back in for a trail, after the
// original's backbuffer mix. Video luma bends the ring field, so the picture
// embosses itself into the chrome, and glows through the dark gaps.
//
// Adapted from The_Force by Shawn Lawson (github.com/shawnlawson/The_Force),
// shaderExperiments/RadialChromeEggs.frag and RadialFractal.frag.
// The MIT License (MIT). Copyright (c) 2015 Shawn Lawson.
// Adapted: the log-polar field (phi = log(length(st))), the construction
// d = phi * voronoi(rotated st) - time with sin(d * k + orange) colouring,
// and RadialFractal's backbuffer trail. Original to this port: parabola-sine
// in place of all trig, the trigless cell hash, the F1-only cell search,
// video etch/glow-through and the audio behaviour.
//
// Bass jolts the rings inward a step; highs widen the chrome fringing.
//
// x0 warp, x1 rings, x2 trail, x3 video
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;
uniform float u_a2;

// cheap sine on a unit period: sw(x) ~ sin(2*pi*x)
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }
float cw(float x) { return sw(x + 0.25); }

// two decorrelated 0..1 randoms per lattice cell, no trig involved
vec2 hash2(vec2 p) {
    return fract(vec2(sw(dot(p, vec2(0.12707, 0.31171))) * 41.53,
                      sw(dot(p, vec2(0.26951, 0.18339))) * 37.61));
}

void main() {
    vec2 uv = v_texcoord;
    vec3 vid = texture2D(u_tex0, uv).rgb;
    float lum = dot(vid, vec3(0.299, 0.587, 0.114));

    float asp = u_resolution.x / u_resolution.y;
    vec2 st = (uv - 0.5) * vec2(asp, 1.0) * 2.0;

    // the log-polar well: rings crowd the centre, stretch outward
    float phi = log(max(length(st), 0.001)) * 0.5;

    // the cell field turns slowly about an off-centre pivot, like the
    // original's rotate(st, vec2(0, -2), time * .1)
    float ang = u_time * 0.012;
    vec2 rc = vec2(cw(ang), sw(ang));
    vec2 q = st - vec2(0.0, -0.8);
    q = vec2(rc.x * q.x + rc.y * q.y, rc.x * q.y - rc.y * q.x);

    // nearest-point cellular field, static points, constant 3x3 search
    float sc = 2.0 + u_x0 * 6.0;
    vec2 p = q * sc * 0.5;
    vec2 ic = floor(p);
    vec2 fc = fract(p);
    float f1 = 8.0;
    for (int j = 0; j < 3; j++) {
        for (int i = 0; i < 3; i++) {
            vec2 g = vec2(float(i) - 1.0, float(j) - 1.0);
            vec2 h = hash2(ic + g);
            vec2 d2 = g + 0.20 + 0.60 * h - fc;
            f1 = min(f1, dot(d2, d2));
        }
    }
    float vor = sqrt(f1);

    // ring phase: log-distance times the cell field, rolling inward; the
    // picture's brightness bends it, a kick shoves it a step further
    float dens = 1.0 + u_x1 * 3.5;
    float d = phi * vor * dens - u_time * 0.045
            + (lum - 0.5) * u_x3 * 1.4 - u_a0 * 0.30;

    // per-channel phase split in orange proportions = the chrome fringe
    vec3 ph = vec3(0.92, 0.49, 0.07) * (0.10 + u_a2 * 0.09);
    vec3 ring = 0.5 + 0.5 * vec3(sw(d + ph.r), sw(d + ph.g), sw(d + ph.b));

    // video glows through where the rings run dark
    float m = smoothstep(0.06, 0.50, dot(ring, vec3(0.299, 0.587, 0.114)));
    vec3 ground = vid * u_x3 * 0.70;
    vec3 col = ground * (1.0 - m) + ring * m;

    // the trail: fold the previous frame back in; fresh paint always keeps
    // at least a tenth of the mix, so it smears without whiting out
    vec3 bb = texture2D(u_tex1, uv).rgb;
    col = mix(col, bb, u_x2 * 0.90);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
