// tourguide — every house technique in one commented effect.
// Ships with the make-effect skill as teaching material; it renders a
// noise-warped four-color field that trails through the feedback buffer,
// dithers, and lets the video glow through. Steal any block.
//
// The engine PREPENDS the precision/#version preamble — never write your
// own. Declaring a uniform is opting in: u_time gives the effect a speed
// slot, u_x3 a fourth knob, the audio uniforms the note badge. The scan is
// a plain substring search over the whole file, so even a comment naming an
// unused uniform flips the feature on — this file only names what it reads.

varying vec2 v_texcoord;
uniform sampler2D u_tex0;    // live video (or the previous layer in a chain)
uniform sampler2D u_tex1;    // previous OUTPUT frame: the feedback buffer
uniform sampler2D u_dither;  // 4x4 Bayer threshold map, .r in [0,1)
uniform vec2  u_resolution;  // render surface (640x480 on the handheld)
uniform float u_time;        // seconds; the speed slot scales it upstream
uniform float u_x0;          // knob 1: field scale
uniform float u_x1;          // knob 2: trail
uniform float u_x2;          // knob 3: palette
uniform float u_x3;          // knob 4: video glow
uniform float u_a0;          // audio bass  0..1 — push structure with it
uniform float u_a1;          // audio level 0..1 — swell brightness
uniform float u_a2;          // audio highs 0..1 — sprinkle detail

// House sine: VideoCore IV has no cheap trig, so waves are a parabola
// bounced through fract(). sw(x) ~ sin(2*pi*x), cw(x) ~ cos(2*pi*x),
// both in [-1,1] and good enough for anything that moves on screen.
float sw(float x) { x = fract(x) * 2.0 - 1.0; return 4.0 * x * (1.0 - abs(x)); }
float cw(float x) { return sw(x + 0.25); }

// Value noise from a small-constant hash. Keep hash constants modest:
// mediump has ~10 significant bits, and the 1e4-scale hashes shaders
// trade around online decompose into stripes on this GPU.
float vh(vec2 p) {
    return fract(43.758545 * fract(p.x * 0.1031 + p.y * 0.11369 + 0.129898));
}
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);   // smooth the lattice blend
    float a = vh(i);
    float b = vh(i + vec2(1.0, 0.0));
    float c = vh(i + vec2(0.0, 1.0));
    float d = vh(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    // Aspect correction: v_texcoord is 0..1 across a 4:3 surface; center
    // and widen x so circles come out round and drift is isotropic.
    vec2 st = v_texcoord;
    vec2 p = (st - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);

    float t = u_time * 0.08;   // slow master clock; speed knob scales u_time

    // ---- generator: two octaves of drifting noise; bass shoves the warp.
    float zoom = 2.0 + u_x0 * 8.0;                 // knob 1: field scale
    vec2 drift = vec2(cw(t), sw(t * 0.77)) * 1.5;  // an ORBIT, not a line
                                                   // walk — coords stay
                                                   // bounded, so mediump
                                                   // never runs out of bits
    float n = vnoise(p * zoom + drift);
    n += 0.5 * vnoise(p * zoom * 2.3 - drift + u_a0 * 0.8);
    n *= 0.6667;

    // ---- palette: four flats picked with nested mix/step — no arrays,
    // no dynamic indexing (the GPU forbids it). Knob 3 rotates the hues.
    float h = fract(n * 0.75 + u_x2);
    vec3 col = mix(vec3(0.08, 0.10, 0.35),
                   vec3(0.85, 0.20, 0.30), step(0.25, h));
    col = mix(col, vec3(0.98, 0.75, 0.20), step(0.50, h));
    col = mix(col, vec3(0.15, 0.75, 0.60), step(0.75, h));
    col *= 0.75 + 0.45 * u_a1;                     // level swells brightness

    // ---- ordered dither: the Bayer map tiles every 4 pixels; adding
    // (threshold - 0.5) before any quantize turns banding into stipple.
    // Highs sprinkle extra grain.
    float bay = texture2D(u_dither, floor(st * u_resolution) / 4.0).r;
    col += (bay - 0.5) * (0.12 + 0.25 * u_a2);

    // ---- feedback trail: mix toward the previous frame. The factor stays
    // strictly below 1 so the buffer always decays — a trail that can hit
    // 1.0 winds up to a stuck white screen within seconds.
    vec3 prev = texture2D(u_tex1, st).rgb;
    col = mix(col, prev, u_x1 * 0.82);             // knob 2: trail, cap 0.82

    // ---- video ground: the house convention for generators — the source
    // glows through scaled by the fourth knob, so the effect layers into a
    // chain instead of painting over it. Total fetches this file: 3 of the
    // budget of 16.
    vec3 vid = texture2D(u_tex0, st).rgb;
    col += vid * u_x3 * 0.85;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
