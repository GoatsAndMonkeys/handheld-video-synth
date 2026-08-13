// Anaglyph to Side-by-Side
// by hunterk
// license: public domain
//
// This shader is designed to convert Mednafen-VB's anaglyph 3D output to
// side-by-side 3D for use with VR headsets, such as Oculus Rift and Google Cardboard.
//
// Source: libretro/common-shaders, misc/anaglyph-to-side-by-side.cg
// Ported to the HVS-80 shader convention (single pass, GLES2, 3 params).
// Two lens-warped copies of the picture, one per eye, on a black field - the
// Cardboard viewer look. Warp() is the original barrel distortion, verbatim.
// The original's eye placement lives in a vertex shader across five constants
// (WIDTH/HEIGHT/BOTH/eye_sep/ana_zoom); here the same mapping is folded into
// the fragment stage as a centre-and-scale per eye so separation and zoom can
// be played. The red/cyan channel un-mixing is dropped: it exists to pull two
// eyes out of an anaglyph frame, and our input is ordinary colour video, so
// both eyes keep the full picture.
// x0 eyes (separation), x1 lens (barrel warp), x2 zoom (size in each eye)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

// original barrel distortion (warpX/warpY passed in rather than global)
vec2 Warp(vec2 pos, float warpX, float warpY) {
    pos = pos * 2.0 - 1.0;
    pos *= vec2(1.0 + (pos.y * pos.y) * warpX, 1.0 + (pos.x * pos.x) * warpY);
    return pos * 0.5 + 0.5;
}

// "ghetto imitation of CLAMP_TO_BORDER", as the original calls it
float inside(vec2 c) {
    vec2 t = step(vec2(0.0), c) * step(c, vec2(1.0));
    return t.x * t.y;
}

void main() {
    float warp = u_x1 * 0.5;            // original warpX/warpY, 0.0 .. 0.5

    float sep = u_x0 * 0.3;             // original eye_sep
    float z = mix(0.55, 1.5, u_x2);     // original ana_zoom
    vec2 scale = vec2(2.0, 1.0) / z;

    vec2 e1 = Warp((v_texcoord - vec2(0.5 - sep, 0.5)) * scale + 0.5, warp, warp);
    vec2 e2 = Warp((v_texcoord - vec2(0.5 + sep, 0.5)) * scale + 0.5, warp, warp);

    vec3 frame1 = texture2D(u_tex0, e1).rgb * inside(e1);
    vec3 frame2 = texture2D(u_tex0, e2).rgb * inside(e2);

    gl_FragColor = vec4(frame1 + frame2, 1.0);
}
