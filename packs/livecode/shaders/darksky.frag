// Dark analog sky: an aurora built from almost nothing. Three noise fields
// that vary only with height are raised to a high power, so all that
// survives is a handful of thin bright streaks lying across a black sky —
// one tinted The Force's blue, one its yellow, one its red. A slowly turning
// second noise field multiplies the streaks and eats ragged holes in them,
// which is what turns clean bands into weather. Each audio band shoves its
// own colour's streaks to a new height, so the sky rearranges itself with
// the music. Video shows through behind the sky on the fourth knob.
//
// Adapted from The_Force by Shawn Lawson (github.com/shawnlawson/The_Force),
// shaderExperiments/DarkAnalogSkies.frag.
// The MIT License (MIT). Copyright (c) 2015 Shawn Lawson.
// Adapted: the layer construction f = noise(st.y + offset, time) sharpened
// by pow(f, 9.) * 15., the blue/yellow/red layer tints, the rotating noise
// multiplier, and the per-band layer offsets from the original's audio
// lines. Original to this port: value noise on a trigless hash, the bounded
// orbit that replaces an ever-growing time coordinate, parabola-sine
// rotation, the spike and shimmer knobs, and the video ground.
//
// x0 spikes, x1 drift, x2 shimmer, x3 video
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

float hv(vec2 p) { return fract(sw(dot(p, vec2(0.12707, 0.31171))) * 43.53); }

// classic 2D value noise on the trigless hash
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hv(i);
    float b = hv(i + vec2(1.0, 0.0));
    float c = hv(i + vec2(0.0, 1.0));
    float d = hv(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    vec2 uv = v_texcoord;
    vec3 vid = texture2D(u_tex0, uv).rgb;

    float asp = u_resolution.x / u_resolution.y;
    vec2 st = (uv - 0.5) * vec2(asp, 1.0) * 2.0;

    // the sky churns on a bounded orbit rather than a coordinate that grows
    // forever — a mediump lattice needs its numbers kept small
    float t = u_time * (0.03 + u_x1 * 0.30);
    vec2 orb = vec2(sw(t * 0.31), cw(t * 0.23)) * 3.0;

    // spike shaping: broad glowing bands at the bottom of the knob, rare
    // lightning-thin streaks at the top; gain rises with the exponent so
    // the survivors stay bright
    float e = 3.0 + u_x0 * 11.0;
    float g = 1.5 + e * 1.5;

    // three height-only layers; each band lifts its own colour's streaks
    float f1 = vnoise(vec2(st.y * 1.7 + 0.3 + u_a0 * 0.5, orb.x));
    float f2 = vnoise(vec2(st.y * 1.7 + 0.2 + u_a1 * 0.5, orb.x + 4.7));
    float f3 = vnoise(vec2(st.y * 1.7 + u_a2 * 0.5, orb.y + 9.3));
    f1 = pow(max(f1, 0.001), e) * g;
    f2 = pow(max(f2, 0.001), e) * g;
    f3 = pow(max(f3, 0.001), e) * g;

    vec3 c = f1 * vec3(0.05, 0.35, 0.65)
           + f2 * vec3(0.91, 0.89, 0.26)
           + f3 * vec3(0.86, 0.22, 0.27);

    // the turning noise field that eats holes in the streaks
    float ang = t * 0.05;
    vec2 rc = vec2(cw(ang), sw(ang));
    vec2 p = st * 2.0;
    p = vec2(rc.x * p.x + rc.y * p.y, rc.x * p.y - rc.y * p.x);
    float ff = vnoise(p + 31.7);
    c *= mix(1.0, ff * 1.7, u_x2);

    // video is the ground the sky hangs over
    c = clamp(c, 0.0, 1.0);
    float m = smoothstep(0.05, 0.60, dot(c, vec3(0.299, 0.587, 0.114)));
    vec3 ground = vid * u_x3 * 0.85;
    gl_FragColor = vec4(ground * (1.0 - m) + c * m, 1.0);
}
