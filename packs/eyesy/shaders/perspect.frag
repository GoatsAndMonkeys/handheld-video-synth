// Fresh GLSL reimplementation of the EYESY mode "S - Perspective Lines".
// The original is Python + pygame: fifty line segments fanned from one
// movable vanishing point out to a row of dots whose heights trace the audio
// buffer across the screen.  Nothing is copied; this is a per-pixel fragment
// shader written from scratch for the same visual idea -- the fan is solved
// backwards, each pixel finding the spoke it belongs to.
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
// x0 vanishing point, x1 line + dot weight, x2 video blend
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
    vec2 p = vec2(uv.x * asp, uv.y);
    const float n = 40.0;

    // vanishing point: swept sideways by the knob, floated by the clock
    vec2 vp = vec2((0.5 + (u_x0 - 0.5) * 1.7) * asp,
                   0.5 + 0.30 * sw(u_time * 0.043) + u_a1 * 0.10);

    // which spoke owns this pixel: cross the ray vp->p with the horizon
    float den = p.y - vp.y;
    den += (step(0.0, den) * 2.0 - 1.0) * 0.0015;    // never divide by zero
    float xc = (vp.x + ((0.5 - vp.y) / den) * (p.x - vp.x)) / asp;
    float amp = 0.42 * mix(1.0, 0.25 + vl * 1.8, vx);

    float m = 0.0;
    float idx = 0.0;
    // the traced ends wander off the horizon, so a pixel's true spoke may be
    // a neighbour of the crossing estimate -- test three and keep the best
    for (int k = 0; k < 3; k++) {
        float i = floor(clamp(xc, -0.2, 1.2) * n) + float(k) - 1.0;
        vec2 e = vec2(((i + 0.5) / n) * asp, 0.5 + aud(i / n) * amp);
        vec2 ev = e - vp;
        vec2 pv = p - vp;
        float l2 = max(dot(ev, ev), 1e-5);
        float s = dot(pv, ev) / l2;
        float cr = abs(pv.x * ev.y - pv.y * ev.x) * inversesqrt(l2);
        float lw = 0.0015 + u_x1 * 0.010;
        float hit = step(cr, lw) * step(0.0, s) * step(s, 1.0);
        vec2 de = p - e;
        float dr = lw * 1.8 + 0.004;
        hit = max(hit, step(dot(de, de), dr * dr));
        idx = mix(idx, i, step(m, hit) * hit);
        m = max(m, hit);
    }

    float hue = u_time * 0.05 + idx * 0.02;
    vec3 ink = mix(pal(hue), vid * 1.5, vx);
    vec3 bg = mix(pal(hue + 0.5) * 0.09, vid * 0.18, vx);
    gl_FragColor = vec4(mix(bg, ink, m), 1.0);
}
