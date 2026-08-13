/*
Ported from https://github.com/glslify/glsl-hash-blur

The MIT License (MIT)

Copyright (c) 2015 Matt DesLauriers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
OR OTHER DEALINGS IN THE SOFTWARE.

ported to RetroArch's glsl format by Aytos with some light changes by hunterk
*/
// Source: libretro/glsl-shaders, blurs/shaders/hash-blur.glsl
// Ported to the HVS-80 shader convention (single pass, GLES2, 3 params).
// A blur that samples a random scatter of taps per pixel instead of a kernel,
// so it smears without ever looking like a Gaussian - the grain stays in it.
// Thirteen dynamic-loop iterations become four unrolled taps, and the
// original's per-tap sin/cos pair becomes one sin/cos for a random base angle
// with the other three taps at 90 degree rotations of it (a free swap), which
// keeps the scatter random per pixel at a fraction of the arithmetic. Radii
// still come off the original's fract() hash chain, still through sqrt() so
// the disc fills evenly. The vignette is made symmetric about the centre;
// upstream's leans into one corner.
// x0 blur (radius), x1 edge (centre kept sharp), x2 boil (noise re-rolls)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

// original hash, unchanged
float random(vec2 co) {
    float a = 12.9898;
    float b = 78.233;
    float c = 43758.5453;
    float dt = dot(co.xy, vec2(a, b));
    float sn = mod(dt, 3.14);
    return fract(sin(sn) * c);
}

void main() {
    const float TAU = 6.28318530718;

    // original: jitter the noise, but only on a tick, not every frame
    float jitter = mod(floor(u_time * 20.0 * u_x2) * 382.0231, 21.321);

    // vignette blur: sharp in the middle, soft at the rim
    vec2 d = v_texcoord - 0.5;
    float vig = mix(1.0, smoothstep(0.0, 0.45, dot(d, d) * 2.0), u_x1);
    float radius = u_x0 * 26.0 * vig;

    vec2 r = vec2(random(v_texcoord + jitter));
    r = fract(r * vec2(12.9898, 78.233));
    float ang = r.y * TAU;
    vec2 dir = vec2(sin(ang), cos(ang));       // original: mult()'s direction
    vec2 perp = vec2(-dir.y, dir.x);
    vec2 px = radius / u_resolution;

    // four taps on the random cross, each at its own hashed radius
    float r0 = sqrt(r.x + 0.001);
    r = fract(r * vec2(12.9898, 78.233));
    float r1 = sqrt(r.x + 0.001);
    r = fract(r * vec2(12.9898, 78.233));
    float r2 = sqrt(r.x + 0.001);
    r = fract(r * vec2(12.9898, 78.233));
    float r3 = sqrt(r.x + 0.001);

    vec3 acc = texture2D(u_tex0, v_texcoord + dir * px * r0).rgb;
    acc += texture2D(u_tex0, v_texcoord + perp * px * r1).rgb;
    acc += texture2D(u_tex0, v_texcoord - dir * px * r2).rgb;
    acc += texture2D(u_tex0, v_texcoord - perp * px * r3).rgb;

    gl_FragColor = vec4(acc * 0.25, 1.0);
}
