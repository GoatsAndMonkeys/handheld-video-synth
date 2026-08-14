// Make the colour pop without flattening it.
// x0 punch (filmic S-curve), x1 vibrance, x2 bloom, x3 split tone.
//
// Deliberately not colorize: that one is a linear contrast and a flat
// saturation, which drives vivid areas into solid blocks. Here the curve is
// an S about mid grey and the saturation is weighted by how muted a pixel
// already is, so the lift lands on the dull parts and leaves the loud ones.
//
// The grade half of `hype`, with its own four knobs — plus the split tone
// that hype has no slot for.
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

const vec3 W = vec3(0.299, 0.587, 0.114);

void main() {
    vec3 c = texture2D(u_tex0, v_texcoord).rgb;

    if (u_x2 > 0.002) {                 // bloom: only the highlights bleed
        vec2 o = vec2(0.0045, 0.0060) * (1.0 + u_x2 * 3.0);
        vec3 b = (texture2D(u_tex0, v_texcoord + o).rgb
                + texture2D(u_tex0, v_texcoord - o).rgb
                + texture2D(u_tex0, v_texcoord + vec2(o.x, -o.y)).rgb
                + texture2D(u_tex0, v_texcoord - vec2(o.x, -o.y)).rgb) * 0.25;
        c += max(b - 0.55, 0.0) * 2.2 * u_x2 * 1.5;
    }

    // smoothstep is the S-curve; applying it twice past halfway lets the
    // knob keep going without the hard clip a straight multiply would give
    float amt = u_x0 * 2.0;
    vec3 s = clamp(c, 0.0, 1.0);
    c = mix(c, s * s * (3.0 - 2.0 * s), clamp(amt, 0.0, 1.0));
    if (amt > 1.0) {
        s = clamp(c, 0.0, 1.0);
        c = mix(c, s * s * (3.0 - 2.0 * s), amt - 1.0);
    }

    float lum = dot(c, W);
    float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
    float boost = (u_x1 - 0.5) * 2.0;               // 0.5 = unchanged
    float w = boost > 0.0 ? 1.0 - clamp(sat, 0.0, 1.0) : 1.0;
    c = lum + (c - lum) * (1.0 + boost * 2.0 * w);

    if (u_x3 > 0.002) {                 // shadows one way, highlights the
        float t = clamp(dot(clamp(c, 0.0, 1.0), W), 0.0, 1.0);   // other
        c += mix(vec3(0.00, 0.35, 0.55), vec3(0.85, 0.55, 0.15), t)
             * (t * (1.0 - t) * 4.0) * u_x3 * 0.35;
    }

    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
