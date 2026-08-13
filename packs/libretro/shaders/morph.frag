/*
   Hyllian's dilation-fast Shader

   Copyright (C) 2011-2015 Hyllian - sergiogdb@gmail.com

   Permission is hereby granted, free of charge, to any person obtaining a copy
   of this software and associated documentation files (the "Software"), to deal
   in the Software without restriction, including without limitation the rights
   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   copies of the Software, and to permit persons to whom the Software is
   furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in
   all copies or substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
   THE SOFTWARE.
*/
// Source: libretro/common-shaders, warp/shaders/dilation-fast.cg
//         (erosion half from warp/shaders/erosion-fast.cg, same author/licence)
// Ported to the HVS-80 shader convention (single pass, GLES2, 3 params).
// Dilation is max() over the neighbourhood, erosion is min() - bright shapes
// swell and swallow the dark, or the dark eats them. The originals walk the
// four orthogonal neighbours at one texel; here the four taps sit on a circle
// whose radius is a performance param, because morphology only becomes a LOOK
// when the structuring element is big. Three taps at 120 degrees plus the
// centre keeps the tap count at four and the element rotationally even.
// Third param is ours: run the morphology per channel and the colours bleed
// apart at the edges, or take only its brightness back onto the source colour
// and the shapes swell without the fringing.
// x0 grow (radius), x1 shape (erode <-> dilate), x2 hue (bleed <-> keep)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    // radius in pixels: 1 texel (the original) up to a fat 20
    vec2 r = (1.0 + 19.0 * u_x0 * u_x0) / u_resolution;

    vec3 e = texture2D(u_tex0, v_texcoord).rgb;
    vec3 a = texture2D(u_tex0, v_texcoord + r * vec2( 0.000,  1.000)).rgb;
    vec3 b = texture2D(u_tex0, v_texcoord + r * vec2(-0.866, -0.500)).rgb;
    vec3 c = texture2D(u_tex0, v_texcoord + r * vec2( 0.866, -0.500)).rgb;

    vec3 hi = max(e, max(a, max(b, c)));   // dilation-fast
    vec3 lo = min(e, min(a, min(b, c)));   // erosion-fast

    // 0 = pure erosion, 1 = pure dilation, halfway = midrange (a flattener)
    vec3 res = mix(lo, hi, u_x1);

    // the same swell carried on the source's own colour: no channel fringing
    vec3 kept = e * (dot(res, W) / (dot(e, W) + 0.004));

    gl_FragColor = vec4(clamp(mix(res, kept, u_x2), 0.0, 1.0), 1.0);
}
