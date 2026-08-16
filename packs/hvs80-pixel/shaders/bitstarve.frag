// bitstarve — a digital video stream that isn't getting enough bits.
// The pixel pack's reproduction-process take on block-transform coding:
// where jpegcrush (glitch pack) runs a genuine DCT on one still, this is
// the *temporal* damage of a starved encoder. Each tick only a budget of
// macroblocks receives fresh data; the rest are told "same as last frame"
// and copy themselves out of the feedback buffer, so motion tears into a
// patchwork of stale tiles. Fresh blocks are stored as their DC average
// plus a residual posterised into quantiser steps — detail collapses
// toward flat squares as the bitrate falls — with a ripple of mosquito
// noise painted along whatever edge the quantiser mauled, shimmering per
// tick the way it does around text. Chroma is averaged on its own coarser
// grid and quantised hard, so colour arrives late and bleeds across block
// borders. Two things keep prediction error bounded, the way real
// decoders stay sane: held blocks are LEAKY (every frame they drift a few
// percent toward the current decode, so a stale block can lag but never
// diverge), and a rolling intra-refresh band sweeps the frame every few
// seconds forcing rows fresh regardless of budget. No knob setting can
// run away from the source.
//
// x0 bitrate, x1 blocks, x2 chroma, x3 smear
varying vec2 v_texcoord;
uniform sampler2D u_tex0;   // source video
uniform sampler2D u_tex1;   // previous output frame: the reference picture
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;

// house sine, period 1, range -1..1
float sw(float x) { x = fract(x) * 2.0 - 1.0; return 4.0 * x * (1.0 - abs(x)); }

// small-constant hash, mediump-safe
float vh(vec2 p) {
    return fract(43.758545 * fract(p.x * 0.1031 + p.y * 0.11369 + 0.129898));
}

void main() {
    vec3 W = vec3(0.299, 0.587, 0.114);

    // macroblock grid, square in screen pixels: 8 px at rest, up to 32
    float bs = floor(8.0 + u_x1 * 24.0);
    vec2 bpx = vec2(bs) / u_resolution;
    vec2 cell = floor(v_texcoord / bpx);
    vec2 sub = fract(v_texcoord / bpx);

    // the transmission clock: ~5 block-update ticks a second, wrapped so
    // the counter never walks out of mediump's mantissa
    float tick = floor(fract(u_time * 0.078) * 64.0);

    // which blocks got bits this tick: a per-block lottery against the
    // bitrate budget. The lottery hash is fed through a second hash —
    // one pass of the linear hash makes an arithmetic progression along
    // lattice lines, and thresholding that draws diagonal stripes, not
    // noise. Bass buys a modest burst of updates — the picture firms up
    // on a hit, then starves again. The floor keeps every block in the
    // draw even at zero.
    vec2 tj = vec2(vh(vec2(tick * 0.113, 0.271)),
                   vh(vec2(0.617, tick * 0.101))) * 19.0;
    float h1 = vh(cell + tj);
    float lot = vh(vec2(h1 * 13.0, vh(cell.yx * 1.618 + tj) * 29.0));
    float budget = 0.05 + u_x0 * u_x0 * 0.95 + u_a0 * u_a0 * 0.25;
    float fresh = step(lot, budget);

    // rolling intra refresh: a band sweeps down the frame every ~5s of
    // effect time and forces those rows fresh — the scheduled repair
    float sweep = fract(fract(u_time * 0.18) - (1.0 - v_texcoord.y));
    fresh = max(fresh, 1.0 - step(0.10, sweep));

    // ---- fresh path: decode this block from the source.
    // Four quarter-point taps stand in for the block mean (the DC term).
    vec2 base = cell * bpx;
    vec3 m00 = texture2D(u_tex0, base + bpx * vec2(0.25, 0.25)).rgb;
    vec3 m10 = texture2D(u_tex0, base + bpx * vec2(0.75, 0.25)).rgb;
    vec3 m01 = texture2D(u_tex0, base + bpx * vec2(0.25, 0.75)).rgb;
    vec3 m11 = texture2D(u_tex0, base + bpx * vec2(0.75, 0.75)).rgb;
    vec3 meanc = (m00 + m10 + m01 + m11) * 0.25;
    float ymean = dot(meanc, W);

    // residual against the DC, posterised into quantiser steps: rounded
    // to nearest, so a hard edge keeps one coarse step of itself even
    // when starved — damaged but legible — instead of erasing to the
    // block mean
    float ypix = dot(texture2D(u_tex0, v_texcoord).rgb, W);
    float q = mix(0.30, 0.015, u_x0);
    float det = ypix - ymean;
    float yq = ymean + floor(det / q + 0.5) * q;

    // mosquito noise: ripples along the block axes, scaled by the block's
    // own gradient so flat sky stays clean and edges buzz, flickering per
    // tick the way real ringing re-rolls with every re-encode
    float gx = dot(m10 + m11 - m00 - m01, W) * 0.5;
    float gy = dot(m01 + m11 - m00 - m10, W) * 0.5;
    float shimmer = 0.7 + 0.6 * (vh(cell + vec2(tick * 0.211, 0.5)) - 0.5);
    yq += (sw(sub.x * 3.0) * gx + sw(sub.y * 3.0) * gy)
          * (1.0 - u_x0) * 0.35 * shimmer;

    // chroma on its own coarser grid — one to three macroblocks per
    // chroma sample — quantised hard, so colour crosses block borders.
    // The tap is averaged with the block mean: a lone texel on line art
    // reads a stroke or the paper, never the area, and quantising that
    // splashes false saturated colour
    float cf = 1.0 + floor(u_x2 * 2.999);
    vec2 ccentre = (floor(cell / cf) + 0.5) * cf * bpx;
    vec3 cs = (texture2D(u_tex0, ccentre).rgb + meanc) * 0.5;
    float cy = dot(cs, W);
    vec2 cbcr = vec2(cs.b - cy, cs.r - cy);
    float cq = (0.02 + u_x2 * 0.20) * mix(1.6, 0.25, u_x0);
    cbcr = floor(cbcr / cq + 0.5) * cq;

    vec3 freshcol = vec3(yq + cbcr.y,
                         yq - 0.344 * cbcr.x - 0.714 * cbcr.y,
                         yq + cbcr.x);

    // ---- held path: no bits arrived, so show the reference picture.
    // With smear up, the stale block is dragged by a wrong motion vector
    // that re-rolls each tick — the moshy crawl of bad motion
    // compensation. The prediction is LEAKY: every rendered frame the
    // held block drifts toward the current decode, so error is bounded
    // no matter how long the block goes without bits — the shader
    // resamples the reference every frame, not once per tick, and
    // without this leak that compounding runs off to patterns of its own.
    vec2 mv = vec2(vh(cell + vec2(tick * 0.171, 0.3)),
                   vh(cell.yx + vec2(0.7, tick * 0.191))) - 0.5;
    vec3 held = texture2D(u_tex1, v_texcoord + mv * bpx * u_x3 * 0.5).rgb;
    held = mix(freshcol, held, mix(0.90, 0.70, u_x0));

    vec3 col = mix(held, freshcol, fresh);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
