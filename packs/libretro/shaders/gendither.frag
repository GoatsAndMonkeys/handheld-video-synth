// gendither: leilei's Genesis dither — a 16-bit console's colour ladder
// with the composite jailbars still on it. Columns of the picture get
// nudged up or down before the quantiser sees them, so the bands break
// into vertical hatching instead of hard edges, and the cap keeps the
// highlights off full white the way the real machine did.
// x0 steps (levels per channel), x1 bars (jailbar strength), x2 cap
//
// Ported to the HVS-80 GLES2 convention (single pass, 3 params) from the
// libretro slang-shaders collection, file dithering/shaders/gendither.slang.
// Source: https://github.com/libretro/slang-shaders
//
// ---------------- original header, verbatim ----------------
// Gendither
//
//     Copyright (C) 2013-2014 leilei
//  adapted for slang format by hunterk
//
// This program is free software; you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation; either version 2 of the License, or (at your option)
// any later version.
// -----------------------------------------------------------
//
// Changes made in the port: Vulkan UBO/push-constant plumbing and the
// vertex stage dropped; the ivec3 maths, the 16-entry int lookup table and
// the loop that walks it are gone (no integer ops or dynamic loops in
// GLES2) — the table is a jailbar pattern, {0,1} on even columns and
// {16,15} on odd ones, so it is computed straight from the column and row
// parities instead; the `int(final.rgb) * 224` term, which is zero for
// every colour below full scale, is dropped; the fixed radooct (4.4) and
// brightness cap (0.875) became knobs; the pattern is laid out on a
// 320-wide grid so a bar survives being scaled up to the panel.
// 1 texture fetch.
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

void main() {
    vec3 final = texture2D(u_tex0, v_texcoord).rgb;

    // leilei's lazy jailbar table, read off the column/row parities
    vec2 ditheu = v_texcoord * u_resolution * 0.5;
    float odd = mod(floor(ditheu.x), 2.0);
    float yp  = mod(floor(ditheu.y), 2.0);
    float ohyes = mix(yp, 16.0 - yp, odd);

    float bars = 1.0 + u_x1 * 5.0;
    final += ohyes * bars * 0.003921568627451;   // "divide by 255"

    // reduce colour depth
    float radooct = 2.0 + floor(u_x0 * 7.0);     // original: 4.4
    vec3 reduceme = floor(final * radooct) / radooct;

    // brightness cap
    float cap = 1.0 - u_x2 * 0.45;               // original: 0.875
    gl_FragColor = vec4(clamp(reduceme, vec3(0.0), vec3(cap)), 1.0);
}
