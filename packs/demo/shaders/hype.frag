// Wide-angle lens and a grade that makes colour pop, in one pass.
// x0 lens, x1 punch, x2 vibrance, x3 shine.
//
// The lens keeps one knob on purpose. Vignette and rim colour fringing are
// not separate choices on real glass — they grow with the bending — so they
// ride x0 rather than eating three controls you would have to dial together
// anyway. At lens 0 this is a pure grade with no geometry touched at all.
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

const vec3 W = vec3(0.299, 0.587, 0.114);

// Centred aspect-corrected point back into texture space through a barrel of
// strength k. r^2 grows fastest at the rim, so the edges squeeze while the
// middle stays near 1:1 — that difference is the wide-angle look.
vec2 warp(vec2 p, float k, float aspect) {
    p *= 1.0 + k * dot(p, p);
    p.x /= aspect;
    return p * 0.5 + 0.5;
}

void main() {
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 p = v_texcoord * 2.0 - 1.0;
    p.x *= aspect;
    // creep outward as the bulge grows, so turning the lens up fills the
    // frame instead of immediately exposing the black rim
    p *= mix(1.0, 1.30, u_x0);

    float k = u_x0 * 1.30;
    float ca = u_x0 * 0.055;             // fringing rides the bending, so it
    vec2 sg = warp(p, k, aspect);        // shows at the rim and nowhere else
    vec3 c = vec3(texture2D(u_tex0, warp(p, k * (1.0 - ca), aspect)).r,
                  texture2D(u_tex0, sg).g,
                  texture2D(u_tex0, warp(p, k * (1.0 + ca), aspect)).b);

    // past the frame go black rather than smearing the border pixel: a lens
    // out of image should show its rim, not a stretch
    vec2 d = abs(sg - 0.5);
    c *= 1.0 - smoothstep(0.492, 0.5, max(d.x, d.y));

    if (u_x3 > 0.002) {                  // shine: only highlights bleed, and
        vec2 o = vec2(0.0045, 0.0060) * (1.0 + u_x3 * 3.0);   // around the
        vec3 b = (texture2D(u_tex0, sg + o).rgb                // bent coord,
                + texture2D(u_tex0, sg - o).rgb                // not the raw
                + texture2D(u_tex0, sg + vec2(o.x, -o.y)).rgb  // one
                + texture2D(u_tex0, sg - vec2(o.x, -o.y)).rgb) * 0.25;
        c += max(b - 0.55, 0.0) * 3.0 * u_x3;
    }

    // smoothstep is the S-curve: steepens the mids without the hard clip a
    // straight multiply gives. Applied twice past halfway so the knob keeps
    // giving instead of flattening out.
    float amt = u_x1 * 2.0;
    vec3 s = clamp(c, 0.0, 1.0);
    c = mix(c, s * s * (3.0 - 2.0 * s), clamp(amt, 0.0, 1.0));
    if (amt > 1.0) {
        s = clamp(c, 0.0, 1.0);
        c = mix(c, s * s * (3.0 - 2.0 * s), amt - 1.0);
    }

    // vibrance, not saturation: weight the lift by how muted a pixel already
    // is, so dull areas come up and vivid ones stop short of flat blocks
    float lum = dot(c, W);
    float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
    float boost = (u_x2 - 0.5) * 2.0;                    // 0.5 = unchanged
    float w = boost > 0.0 ? 1.0 - clamp(sat, 0.0, 1.0) : 1.0;
    c = lum + (c - lum) * (1.0 + boost * 2.0 * w);

    // falloff last, so the grade cannot lift the corners back up
    c *= 1.0 - u_x0 * 0.85 * clamp(dot(p, p) * 0.40, 0.0, 1.0);
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
