// Flip-dot sign: a board of round discs, painted on one side and matte
// black on the other, each flipped by its own little coil. The target
// image is the thresholded video luma per cell; where each dot actually
// IS right now lives in the previous frame — sampled at the cell centre —
// and chases the target at a mechanical rate, so a scene change ripples
// across the board instead of cutting. The disc face is painted
// mix(0.05, 1.0, state) in the red channel and every face colour on the
// x3 knob keeps red at 1.0, so red at the cell centre IS the dot's state
// and the sign remembers itself frame to frame. Mid-flip the disc is
// edge-on: it squeezes to a thin ellipse and dims, never below a texel
// wide, so the state survives the trip. A row-scan wavefront sweeps down
// the board like a real sign's refresh; bass jolts the flip rate and
// flushes a wave of flips through the scan gate.
//
// x0 dot size, x1 flip lag, x2 scan wave, x3 face colour
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output frame
uniform sampler2D u_dither;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;

void main() {
    // square cells: 18 dots across (lobby sign) to 56 (fine ticker)
    float px = mix(18.0, 56.0, u_x0);
    vec2 grid = vec2(px, px * u_resolution.y / u_resolution.x);
    vec2 cell = floor(v_texcoord * grid);
    vec2 centre = (cell + 0.5) / grid;

    // target face for this dot: thresholded luma, Bayer-nudged so a
    // gradient becomes a mixed-dot field instead of one hard contour
    vec3 src = texture2D(u_tex0, centre).rgb;
    float lum = dot(src, vec3(0.299, 0.587, 0.114));
    float d = texture2D(u_dither, cell / 4.0).r;
    float target = step(0.5, lum + (d - 0.5) * 0.45);

    // where the dot is now: read our own last frame at the cell centre,
    // snapped to a texel centre so the bilinear filter cannot smear the
    // reading toward the board colour
    vec2 snap = (floor(centre * u_resolution) + 0.5) / u_resolution;
    float s = clamp((texture2D(u_tex1, snap).r - 0.05) / 0.95, 0.0, 1.0);

    // the row scan: a front sweeps down the board a couple of times a
    // second; dots just behind it may move, dots elsewhere mostly wait.
    // The 0.03 floor means nothing is ever stuck forever, and a bass hit
    // opens the gate board-wide — a whole wave of flips at once
    float row = 1.0 - centre.y;
    float behindFront = fract(fract(u_time * 0.4) - row);
    float band = 1.0 - smoothstep(0.0, 0.28, behindFront);
    float gate = mix(1.0, max(band, 0.03), u_x2);
    gate = min(gate + u_a0 * u_a0, 1.0);

    // mechanical lag: fixed step per frame, not a proportional fade —
    // that is what makes it read as a machine and not as crossfade
    float rate = mix(0.85, 0.05, u_x1) * (1.0 + u_a0 * 1.5);
    float delta = target - s;
    s = clamp(s + sign(delta) * min(abs(delta), rate * gate), 0.0, 1.0);

    // draw the disc. Mid-flip it turns edge-on: squeeze horizontally,
    // floored at a quarter width so the centre texel stays on the face
    vec2 f = fract(v_texcoord * grid) - 0.5;
    float flip = 1.0 - abs(2.0 * s - 1.0);
    float wx = mix(1.0, 0.25, flip);
    float e = length(vec2(f.x / wx, f.y)) / 0.42;
    float disc = 1.0 - smoothstep(0.88, 1.0, e);

    // face colour: yellow through white to amber — all with red pinned
    // at 1.0, which is what keeps the state channel honest
    vec3 dotcol = mix(vec3(1.0, 0.83, 0.0), vec3(1.0), smoothstep(0.0, 0.5, u_x3));
    dotcol = mix(dotcol, vec3(1.0, 0.62, 0.13), smoothstep(0.5, 1.0, u_x3));

    vec3 face = mix(vec3(0.05), dotcol, s);
    vec3 board = vec3(0.020, 0.020, 0.026);
    gl_FragColor = vec4(mix(board, face, disc), 1.0);
}
