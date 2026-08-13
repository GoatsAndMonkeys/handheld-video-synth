// colormangle: a colour desk. Each channel is fed a dose of its
// neighbour, so at low settings the picture just bleeds warm or cool and
// at the top the channels have swapped places entirely — skies go red,
// skin goes green. Saturation and contrast ride on top.
// x0 bleed (channel crosstalk), x1 sat, x2 cntrst
//
// Ported to the HVS-80 GLES2 convention (single pass, 3 params) from the
// libretro slang-shaders collection, file misc/shaders/color-mangler.slang.
// Source: https://github.com/libretro/slang-shaders
//
// ---------------- original header, verbatim ----------------
//    Color Mangler
//    Author: hunterk
//    License: Public domain
// -----------------------------------------------------------
//
// Changes made in the port: Vulkan UBO/push-constant plumbing and the
// vertex stage dropped; the original's 16-entry colour matrix reduced to
// the cyclic crosstalk it is most expressive at (diagonal 1-k, one
// off-diagonal k), driven from one knob; its per-channel gamma boost
// dropped; pow(c, 2.2) / pow(c, 1/2.2) replaced with c*c and sqrt(c),
// which is close enough at 640x480 and far cheaper on VideoCore IV.
// 1 texture fetch.
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

void main() {
    vec3 screen = texture2D(u_tex0, v_texcoord).rgb;
    screen = screen * screen;               // to (roughly) linear light

    // contrast about mid grey, as in the original's avglum mix
    screen = mix(vec3(0.5), screen, u_x2 * 2.0);
    screen = clamp(screen, 0.0, 1.0);

    // the colour matrix: r <- b, g <- r, b <- g
    float k = u_x0;
    vec3 color = vec3(screen.r * (1.0 - k) + screen.b * k,
                      screen.g * (1.0 - k) + screen.r * k,
                      screen.b * (1.0 - k) + screen.g * k);

    // saturation, on the original's Rec.709 weights
    float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(lum), color, u_x1 * 2.0);

    gl_FragColor = vec4(sqrt(clamp(color, 0.0, 1.0)), 1.0);
}
