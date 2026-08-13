// Fisheye lens: barrel distortion, lens falloff, prismatic rim.
// x0 bulge, x1 zoom (pull back to the image circle <-> push in),
// x2 vignette, x3 fringe: each channel gets its own barrel.
// No clock on purpose — this is a lens, not an animation.
//
// The lens half of `hype`, given its own four knobs. Reach for this one when
// you want to dial the geometry independently of any grade; reach for hype
// when you want the whole look on one slot.
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

// Centred aspect-corrected point back into texture space through a barrel
// of strength k. r^2 grows fastest at the rim, so the edges squeeze while
// the middle stays near 1:1 — that difference is the wide-angle look.
vec2 warp(vec2 p, float k, float aspect) {
    p *= 1.0 + k * dot(p, p);
    p.x /= aspect;
    return p * 0.5 + 0.5;
}

void main() {
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 p = v_texcoord * 2.0 - 1.0;
    p.x *= aspect;
    p *= mix(1.45, 0.70, u_x1);

    float k = u_x0 * 1.30;
    float ca = u_x3 * 0.10;
    // real glass refracts each wavelength differently, so the split belongs
    // in the distortion itself, not as a flat rgb offset: it then appears
    // only at the rim, where the bending is strongest
    vec2 sr = warp(p, k * (1.0 - ca), aspect);
    vec2 sg = warp(p, k, aspect);
    vec2 sb = warp(p, k * (1.0 + ca), aspect);

    vec3 c = vec3(texture2D(u_tex0, sr).r,
                  texture2D(u_tex0, sg).g,
                  texture2D(u_tex0, sb).b);

    // past the frame edge go black rather than smearing the border pixel:
    // a lens that runs out of image should show its rim, not a stretch
    vec2 d = abs(sg - 0.5);
    c *= 1.0 - smoothstep(0.492, 0.5, max(d.x, d.y));

    c *= 1.0 - u_x2 * clamp(dot(p, p) * 0.45, 0.0, 1.0);
    gl_FragColor = vec4(c, 1.0);
}
