// Tilerep: tile the frame into a grid with per-row offset — hydra's
// repeat(x, y, offsetX, offsetY) (Olivia Jack's browser video synth),
// reimplemented from scratch. Alternate tiles are mirrored (the fract /
// one-minus-fract fold) so every tile edge meets its neighbour's edge —
// no hard cuts anywhere inside the grid, which is exactly hydra repeat's
// continuous feel; the folded coordinate never leaves 0..1 either, so the
// drifting grid cannot smear the border.
// x0 tiles across (1..8), x1 tiles down (1..8), x2 row shear — at half,
// alternating rows sit half a tile over, brick-wall style — x3 scroll:
// the whole tiling drifts diagonally. Overall level nudges the shear so
// the grid breathes with the music.
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a1;

void main() {
    float nx = floor(1.0 + u_x0 * 7.999);
    float ny = floor(1.0 + u_x1 * 7.999);

    vec2 q = v_texcoord * vec2(nx, ny);

    // the whole tiling drifts; the off-ratio vertical rate keeps the
    // motion from reading as a straight loop
    float drift = u_time * u_x3 * 0.20;
    q += vec2(drift, drift * 0.37);

    // each row slides over by shear tiles per row: 0 is a straight grid,
    // half is brickwork, and the sound leans on it a little
    q.x += floor(q.y) * (u_x2 + u_a1 * 0.12);

    // mirrored repeat: even tiles read the frame forward, odd tiles read
    // it reflected, so seams always join
    vec2 s = 1.0 - abs(1.0 - 2.0 * fract(q * 0.5));

    gl_FragColor = vec4(texture2D(u_tex0, s).rgb, 1.0);
}
