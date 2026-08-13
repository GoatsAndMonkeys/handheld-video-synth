/*
   Author: Themaister
   License: Public domain
*/
// Source: libretro/common-shaders, neon/shaders/neon-variation-1.cg
// Ported to the HVS-80 shader convention (single pass, GLES2, 3 params).
// The original samples a 3x3 ring at half-texel offsets, builds two estimates
// of the same point - one bilinear across the corners, one across the edge
// midpoints - and returns a dim average plus 4.7x the difference between them.
// That difference is zero on flat colour and huge on any edge, which is what
// draws the tube. Nine fetches will not fit the Pi, so the two estimates come
// from the two diagonal pairs instead (four fetches): they also agree on a
// smooth gradient and disagree at every corner and line, so the neon survives.
// x0 glow (edge gain), x1 base (how much picture stays under the tubes),
// x2 width (tap spacing = line thickness)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

void main() {
    vec2 d = (0.5 + 3.5 * u_x2) / u_resolution;

    vec3 c00 = texture2D(u_tex0, v_texcoord + vec2(-d.x, -d.y)).rgb;
    vec3 c22 = texture2D(u_tex0, v_texcoord + vec2( d.x,  d.y)).rgb;
    vec3 c02 = texture2D(u_tex0, v_texcoord + vec2(-d.x,  d.y)).rgb;
    vec3 c20 = texture2D(u_tex0, v_texcoord + vec2( d.x, -d.y)).rgb;

    vec3 res = 0.5 * (c00 + c22);        // one estimate of the centre
    vec3 mid = 0.5 * (c02 + c20);        // the other one

    // original: 0.28 * (three estimates) + 4.7 * abs(difference)
    vec3 base = 0.84 * (0.5 * (res + mid)) * u_x1;
    vec3 tube = (0.5 + 7.5 * u_x0) * abs(res - mid);

    gl_FragColor = vec4(clamp(base + tube, 0.0, 1.0), 1.0);
}
