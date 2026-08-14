// ZX Spectrum attribute clash: the screen is a grid of character cells
// and each cell may hold only two of the machine's fifteen colours
// (eight basic, seven bright — bright black is still black). Ink and
// paper are read off two probes inside the cell, every pixel snaps to
// whichever is nearer, and when the picture moves across a cell edge
// the colours collide in blocks — the clash IS the effect. Bass
// re-deals which cells rebel to the wrong ink.
// x0 cell size, x1 bright bit, x2 clash chaos, x3 video ghost
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;

// sine-free hash, as in melt: two values per call
vec2 hash2(float p) {
    vec3 q = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yzx + 33.33);
    return fract((q.xx + q.yz) * q.zy);
}

// Spectrum colour index 0..7 unpacked to its GRB bits, at one of the
// two voltage levels: 0xD7 normal, full bright
vec3 zxcol(float i, float level) {
    return vec3(mod(floor(i * 0.5), 2.0),
                mod(floor(i * 0.25), 2.0),
                mod(i, 2.0)) * level;
}

// nearest Spectrum primary: one bit per channel, blue+2*red+4*green
float zxidx(vec3 c) {
    vec3 q = step(0.45, c);
    return q.b + 2.0 * q.r + 4.0 * q.g;
}

void main() {
    // 32 cells across at the resting knob — the real machine's count
    float n = floor(mix(12.0, 52.0, u_x0));
    vec2 grid = vec2(n, n * u_resolution.y / u_resolution.x);
    vec2 cell = floor(v_texcoord * grid);

    // two probes on the cell diagonal stand in for its content; the
    // brighter becomes paper, the darker ink. One cell, one attribute
    // byte — the neighbours' pixels be damned
    vec3 pa = texture2D(u_tex0, (cell + 0.3) / grid).rgb;
    vec3 pb = texture2D(u_tex0, (cell + 0.7) / grid).rgb;
    const vec3 W = vec3(0.299, 0.587, 0.114);
    float la = dot(pa, W);
    float lb = dot(pb, W);
    float swap = step(la, lb);
    vec3 paper = mix(pa, pb, swap);
    vec3 inks = mix(pb, pa, swap);

    // the bright bit is per cell: never fired at 0, luma-gated in the
    // middle, always on at full
    float bright = step(1.05 - u_x1 * 1.4, max(la, lb));
    float level = mix(0.843, 1.0, bright);

    float ip = zxidx(paper);
    float ii = zxidx(inks);

    // chaos: a hash per cell decides who rebels; bass both widens the
    // net and re-seeds it, so a kick shuffles the rebel cells
    vec2 h = hash2(dot(cell, vec2(1.0, 57.0)) + floor(u_a0 * 3.0) * 113.0);
    float rebel = step(1.0 - u_x2 * (0.6 + u_a0 * 0.4), h.x);
    ii = mix(ii, mod(ii + 1.0 + floor(h.y * 6.99), 8.0), rebel);
    vec3 inkC = zxcol(ii, mix(level, 1.0, rebel));   // rebels go bright
    vec3 papC = zxcol(ip, level);

    // inside the cell the bitmap is 8x8: each fat pixel snaps to
    // whichever of the two attribute colours it sits closer to
    vec2 pgrid = grid * 8.0;
    vec2 puv = (floor(v_texcoord * pgrid) + 0.5) / pgrid;
    vec3 pix = texture2D(u_tex0, puv).rgb;
    vec3 di = pix - inkC;
    vec3 dp = pix - papC;
    vec3 c = mix(papC, inkC, step(dot(di, di), dot(dp, dp)));

    // clean video ghosts back over the clash, gently until high up
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    gl_FragColor = vec4(mix(c, src, u_x3 * u_x3), 1.0);
}
