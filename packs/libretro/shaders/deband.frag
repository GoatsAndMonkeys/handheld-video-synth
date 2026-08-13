// deband: mpv's debander, driven past its job. It throws a random probe
// out of every pixel each frame and, where the picture is flat enough,
// replaces the pixel with what the probe found — so banding dissolves,
// then flat areas start to crawl and swim, then the whole frame goes soft
// and grainy like a photograph pushed three stops.
// x0 range (probe distance), x1 thresh (how flat is flat), x2 grain
//
// Ported to the HVS-80 GLES2 convention (single pass, 3 params) from the
// libretro slang-shaders collection, file misc/shaders/deband.slang.
// Source: https://github.com/libretro/slang-shaders
//
// ---------------- original header, verbatim ----------------
//  Deband shader by haasn
//  https://github.com/mpv-player/mpv/blob/master/video/out/opengl/video_shaders.c
//
//  This file is part of mpv.
//
//  mpv is free software; you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation; either version 2 of the License, or
//  (at your option) any later version.
//
//  mpv is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License along
//  with mpv.  If not, see <http://www.gnu.org/licenses/>.
//
//  You can alternatively redistribute this file and/or
//  modify it under the terms of the GNU Lesser General Public
//  License as published by the Free Software Foundation; either
//  version 2.1 of the License, or (at your option) any later version.
//
//  Modified and optimized for RetroArch by hunterk
// -----------------------------------------------------------
//
// Changes made in the port: Vulkan UBO/push-constant plumbing and the
// vertex stage dropped; the iterations loop removed (one pass only, no
// dynamic loops in GLES2); the four probes per iteration cut to an
// opposite pair, so 3 texture fetches total; haasn's permute/mod289 PRNG
// and its sin() replaced with this project's fract hash, and the random
// direction taken as a normalised hash pair instead of cos/sin — both for
// the VideoCore IV's sake; range pushed far past a sane debanding value so
// the shader can be played as an effect. 3 texture fetches.
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    // haasn seeds the PRNG from position + a per-frame uniform
    float frame = floor(u_time * 30.0);
    vec2 seed = v_texcoord * 311.7 + frame;
    float h1 = hash(seed);
    float h2 = hash(seed + 17.31);
    float h3 = hash(seed + 53.09);

    // a random direction, and a random distance along it
    vec2 dir = vec2(h1 - 0.5, h2 - 0.5);
    dir /= length(dir) + 0.0001;
    float dist = h3 * (2.0 + u_x0 * u_x0 * 90.0);
    vec2 pt = dist / u_resolution;

    vec3 color = texture2D(u_tex0, v_texcoord).rgb;
    vec3 avg = 0.5 * (texture2D(u_tex0, v_texcoord + pt * dir).rgb
                    + texture2D(u_tex0, v_texcoord - pt * dir).rgb);

    // keep the original only where the probe disagrees with it
    vec3 diff = abs(color - avg);
    vec3 thresh = vec3(0.004 + u_x1 * 0.5);
    color = mix(avg, color, step(thresh, diff));

    // and haasn's noise to smooth out what is left
    vec3 noise = vec3(hash(seed + 91.7), hash(seed + 131.3), hash(seed + 197.1));
    color += u_x2 * 0.35 * (noise - 0.5);

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
