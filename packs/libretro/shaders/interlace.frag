/*
   Interlacing
   Author: hunterk
   License: Public domain

   Note: This shader is designed to work with the typical interlaced output from an emulator, which displays both even and odd fields twice.
   This shader will un-weave the image, resulting in a standard, alternating-field interlacing.
*/
// Source: libretro/common-shaders, misc/interlacing.cg
// Ported to the HVS-80 shader convention (single pass, GLES2, 3 params).
// The un-weave and the per-frame field flip are kept; the emulator's
// frame_count becomes u_time, and force_240p becomes a continuous field rate
// (at 0 the field is frozen, giving the static 240p look the original's
// force_240p produced). Lines that do not belong to the live field pull from
// their neighbour and are darkened by the original's `percent`, which is
// what puts the comb teeth on vertical detail.
// x0 lines (field pitch), x1 dark (off-field level), x2 rate (field flip)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

void main() {
    float lines = floor(mix(60.0, 300.0, u_x0 * u_x0)) * 2.0;
    float percent = 1.0 - u_x1;          // original: scanline bright %

    // original: y = texture_size.y * texCoord.y + frame_count + top_field_first
    float field = floor(u_time * floor(mix(0.0, 60.0, u_x2)));
    float y = v_texcoord.y * lines + field;

    // fmod(y, 2.0) > 0.99999 -> this line belongs to the live field
    float live = step(1.0, mod(floor(y), 2.0));

    // un-weave: the dead field's lines are the *other* moment's lines, so pull
    // them from the neighbouring row - that is what combs vertical edges
    vec2 uv = v_texcoord;
    uv.y += (1.0 - live) / lines;

    vec3 res = texture2D(u_tex0, uv).rgb;

    gl_FragColor = vec4(res * mix(percent, 1.0, live), 1.0);
}
