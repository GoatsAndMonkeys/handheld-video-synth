// A real JPEG, not an impression of one: a genuine discrete cosine
// transform, quantised against the standard JPEG tables, transformed back.
// The blocking and the ringing fall out of the arithmetic rather than being
// drawn on, which is why they sit on the cosine basis the way an encoder's
// artefacts do and a hand-rolled approximation's never quite do.
//
// JPEG uses 8x8. That needs 64 taps and some four thousand multiply-adds a
// pixel, which this GPU will not carry at 640x480, so this works 4x4 — the
// same transform an octave finer, at 16 taps. Entropy coding is skipped
// because it is lossless: it costs bytes, not picture.
//
// Chroma is averaged over 2x2 quadrants and quantised hard, which is what
// 4:2:0 subsampling actually does, so colour bleeds across edges on its own
// coarser grid.
//
// x0 quality, x1 block size, x2 colour, x3 ring
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

// 4-point DCT-II, orthonormal. Constant at a fixed block size, so there is
// no cos() at runtime — which matters on a chip with no hardware trig.
const mat4 M = mat4(vec4(0.5,  0.65328,  0.5,  0.27060),
                    vec4(0.5,  0.27060, -0.5, -0.65328),
                    vec4(0.5, -0.27060, -0.5,  0.65328),
                    vec4(0.5, -0.65328,  0.5, -0.27060));
const mat4 MT = mat4(vec4(0.5,  0.5,      0.5,  0.5),
                     vec4(0.65328, 0.27060, -0.27060, -0.65328),
                     vec4(0.5, -0.5,     -0.5,  0.5),
                     vec4(0.27060, -0.65328, 0.65328, -0.27060));

// the luminance quantisation table from the JPEG spec, top-left 4x4
const mat4 QY = mat4(vec4(16.0, 12.0, 14.0, 14.0),
                     vec4(11.0, 12.0, 13.0, 17.0),
                     vec4(10.0, 14.0, 16.0, 22.0),
                     vec4(16.0, 19.0, 24.0, 29.0));

// pick a basis vector by position without indexing: GLSL ES 1.00 will not
// let a mat4 be subscripted by anything but a constant
vec4 basis(float x) {
    return mix(mix(vec4(0.5,  0.65328,  0.5,  0.27060),
                   vec4(0.5,  0.27060, -0.5, -0.65328), step(0.5, x)),
               mix(vec4(0.5, -0.27060, -0.5,  0.65328),
                   vec4(0.5, -0.65328,  0.5, -0.27060), step(2.5, x)),
               step(1.5, x));
}

vec4 deadzone(vec4 f, vec4 q) {
    // round toward zero through a dead zone, as a real quantiser does:
    // everything under one step is thrown away outright, and that is what
    // empties a block down to its flat DC term
    return sign(f) * floor(abs(f) / q + 0.5) * q;
}

void main() {
    vec2 res = u_resolution;
    float bs = floor(4.0 + u_x1 * 28.0);        // block edge, screen pixels
    vec2 g = v_texcoord * res / bs;
    vec2 cell = floor(g);
    vec2 sub = floor(fract(g) * 4.0);           // this pixel within the block
    vec2 o = bs / res * 0.25;
    vec2 base = cell * bs / res + o * 0.5;

    vec3 W = vec3(0.299, 0.587, 0.114);
    vec3 s00 = texture2D(u_tex0, base + o * vec2(0.0, 0.0)).rgb;
    vec3 s10 = texture2D(u_tex0, base + o * vec2(1.0, 0.0)).rgb;
    vec3 s20 = texture2D(u_tex0, base + o * vec2(2.0, 0.0)).rgb;
    vec3 s30 = texture2D(u_tex0, base + o * vec2(3.0, 0.0)).rgb;
    vec3 s01 = texture2D(u_tex0, base + o * vec2(0.0, 1.0)).rgb;
    vec3 s11 = texture2D(u_tex0, base + o * vec2(1.0, 1.0)).rgb;
    vec3 s21 = texture2D(u_tex0, base + o * vec2(2.0, 1.0)).rgb;
    vec3 s31 = texture2D(u_tex0, base + o * vec2(3.0, 1.0)).rgb;
    vec3 s02 = texture2D(u_tex0, base + o * vec2(0.0, 2.0)).rgb;
    vec3 s12 = texture2D(u_tex0, base + o * vec2(1.0, 2.0)).rgb;
    vec3 s22 = texture2D(u_tex0, base + o * vec2(2.0, 2.0)).rgb;
    vec3 s32 = texture2D(u_tex0, base + o * vec2(3.0, 2.0)).rgb;
    vec3 s03 = texture2D(u_tex0, base + o * vec2(0.0, 3.0)).rgb;
    vec3 s13 = texture2D(u_tex0, base + o * vec2(1.0, 3.0)).rgb;
    vec3 s23 = texture2D(u_tex0, base + o * vec2(2.0, 3.0)).rgb;
    vec3 s33 = texture2D(u_tex0, base + o * vec2(3.0, 3.0)).rgb;

    // luma block, centred about zero the way an encoder levels it
    mat4 P = mat4(vec4(dot(s00, W), dot(s01, W), dot(s02, W), dot(s03, W)),
                  vec4(dot(s10, W), dot(s11, W), dot(s12, W), dot(s13, W)),
                  vec4(dot(s20, W), dot(s21, W), dot(s22, W), dot(s23, W)),
                  vec4(dot(s30, W), dot(s31, W), dot(s32, W), dot(s33, W)));
    P[0] -= 0.5; P[1] -= 0.5; P[2] -= 0.5; P[3] -= 0.5;

    mat4 F = M * P * MT;

    // quality drives the step; ring spares the high-frequency terms, which
    // is where the halo along hard edges comes from
    float q = (0.006 + u_x0 * u_x0 * 0.20);
    float hf = mix(1.0, 0.18, u_x3);
    mat4 Q = QY;
    Q[0] *= q; Q[1] *= q * mix(1.0, hf, 0.33);
    Q[2] *= q * mix(1.0, hf, 0.66); Q[3] *= q * hf;
    F[0] = deadzone(F[0], Q[0]);
    F[1] = deadzone(F[1], Q[1]);
    F[2] = deadzone(F[2], Q[2]);
    F[3] = deadzone(F[3], Q[3]);

    float y = dot(basis(sub.y), F * basis(sub.x)) + 0.5;

    // chroma on its own coarser grid: the 2x2 quadrant this pixel falls in,
    // quantised hard enough to march across edges
    vec2 quad = step(2.0, sub);
    vec3 a = mix(mix(s00 + s10 + s01 + s11, s20 + s30 + s21 + s31, quad.x),
                 mix(s02 + s12 + s03 + s13, s22 + s32 + s23 + s33, quad.x),
                 quad.y) * 0.25;
    float ay = dot(a, W);
    vec2 cbcr = vec2(a.b - ay, a.r - ay);
    float cq = 0.02 + u_x2 * 0.5;
    cbcr = floor(cbcr / cq + 0.5) * cq;

    vec3 rgb = vec3(y + cbcr.y, y - 0.344 * cbcr.x - 0.714 * cbcr.y,
                    y + cbcr.x);
    gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), 1.0);
}
