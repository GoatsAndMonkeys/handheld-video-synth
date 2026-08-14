// After phosphorm, Andrei Jay's audio-visual synth for X-Y oscilloscope
// displays: a vector beam sweeping an epicycle path — three stacked rotating
// arms whose reaches breathe with the audio bands — over a dark ground.
// Each frame draws only the short arc the beam just covered; the figure
// exists because the tube remembers. Persistence here is the engine's delay
// line: both ring taps folded back under the beam, so the trace steps
// through past output frames the way phosphor blooms and dies. That makes
// it a different animal from the demo scope, which redraws its whole
// Lissajous every frame and decays it one frame at a time.
//
// x0 pattern (arm gear ratio; when this is the last effect in the chain it
// also drives the tap depth, so the same knob stretches the phosphor),
// x1 beam brightness/width, x2 persistence, x3 video blend
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex2;   // ring tap at x0 depth
uniform sampler2D u_tex3;   // ring tap at half depth
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;
uniform float u_a1;
uniform float u_a2;

// cheap sine on a unit period: sw(x) ~ sin(2*pi*x) — six of these per
// segment is fine, six hardware-emulated sins per segment is not
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }
float cw(float x) { return sw(x + 0.25); }

// three arms on one shaft: fundamental, a counter-rotating middle arm (the
// counter-rotation is what folds the circle into rosettes rather than
// blobs) and a fast tip. Reaches arrive in r, already scaled by the bands.
vec2 arm(float t, float g1, float g2, vec3 r) {
    return r.x * vec2(sw(t), cw(t))
         + r.y * vec2(sw(0.13 - t * g1), cw(0.13 - t * g1))
         + r.z * vec2(sw(t * g2 + 0.41), cw(t * g2 + 0.41));
}

void main() {
    vec2 uv = v_texcoord;
    vec3 vid = texture2D(u_tex0, uv).rgb;
    vec2 p = uv - 0.5;
    p.x *= u_resolution.x / u_resolution.y;

    // gear ratios land on small integers so the path closes into a figure
    float g1 = 2.0 + floor(u_x0 * 5.0);
    float g2 = g1 * 2.0 + 1.0;
    vec3 r = vec3(0.17 + 0.10 * u_a1,      // fundamental breathes with level
                  0.07 * (0.5 + u_a0),     // middle arm rides the bass
                  0.035 * (0.4 + u_a2));   // tip flutters on the highs

    float w = 0.004 + u_x1 * 0.014;
    float k1 = max(w * w * 22.0, 1e-7);
    float head = u_time * 0.11;            // where the beam is now
    float win = 0.085;                     // how much arc one frame draws

    float glow = 0.0;
    vec2 prev = arm(head - win, g1, g2, r);
    for (int i = 1; i <= 12; i++) {
        float t = head - win + win * float(i) / 12.0;
        vec2 q = arm(t, g1, g2, r);
        vec2 e = q - prev;
        vec2 gv = p - prev;
        float h = clamp(dot(gv, e) / max(dot(e, e), 1e-6), 0.0, 1.0);
        float d = length(gv - e * h);
        // the newest segments burn hottest — that is the sweep direction
        glow += exp(-d * d / k1) * (0.35 + 0.65 * float(i) / 12.0);
        prev = q;
    }
    // and the spot itself, sitting at the head of the sweep
    float dh = length(p - prev);
    glow += exp(-dh * dh / max(w * w * 9.0, 1e-7)) * 1.3;

    glow *= 0.55 + u_x1 * 1.1;

    // tube tint drifts between scope green and amber; the core whites out
    vec3 tint = mix(vec3(0.35, 1.0, 0.72), vec3(1.0, 0.72, 0.35),
                    0.5 + 0.5 * sw(u_time * 0.017));
    vec3 beam = tint * min(glow, 2.5) + vec3(glow * glow * 0.10);

    // phosphor: both taps, gain under 1.0 so the trace always dies out
    vec3 trail = max(texture2D(u_tex2, uv).rgb,
                     texture2D(u_tex3, uv).rgb) * (0.30 + u_x2 * 0.68);
    vec3 ground = vid * (u_x3 * 0.30);

    gl_FragColor = vec4(clamp(max(ground, trail) + beam, 0.0, 1.0), 1.0);
}
