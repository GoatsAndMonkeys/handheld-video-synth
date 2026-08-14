// Time posterized: the picture stops flowing and updates in slow ticks,
// like a flipboard at three frames a second. A quantized boundary sweeps
// the screen — only the stripe (or Bayer-ordered block) it is passing
// snaps to live video; everything else holds the previous output, so the
// frame becomes a patchwork of different past moments and the refresh
// visibly wipes across. Bass shoves the sweep forward, forcing an early
// tick on the hit.
// x0 tick rate, x1 sweep shape (wipe down / wipe across / blocks),
// x2 hold hardness — at 0 live video leaks through everywhere and the
// held regions only ghost; at 1 they freeze solid until their tick,
// x3 how many stripes or blocks the screen is dealt into
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform sampler2D u_dither;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;

void main() {
    float n = 4.0 + floor(u_x3 * 20.0);              // 4..24 cells
    float phase = u_time * (0.10 + u_x0 * 1.4) + u_a0 * 0.5;

    // each pixel's place in the refresh cycle, by shape: top-down wipe,
    // left-right wipe, or blocks dealt in the Bayer texture's order
    float cv = floor((1.0 - v_texcoord.y) * n) / n;
    float ch = floor(v_texcoord.x * n) / n;
    vec2 blk = floor(v_texcoord * vec2(n, n * 0.75)) + 0.5;
    float cb = texture2D(u_dither, blk / 4.0).r;
    float c = mix(cv, ch, step(0.3333, u_x1));
    c = mix(c, cb, step(0.6667, u_x1));

    // cycle time since this cell's last tick; fresh only inside the
    // window the boundary is currently writing
    float since = fract(phase - c);
    float fresh = 1.0 - step(1.0 / n, since);

    vec3 live = texture2D(u_tex0, v_texcoord).rgb;
    vec3 held = texture2D(u_tex1, v_texcoord).rgb;
    float w = max(fresh, (1.0 - u_x2) * 0.35);       // soft mode leaks live
    gl_FragColor = vec4(clamp(mix(held, live, w), 0.0, 1.0), 1.0);
}
