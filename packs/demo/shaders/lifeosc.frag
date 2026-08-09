// artificial-life-style chaotic video oscillators: spatial waves
// phase-modulated by the video and ring-modulated by the feedback.
// x0 frequency, x1 video phase-mod depth, x2 rotate/spiral
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

void main() {
    vec2 p = v_texcoord - 0.5;
    p.x *= u_resolution.x / u_resolution.y;
    float th0 = (u_x2 - 0.5) * 3.0 + u_time * 0.2;
    p = vec2(p.x * cos(th0) - p.y * sin(th0),
             p.x * sin(th0) + p.y * cos(th0));
    p += u_x2 * 0.4 * (p.x + p.y);               // spiral shear

    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    vec3 prev = texture2D(u_tex1, v_texcoord).rgb;
    float lum = dot(src, vec3(0.299, 0.587, 0.114));

    float freq = 6.0 + u_x0 * 60.0;
    float pm = lum * u_x1 * 18.0 + prev.g * u_x1 * 6.0;
    float th = p.x * freq + u_time * 3.0 + pm;

    vec3 osc;
    osc.r = (sin(th) + 1.0) * 0.5;
    osc.g = (sin(th * 1.005 + 2.09 + pm * 0.3) + 1.0) * 0.5;
    osc.b = (sin(th * 0.995 + 4.18 - pm * 0.3) + 1.0) * 0.5;

    // ring-mod against the feedback keeps it alive and chaotic
    vec3 outc = mix(osc, osc * (0.4 + prev * 1.6), 0.5);
    gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
