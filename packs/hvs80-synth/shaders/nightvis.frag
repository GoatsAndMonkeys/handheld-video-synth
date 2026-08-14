// night vision: image-intensifier tube — hard gain with a saturation
// rolloff, photon grain, faint scanlines, green phosphor, scope
// vignette. x0 gain, x1 grain, x2 scope, x3 bloom — highlights halate
// the way an over-driven tube blooms (0 = clean)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

// sine-free hash: no hardware sin on this gpu
float hash(vec2 p) {
    vec3 q = fract(p.xyx * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
}

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    float g = dot(src, W) * (1.0 + u_x0 * 6.0);
    g = 1.0 - exp(-g * 1.2);            // tube saturation rolloff

    // photon noise: strongest where the tube is starved for light
    float n = hash(v_texcoord * 431.0 + fract(u_time * 13.7) * 91.0);
    g += (n - 0.5) * (0.06 + u_x1 * 0.45) * (1.1 - g * 0.7);

    // scanlines as a parabolic stand-in for sin, within 6%
    float s = fract(v_texcoord.y * u_resolution.y * 0.5) - 0.5;
    g *= 0.92 + 1.28 * s * (abs(s) - 0.5);

    // vignette on squared radius: same rolloff without the sqrt
    vec2 d = (v_texcoord - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
    float rad = mix(0.35, 0.75, u_x2);
    float inr = rad - 0.2;
    float vig = smoothstep(rad * rad, inr * inr, dot(d, d));

    g += u_x3 * g * g * 0.9;            // halation: bright blooms brighter
    vec3 phos = vec3(0.10, 1.0, 0.25) * g + vec3(0.0, 0.06, 0.01);
    gl_FragColor = vec4(clamp(phos * vig, 0.0, 1.0), 1.0);
}
