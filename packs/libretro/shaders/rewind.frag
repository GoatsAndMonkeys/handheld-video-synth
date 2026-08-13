/*
    Braid Rewind
    Authors: hunterk, cgwg

    This program is free software; you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by the Free
    Software Foundation; either version 2 of the License, or (at your option)
    any later version.
*/
// Source: libretro/common-shaders, motionblur/shaders/braid-rewind.cg
// Ported to the HVS-80 shader convention (single pass, GLES2, 3 params).
// The original averages the last seven emulator frames, folds that average
// half-and-half into the live frame and multiplies by a sepia constant, but
// only while the emulator is running time backwards. We have no reverse gear,
// so the rewind is always on and its depth is played: u_tex2 is the engine's
// delay-ring tap (its reach already follows x0) and u_tex3 the half-depth tap,
// so the seven-frame history becomes three samples spread across ~a second -
// a longer, looser smear than the original could reach, in four fetches.
// x0 past (how far back / how much), x1 sepia (the tint), x2 trail (short<->long)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output frame
uniform sampler2D u_tex2;   // delay-ring tap, depth follows x0
uniform sampler2D u_tex3;   // half-depth tap
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    const vec3 SEPIA = vec3(1.0, 0.8, 0.6);     // original: float4(1.0,0.8,0.6,1.0)

    vec3 cur = texture2D(u_tex0, v_texcoord).rgb;
    vec3 p1 = texture2D(u_tex1, v_texcoord).rgb;
    vec3 p2 = texture2D(u_tex2, v_texcoord).rgb;
    vec3 p3 = texture2D(u_tex3, v_texcoord).rgb;

    // short rewind stays near the live frame, long rewind reaches the deep tap
    vec3 past = mix(0.5 * (p1 + p3), 0.5 * (p3 + p2), u_x2);

    // original: (current + history_average) / 2
    vec3 mixed = 0.5 * (cur + past);
    vec3 outc = mix(cur, mixed, min(1.0, u_x0 * 1.6));

    // original multiplies by sepia; turned all the way up it bleaches to
    // a straight sepia print, which is where the "old film" reads
    vec3 tint = mix(outc * SEPIA, dot(outc, W) * SEPIA * 1.15, max(0.0, u_x1 * 2.0 - 1.0));
    outc = mix(outc, tint, min(1.0, u_x1 * 2.0));

    gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
