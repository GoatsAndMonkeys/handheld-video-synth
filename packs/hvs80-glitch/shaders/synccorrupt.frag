// sync corruption: horizontal sync slips so the picture tears into
// displaced bands, vertical hold slips so the whole frame rolls past a
// black blanking seam, and at the top of the range it never locks again.
// x0 hsync (band displacement), x1 vhold (roll speed), x2 loss,
// x3 blank — how wide the blanking seam between fields is: a hairline
// at the bottom, the seam this was built with at 0.5, a fat black band
// eating a third of the picture at the top
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    // vertical hold: the frame walks upward and wraps
    float roll = fract(u_time * u_x1 * 0.8);
    vec2 uv = vec2(v_texcoord.x, fract(v_texcoord.y + roll));

    float bands = 5.0 + floor(u_x2 * 45.0);
    float b = floor(uv.y * bands);
    float clk = floor(u_time * (3.0 + u_x2 * 24.0));
    float r = hash(vec2(b, clk));

    // unlucky bands lose the line start; the rest shear on a sawtooth
    float fire = step(1.0 - (0.2 + u_x2 * 0.8), r);
    uv.x += fire * (r - 0.5) * u_x0 * 1.4;
    uv.x += (fract(uv.y * bands) - 0.5) * u_x0 * u_x2 * 0.3;
    uv.y += fire * (hash(vec2(b, clk + 3.0)) - 0.5) * u_x2 * u_x2 * 0.5;
    uv = fract(uv);

    vec3 c = texture2D(u_tex0, uv).rgb;

    // the blanking seam rides through wherever the frame wrapped
    float w = mix(mix(90.0, 34.0, min(1.0, u_x3 * 2.0)), 6.0,
                  max(0.0, u_x3 * 2.0 - 1.0));
    float seam = max(0.0, 1.0 - min(uv.y, 1.0 - uv.y) * w);
    seam *= step(0.02, u_x1);
    c = mix(c, vec3(hash(uv * 211.0 + clk) * 0.22), seam);
    gl_FragColor = vec4(c, 1.0);
}
