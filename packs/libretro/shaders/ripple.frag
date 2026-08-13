/*
   Author: Themaister
   License: Public domain
*/
// Source: libretro/glsl-shaders, borders/resources/water.glsl
// Ported to the HVS-80 shader convention (single pass, GLES2, 3 params).
// The original sums sin(300*distance - 0.15*frame_count) from seven fixed
// wave sources and uses the result only to shimmer the brightness of the
// border around the game. Here the same wave field drives the coordinates as
// well - each source pushes the picture along its own radius - so the ripples
// bend the image the way water does, with the brightness shimmer kept as a
// third param. Three sources instead of seven (three sin per pixel is what
// the VideoCore will take), frame_count becomes u_time.
// x0 depth (displacement), x1 fine (wave scale), x2 shine (bright shimmer)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

// original: dist = 300.0 * sqrt(dot(diff, diff)); dist -= 0.15 * cnt; sin(dist)
vec3 apply_wave(vec2 pos, vec2 src, float k, float t) {
    vec2 diff = pos - src;
    float dist = sqrt(dot(diff, diff));
    float s = sin(k * dist - t);
    return vec3(diff / (dist + 0.001) * s, s);
}

void main() {
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = vec2(v_texcoord.x * aspect, v_texcoord.y);

    float k = mix(8.0, 120.0, u_x1 * u_x1);
    float t = u_time * 9.0;               // 0.15 per frame at 60 Hz

    vec3 w0 = apply_wave(p, vec2(0.6, 0.7), k, t);
    vec3 w1 = apply_wave(p, vec2(0.9, 0.9), k, t);
    vec3 w2 = apply_wave(p, vec2(-0.6, 0.3), k, t);

    vec2 disp = (w0.xy + w1.xy + w2.xy) * (u_x0 * 0.012);
    disp.x /= aspect;

    vec3 col = texture2D(u_tex0, clamp(v_texcoord + disp, 0.001, 0.999)).rgb;

    // original: back.rgb * (0.7 + 0.05 * res)
    float res = w0.z + w1.z + w2.z;
    col *= 1.0 + u_x2 * 0.25 * res;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
