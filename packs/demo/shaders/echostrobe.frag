// Echo strobe: the live picture layered with three echoes of itself —
// the previous frame, the ring's half tap and its far tap — each
// repainted from past *brightness* in its own tint (the ring holds our
// own output, so past colour would decay to nothing) and lighten-blended
// so the trails read as coloured strobes of the past. The echo weights
// throb round a slow clock, a third of a cycle apart — a rotating pulse
// that never drops to black; bass hands the flare to the farthest echo.
// x0 depth (engine-driven ring reach), x1 pulse rate, x2 tint spread,
// x3 live picture <-> echoes carry the frame
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform sampler2D u_tex2;   // ring tap at x0 depth
uniform sampler2D u_tex3;   // ring tap at half depth
uniform float u_time;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;

// cheap sine on a unit period: sw(x) ~ sin(2*pi*x)
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }
float cw(float x) { return sw(x + 0.25); }
vec3 wheel(float h) {
    return 0.5 + 0.5 * vec3(cw(h), cw(h - 0.3333), cw(h - 0.6667));
}

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    vec3 now = texture2D(u_tex0, v_texcoord).rgb;
    float l1 = dot(texture2D(u_tex1, v_texcoord).rgb, W);
    float l2 = dot(texture2D(u_tex3, v_texcoord).rgb, W);
    float l3 = dot(texture2D(u_tex2, v_texcoord).rgb, W);

    // a throb, not a strobe-flash: weights swing 0.25..0.85 and stay
    // capped below 1 so the lighten loop always decays
    float ph = u_time * (0.15 + u_x1 * 1.1);
    float w1 = 0.55 + 0.30 * sw(ph);
    float w2 = 0.55 + 0.30 * sw(ph - 0.3333);
    float w3 = min(0.55 + 0.30 * sw(ph - 0.6667) + u_a0 * 0.9, 0.97);

    float hb = u_time * 0.015;                 // palette drifts slowly
    float spread = u_x2 * 0.3333;
    vec3 t1 = mix(vec3(1.0), wheel(hb), 0.7);
    vec3 t2 = mix(vec3(1.0), wheel(hb + spread), 0.7);
    vec3 t3 = mix(vec3(1.0), wheel(hb + spread * 2.0), 0.7);

    vec3 echo = max(max(l1 * w1 * t1, l2 * w2 * t2), l3 * w3 * t3);
    vec3 c = max(now * (1.0 - 0.75 * u_x3), echo * (0.30 + 0.70 * u_x3));
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
