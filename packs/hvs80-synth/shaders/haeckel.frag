// super-haeckel-style superformula radiolaria: Gielis curves breathing
// with time, video-modulated, with feedback trails.
// x0 lobes, x1 form exponents, x2 trail glow,
// x3 the third superformula exponent n3, 0 = the stock 1.7 (round arms)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

float superformula(float th, float m, float n1, float n2, float n3) {
    float a = pow(abs(cos(m * th / 4.0)), n2);
    float b = pow(abs(sin(m * th / 4.0)), n3);
    return pow(a + b, -1.0 / n1);
}

void main() {
    vec2 p = v_texcoord - 0.5;
    p.x *= u_resolution.x / u_resolution.y;
    float r = length(p) * 2.2;
    float th = atan(p.y, p.x) + u_time * 0.15;

    float lum = dot(texture2D(u_tex0, v_texcoord).rgb, vec3(0.299, 0.587, 0.114));
    float m = floor(2.0 + u_x0 * 14.0);
    float n1 = mix(0.25, 2.5, u_x1) + 0.4 * sin(u_time * 0.4);
    float rr = superformula(th, m, n1, mix(0.5, 3.0, u_x1), mix(1.7, 0.3, u_x3));
    rr *= 0.55 + 0.15 * sin(u_time * 0.7) + lum * 0.35;

    float d = r - rr;
    float edge = exp(-abs(d) * mix(18.0, 5.0, u_x2));
    vec3 col = (0.5 + 0.5 * cos(d * 9.0 - u_time
               + vec3(0.0, 2.1, 4.2))) * edge;

    vec3 prev = texture2D(u_tex1, v_texcoord).rgb;
    gl_FragColor = vec4(max(col, prev * (0.80 + u_x2 * 0.17)), 1.0);
}
