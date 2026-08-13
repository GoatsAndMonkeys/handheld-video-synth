// Advanced Cartoon shader I and II
// by guest(r) (guest.r@gmail.com)
// license: GNU-GPL
//
// Source: libretro/glsl-shaders, cel/shaders/advcartoon.glsl
// Ported to the HVS-80 shader convention (single pass, GLES2, 3 params).
// Two halves: an ink line drawn from the contrast across the 3x3 ring, and a
// colour quantiser that snaps the hue vector and the brightness onto a coarse
// ladder - that is what makes it read as flat cel paint rather than posterise.
// The quantiser is verbatim; the ring is cut from nine taps to four (centre +
// three corners), with the missing horizontal/vertical differences folded into
// the surviving diagonals, so the ink still finds every edge. Shader II's
// "mute colors" branch collapses into a blend on x2 instead of a second copy
// of the maths.
// x0 ink (border thickness), x1 edge (line sensitivity), x2 flat (colour mute)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

void main() {
    const vec3 dt = vec3(1.0, 1.0, 1.0);
    vec2 ps = (0.5 + 3.5 * u_x0) / u_resolution;   // original: `border`

    vec3 c11 = texture2D(u_tex0, v_texcoord).rgb;
    vec3 c00 = texture2D(u_tex0, v_texcoord + vec2(-ps.x, -ps.y)).rgb;
    vec3 c22 = texture2D(u_tex0, v_texcoord + vec2( ps.x,  ps.y)).rgb;
    vec3 c20 = texture2D(u_tex0, v_texcoord + vec2( ps.x, -ps.y)).rgb;

    float bb = 0.5 * (0.2 + 2.8 * u_x1);           // original: const bb = 0.5
    float d1 = dot(abs(c00 - c22), dt);
    float d2 = dot(abs(c20 - c11), dt) * 2.0;      // stands in for c20-c02
    float d = bb * 2.0 * (d1 + d2) / (dot(c11, dt) + 0.15);

    // colour quantiser, straight from shader I
    float lc = 4.0 * length(c11);
    float f = fract(lc); f *= f;
    lc = 0.25 * (floor(lc) + f * f) + 0.05;
    vec3 q = 4.0 * normalize(c11 + 0.0001);
    vec3 frct = fract(q); frct *= frct;
    q = floor(q) + 0.05 * dt + frct * frct;

    vec3 cel = 0.25 * lc * q;
    cel = mix(cel, vec3(0.577 * lc), u_x2);        // shader II's colour mute

    gl_FragColor = vec4(clamp((1.1 - d * sqrt(d)) * cel, 0.0, 1.0), 1.0);
}
