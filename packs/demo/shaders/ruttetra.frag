// Rutt/Etra scan processor: luma lifts each scanline into a glowing
// wire terrain — bright shapes rise as ridges. Homage to the 1972
// Rutt/Etra video synthesizer's deflection modulation.
// x0 lift, x1 lines, x2 fill, x3 weight — hairline scan wires through
// to fat glowing ribbons (0 = stock)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    float lift = u_x0 * 0.35;
    float rows = mix(24.0, 100.0, u_x1);

    // invert y' = y + lift*luma(y) in two probes; the second one
    // doubles as the solid fill sample
    float y = v_texcoord.y
              - lift * dot(texture2D(u_tex0, v_texcoord).rgb, W);
    vec3 solid = texture2D(u_tex0, vec2(v_texcoord.x, y)).rgb;
    y = v_texcoord.y - lift * dot(solid, W);

    float rowY = (floor(y * rows) + 0.5) / rows;
    vec3 src = texture2D(u_tex0, vec2(v_texcoord.x, rowY)).rgb;
    float lum = dot(src, W);
    float thick = (0.16 + u_x3 * 0.74) / rows;
    float lineI = 1.0 - smoothstep(0.0, thick,
                                   abs(v_texcoord.y - rowY - lift * lum));

    vec3 wire = (src * 0.7 + vec3(0.3)) * (0.25 + lum) * 1.9 * lineI;
    gl_FragColor = vec4(clamp(max(wire, solid * u_x2), 0.0, 1.0), 1.0);
}
