// crt rescan: a camera pointed at a tube and shot back off the glass —
// warm, a little soft, curved at the corners, scanlines showing through,
// a bright bar rolling down out of sync, and highlights blooming.
// x0 curve (barrel/pincushion), x1 scan (lines + rolling bar), x2 glow,
// x3 phosphor — which tube it was shot off: blue-white monochrome at the
// bottom, the colour set this was built on at 0.5, amber monitor at the top
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
    vec2 c = v_texcoord - 0.5;
    vec2 uv = c * (1.0 + dot(c, c) * (u_x0 - 0.5) * 1.6) + 0.5;

    // rescan optics never quite focus: two taps, blurred and bloomed
    vec3 a = texture2D(u_tex0, uv).rgb;
    vec3 b = texture2D(u_tex0, uv + vec2(0.004, 0.003)).rgb;
    vec3 col = mix(a, b, 0.4);
    col += max(col - 0.62, 0.0) * (0.3 + u_x2 * 2.2);

    // scanlines from a triangle wave, and the tube's rolling bar
    float tri = abs(fract(uv.y * 150.0) * 2.0 - 1.0);
    col *= 1.0 - tri * u_x1 * 0.6;
    float bar = fract(uv.y - fract(u_time * 0.11));
    bar = abs(bar - 0.5);
    col *= 1.0 + max(0.0, 1.0 - bar * 5.0) * (0.1 + u_x1 * 0.55);

    // mains flicker, warm phosphor, and the dark surround off the glass
    col *= 0.93 + hash(vec2(floor(u_time * 24.0), 7.0)) * 0.13;
    col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))),
              abs(u_x3 - 0.5) * 2.0);
    col *= (vec3(1.10, 1.0, 0.86) + (u_x3 - 0.5) * vec3(0.34, -0.06, -0.68))
           * (1.0 - dot(c, c) * 0.55);
    vec2 e = abs(uv - 0.5);
    col *= step(max(e.x, e.y), 0.5);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
