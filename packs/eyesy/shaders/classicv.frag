// Fresh GLSL reimplementation of the EYESY mode "S - Classic Vertical".
// The original is Python + pygame: 100 stacked rows, each drawing a line
// out from the screen centre whose length is one audio sample, with a ball
// on the end.  Nothing is copied -- this is a per-pixel fragment shader
// written from scratch for the same visual idea.
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
// x0 scope width, x1 line + ball size, x2 video blend
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

// cheap stand-in for a sine of period 1, range -1..1 (no trig on VideoCore)
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }

// palette wheel, replaces EYESY's color_picker
vec3 pal(float h) {
    return 0.5 + 0.5 * vec3(sw(h), sw(h + 0.333), sw(h + 0.667));
}

// stands in for EYESY's audio_in[] buffer, s = 0..1 along the buffer.
// bass/level/highs shape it; u_time keeps it alive when nothing is playing.
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

    const float rows = 64.0;
    const float sp = 1.0 / rows;              // row spacing, height units
    float ri = floor(uv.y * rows);
    float yc = (ri + 0.5) * sp;

    // one "sample" per row, swung out from the centre line
    float w = aud(ri * sp) * (0.08 + u_x0 * 0.85);
    w *= mix(1.0, 0.25 + vl * 1.8, vx);      // video keys the trace length
    float xe = 0.5 + w;

    float asp = u_resolution.x / u_resolution.y;
    float dy = uv.y - yc;
    float dx = (uv.x - xe) * asp;

    float hw = sp * (0.06 + u_x1 * 0.30);                // half line width
    float line = step(abs(dy), hw)
               * step(min(0.5, xe), uv.x) * step(uv.x, max(0.5, xe));
    float br = sp * (0.12 + u_x1 * 0.70);                // ball radius
    float ball = step(dx * dx + dy * dy, br * br);
    float m = max(line, ball);

    float hue = u_time * 0.05 + ri * 0.005;
    vec3 ink = mix(pal(hue), vid * 1.5, vx);
    vec3 bg = mix(pal(hue + 0.5) * 0.10, vid * 0.18, vx);
    gl_FragColor = vec4(mix(bg, ink, m), 1.0);
}
