// Blob field: The Force's "sine of a colour" trick. Two noise fields, read
// through cosine-warped coordinates so they lobe symmetrically, each drive a
// per-channel sine scaled by one of the editor's named colours — blue against
// red, or yellow against orange further up the flavour knob. Because every
// channel crosses its wave at a different rate, the sum lands on pure
// R/G/B/C/M/Y patches, and a threshold then cuts those into the hard candy
// blobs of the original. Low on the harden knob it stays the smooth
// psychedelic wash of SinOfColor; at the top it is BlobPattern's razor cut.
// Video luma is pushed into both fields, so the blobs gather and split
// around the bright shapes in the picture.
//
// Adapted from The_Force by Shawn Lawson (github.com/shawnlawson/The_Force),
// shaderExperiments/BlobPattern.frag and SinOfColor.frag.
// The MIT License (MIT). Copyright (c) 2015 Shawn Lawson.
// Adapted: the construction c = cos(colour * field * clock) + sin(colour2 *
// field2 * clock), the cos/sin-warped noise coordinates, the step threshold
// into blobs, and the named-colour constants. Original to this port: value
// noise on a trigless hash in place of simplex noise, parabola-sine for all
// waves, bounded breathing in place of mod(time, 1) zooming, the
// wash-to-blob crossfade, video drive and the audio behaviour.
//
// Bass and highs kick the two waves' phases apart; the overall level swells
// the blobs.
//
// x0 scale, x1 harden, x2 flavor, x3 video
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
vec3 sw3(vec3 v) { return vec3(sw(v.x), sw(v.y), sw(v.z)); }

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
    float lum = dot(vid, vec3(0.299, 0.587, 0.114));

    float asp = u_resolution.x / u_resolution.y;
    vec2 st = (uv - 0.5) * vec2(asp, 1.0) * 2.0;

    // cosine-warped coordinates, after the original's cos(st * 10.) /
    // sin(st * 10.); the knob sweeps the lobe frequency
    float w = 0.4 + u_x0 * u_x0 * 2.2;
    vec2 uu = vec2(cw(st.x * w), cw(st.y * w));
    vec2 vv = vec2(sw(st.x * w), sw(st.y * w));

    // the fields breathe on a bounded orbit instead of mod-zooming, and the
    // picture's luma steers both of them
    float z1 = 1.5 + 1.3 * sw(u_time * 0.021);
    float z2 = 1.5 + 1.3 * cw(u_time * 0.034);
    float y = vnoise(uu * z1 + 7.3) * 2.0 - 1.0 + (lum - 0.5) * u_x3 * 2.0;
    float x = vnoise(vv * z2 + 2.1) * 2.0 - 1.0 + (vid.r - vid.b) * u_x3 * 1.5;

    // flavour: blue-against-red at the bottom, yellow-against-orange up top
    vec3 ca = mix(vec3(0.05, 0.35, 0.65), vec3(0.91, 0.89, 0.26), u_x2);
    vec3 cb = mix(vec3(0.86, 0.22, 0.27), vec3(0.92, 0.49, 0.07), u_x2);

    // sine of a colour: each channel crosses its wave at that colour's rate;
    // hits shove the two phases apart instead of multiplying the clock
    float k1 = 0.25 + u_time * 0.018;
    float k2 = 0.20 + u_time * 0.011;
    vec3 c = sw3(ca * (y * k1) + 0.41 + u_a0 * 0.20);
    c += sw3(cb * (x * k2) + 0.08 + u_a2 * 0.15);
    c *= 0.85 + u_a1 * 0.6;

    // wash at the bottom of the knob, hard candy blobs at the top
    vec3 wash = clamp(c * 0.40 + 0.45, 0.0, 1.0);
    vec3 hard = smoothstep(vec3(0.80), vec3(1.00), c);
    vec3 col = mix(wash, hard, u_x1);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
