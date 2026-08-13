// Fresh GLSL reimplementation of the EYESY mode "S - Mirror Grid".
// The original is Python + pygame: a stack of horizontal rules, plus two
// mirrored bar oscilloscopes -- one hanging down from the top edge, one
// standing up from the bottom -- each bar capped with a little square.
// Nothing is copied; this is a per-pixel fragment shader written from
// scratch for the same visual idea.
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
// x0 line + cap size, x1 grid density, x2 video blend
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
    float cols = 6.0 + floor(u_x1 * 40.0);
    float spx = 1.0 / cols;          // column pitch, width units
    float sp = spx * asp;            // same pitch in height units: square grid

    float lw = sp * (0.03 + u_x0 * 0.20);      // half line width
    float rs = sp * (0.05 + u_x0 * 0.40);      // cap square half size

    // the ruled horizontal lines
    float ry = uv.y / sp;
    float rule = step(abs(fract(ry + 0.5) - 0.5) * sp, lw);

    // one bar per column, mirrored: positive half hangs from the top edge,
    // negative half stands up from the bottom
    float ci = floor(uv.x * cols);
    float dxc = abs(uv.x - (ci + 0.5) * spx) * asp;
    float w = aud(ci * spx) * 1.5;
    w *= mix(1.0, 0.25 + vl * 1.8, vx);
    float lt = clamp(max(w, 0.0), 0.0, 0.98);
    float lb = clamp(max(-w, 0.0), 0.0, 0.98);

    float inCol = step(dxc, lw);
    float bars = max(inCol * step(1.0 - lt, uv.y), inCol * step(uv.y, lb));
    bars = max(bars, step(max(dxc, abs(uv.y - (1.0 - lt))), rs));
    bars = max(bars, step(max(dxc, abs(uv.y - lb)), rs));

    float m = max(rule, bars);
    float idx = mix(floor(ry), ci, step(0.5, bars));
    float hue = u_time * 0.06 + idx * 0.03;
    vec3 ink = mix(pal(hue), vid * 1.5, vx);
    vec3 bg = mix(pal(hue + 0.5) * 0.09, vid * 0.18, vx);
    gl_FragColor = vec4(mix(bg, ink, m), 1.0);
}
