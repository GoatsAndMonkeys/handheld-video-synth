// ega16: everything squeezed through a 1984 graphics card. Ordered Bayer
// dither, then the sixteen EGA colours — three channel bits plus one
// shared intensity bit, brown fix and all — so the picture comes back in
// chunky DOS primaries with hatched shading between them.
// x0 pixel (chunk size), x1 dither, x2 level (drive into the palette)
//
// Ported to the HVS-80 GLES2 convention (single pass, 3 params) from the
// libretro slang-shaders collection, files dithering/shaders/bayer_4x4.slang
// (dither threshold + colour-depth reduction) and
// dithering/shaders/blue_noise.slang (its EGAPalette snap).
// Source: https://github.com/libretro/slang-shaders
//
// ---------------- original header, verbatim ----------------
//  gizmo98 bayer 4x4 dithering shader
//  Copyright (C) 2023 gizmo98
//
//    This program is free software; you can redistribute it and/or modify it
//    under the terms of the GNU General Public License as published by the Free
//    Software Foundation; either version 2 of the License, or (at your option)
//    any later version.
//
//  version 0.1, 16.05.2023
//
//  https://github.com/gizmo98/gizmo-crt-shader
// -----------------------------------------------------------
//
// Changes made in the port: Vulkan UBO/push-constant plumbing and the
// vertex stage dropped; the computed Bayer matrix replaced by this
// project's supplied 4x4 u_dither texture (same matrix, one fetch); the
// original's EGA snap — a ~30-branch chain of vec3 equality tests — is
// reimplemented algorithmically from the same palette, because that many
// compares per pixel does not fit the Pi Zero 2W's budget; a chunky-pixel
// grid and a level knob added. 2 texture fetches.
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_dither;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

void main() {
    float n = mix(320.0, 56.0, u_x0);
    vec2 grid = vec2(n, n * u_resolution.y / u_resolution.x);
    vec2 cell = floor(v_texcoord * grid);
    vec3 col = texture2D(u_tex0, (cell + 0.5) / grid).rgb;

    // gizmo98's threshold: (bayer - 0.5) * (multiplier + tune) / 255
    float bayer = texture2D(u_dither, cell / 4.0).r;
    col += (bayer - 0.5) * (16.0 + u_x1 * 110.0) / 255.0;

    // drive the picture up or down through the palette's steps
    col += (u_x2 - 0.5) * 0.6;

    // EGA 16: channels sit on {0, 1/3, 2/3, 1}; the low pair and the high
    // pair are told apart by one intensity bit shared by all three
    vec3 bits = step(vec3(0.5), col);
    vec3 vote = step(bits * 0.6667 + 0.1667, col);
    float bright = max(max(vote.r, vote.g), vote.b);

    vec3 dark = bits * 0.6667;
    vec3 lite = bits + (1.0 - bits) * 0.3333;
    vec3 ega = mix(dark, lite, bright);

    // and the brown fix: dark yellow is brown on a real EGA card
    ega.g -= 0.3333 * bits.r * bits.g * (1.0 - bits.b) * (1.0 - bright);

    gl_FragColor = vec4(ega, 1.0);
}
