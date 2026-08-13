// Fresh GLSL reimplementation of the EYESY mode "S - Concentric".
// The original is Python + pygame: ten filled circles stacked on a drifting
// centre, each radius scaled by its own audio sample and each drawn in the
// next colour off the wheel, so the pile reads as a pumping bullseye.
// Nothing is copied; this is a per-pixel fragment shader written from
// scratch for the same visual idea -- the painter's-algorithm pile becomes
// an analytic ring index.
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
// x0 ring pitch, x1 colour step per ring, x2 video blend
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
    // the original creeps its centre a third of a pixel per circle; here the
    // whole pile drifts slowly so it never sits still
    p -= vec2(0.11 * sw(u_time * 0.037), 0.08 * sw(u_time * 0.029 + 0.25));
    float r = length(p);

    // ring spacing breathes on the bass; the audio buffer also wobbles the
    // radii so the rings are never perfectly even
    float pitch = (0.014 + u_x0 * 0.11) * (0.70 + u_a0 * 1.3 + 0.25 * sw(u_time * 0.11));
    pitch *= mix(1.0, 0.40 + vl * 1.3, vx);      // dark video packs the rings in
    pitch = max(pitch, 0.006);

    float rb = (r - aud(r * 2.0) * 0.055) / pitch;
    float band = floor(rb);
    float edge = step(0.86, fract(rb));           // the drawn circle's rim

    float hue = u_time * 0.05 + band * (0.02 + u_x1 * 0.22);
    vec3 col = pal(hue) * (1.0 - 0.55 * edge);
    col *= mix(vec3(1.0), vid * 2.2, vx);         // bullseye colours the video
    gl_FragColor = vec4(col, 1.0);
}
