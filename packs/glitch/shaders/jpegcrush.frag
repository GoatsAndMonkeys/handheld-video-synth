// jpeg crush: the picture forced through an encoder with the quality
// slider on the floor. luma collapses block by block onto the coefficient
// grid until each block is left holding one flat level, chroma is carried
// on a coarser grid still so colour bleeds past every edge onto the wrong
// side of it, and the coefficients thrown away on the way out ring back
// round the contrast as mosquito noise.
// x0 crush (quality, clean -> destroyed), x1 block size, x2 ring,
// x3 bias (what the encoder decides to give away — at the bottom the
// luma is left alone and only colour is thrown out, at 0.5 both go as
// built, at the top the colour survives intact over flattened blocks)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);

    // the coefficient grid, and the coarser one chroma rides — colour
    // resolution is always the first thing an encoder gives away
    vec2 grid = max(u_resolution / (6.0 + u_x1 * 26.0), vec2(2.0));
    vec2 bstep = 1.0 / grid;   // one block, in texcoords
    float sub = 1.5 + u_x0 * 2.5;
    vec2 g = v_texcoord * grid;
    vec2 cell = floor(g);
    vec2 ccell = floor(g / sub);

    // three taps and no more: this pixel, its block, its chroma block
    vec3 pix = texture2D(u_tex0, v_texcoord).rgb;
    vec3 blk = texture2D(u_tex0, (cell + 0.5) * bstep).rgb;
    vec3 chb = texture2D(u_tex0, (ccell + 0.5) * sub * bstep).rgb;

    float yp = dot(pix, W);
    float yb = dot(blk, W);
    float res = yp - yb;             // everything above dc in this block

    // dead-zone quantiser: the step grows until every coefficient under
    // it is thrown away outright and the block is left flat, holding a dc
    // term that got posterized on its own way past
    float qs = 0.02 + u_x0 * u_x0 * 0.85;
    float lv = mix(96.0, 10.0, u_x0);
    float rq = sign(res) * floor(abs(res) / qs) * qs;
    float dc = floor(yb * lv + 0.5) / lv;

    // mosquito noise: what was truncated ripples back in on the block's
    // own axes, loudest where the block was hiding a hard edge, and the
    // edge that did survive overshoots on both sides of itself
    vec2 t = abs(g - cell - 0.5);
    float y = dc + rq + ((t.x + t.y - 0.5) * abs(res) * 1.4 + rq * 0.4)
                        * u_x2 * (0.35 + u_x0 * 0.5);
    y = mix(yp, y, min(1.0, u_x3 * 2.0));

    // colour difference off the coarse grid, quantised far harder than
    // luma ever is — at the bottom of the range it lands on the wrong
    // colour entirely and holds it across whole runs of blocks
    float cl = mix(16.0, 2.0, u_x0);
    vec3 ch = mix(pix - yp, chb - dot(chb, W), min(1.0, 0.3 + u_x0 * 1.6));
    ch = mix(pix - yp, floor(ch * cl + 0.5) / cl, min(1.0, 2.0 - u_x3 * 2.0));

    gl_FragColor = vec4(clamp(vec3(y) + ch, 0.0, 1.0), 1.0);
}
