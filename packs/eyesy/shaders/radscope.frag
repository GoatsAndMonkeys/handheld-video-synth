// Fresh GLSL reimplementation of the EYESY mode
// "S - Radial Scope - Rotate Uniform Color".
// The original is Python + pygame: 75 spokes fired from the screen centre,
// each one's length a sample of the audio buffer, with a dot on the tip and
// the whole star slowly rotating.  Nothing is copied; this is a per-pixel
// fragment shader written from scratch for the same visual idea.
//
// Original mode: https://github.com/critterandguitari/EYESY_Modes_OSv3
// EYESY OS:      https://github.com/critterandguitari/EYESY_OS
//
// Copyright (c) 2025, Owen Osborn, Critter & Guitari, Inc.
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice,
//    this list of conditions and the following disclaimer.
//
// 2. Redistributions in binary form must reproduce the above copyright
//    notice, this list of conditions and the following disclaimer in the
//    documentation and/or other materials provided with the distribution.
//
// 3. Neither the name of the copyright holder nor the names of its
//    contributors may be used to endorse or promote products derived from
//    this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.
//
// x0 scope diameter, x1 spoke count / weight, x2 video blend
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_a0;
uniform float u_a1;
uniform float u_a2;

float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }

vec3 pal(float h) {
    return 0.5 + 0.5 * vec3(sw(h), sw(h + 0.333), sw(h + 0.667));
}

float aud(float s) {
    return (sw(s * 2.0 + u_time * 0.31) * (0.30 + u_a0 * 1.7)
          + sw(s * 6.0 - u_time * 0.53) * (0.17 + u_a2 * 1.3)
          + sw(s * 11.0 + u_time * 0.19) * 0.11)
         * (0.55 + u_a1 * 1.0);
}

void main() {
    vec2 uv = v_texcoord;
    vec3 vid = texture2D(u_tex0, uv).rgb;
    float vl = dot(vid, vec3(0.299, 0.587, 0.114));
    float vx = u_x2;

    float asp = u_resolution.x / u_resolution.y;
    vec2 p = uv - 0.5;
    p.x *= asp;
    float r = length(p);
    float a = atan(p.y, p.x) * 0.1591549 + 0.5;      // turns, 0..1

    float n = 16.0 + floor(u_x1 * 56.0);             // spokes
    float ang = fract(a + u_time * 0.03 + u_a0 * 0.3);   // it spins, bass shoves
    float si = floor(ang * n);
    float da = (ang - (si + 0.5) / n) * 6.2831853;
    float d = r * abs(da);                           // distance across the spoke

    float rr = (0.09 + u_x0 * 0.34) + aud(si / n) * 0.24;
    rr *= mix(1.0, 0.25 + vl * 1.8, vx);             // video drives the reach
    float lw = 0.0035 + 0.010 * (1.0 - u_x1);        // half line width
    float dr = lw * 2.2;                             // tip dot radius

    float line = step(d, lw) * step(r, rr);
    float dd = d * d + (r - rr) * (r - rr);
    float m = max(line, step(dd, dr * dr));

    float hue = u_time * 0.07 + si * 0.012;
    vec3 ink = mix(pal(hue), vid * 1.5, vx);
    vec3 bg = mix(pal(u_time * 0.07 + 0.5) * 0.09, vid * 0.18, vx);
    gl_FragColor = vec4(mix(bg, ink, m), 1.0);
}
