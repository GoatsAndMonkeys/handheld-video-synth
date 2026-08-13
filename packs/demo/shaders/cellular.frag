// numerical-feedback cellular automata: neighborhood arithmetic on the
// feedback buffer with overflow wrap, seeded by the video.
// x0 video injection, x1 growth rate, x2 cell size, x3 firing rule
// (cells over the line get an extra kick, 0 = plain diffusion)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

void main() {
    float cells = mix(u_resolution.x, 80.0, u_x2);
    vec2 grid = vec2(cells, cells * u_resolution.y / u_resolution.x);
    vec2 uv = (floor(v_texcoord * grid) + 0.5) / grid;
    vec2 px = 1.0 / grid;

    vec3 c = texture2D(u_tex1, uv).rgb;
    vec3 n = texture2D(u_tex1, uv + vec2(px.x, 0.0)).rgb
           + texture2D(u_tex1, uv - vec2(px.x, 0.0)).rgb
           + texture2D(u_tex1, uv + vec2(0.0, px.y)).rgb
           + texture2D(u_tex1, uv - vec2(0.0, px.y)).rgb;

    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    // near-conservative diffusion with slight gain: flows, not static
    float k = mix(0.985, 1.045, u_x1);
    vec3 v = (n * 0.25) * k + (c - n * 0.25) * 0.15;
    // excitable rule: charged cells fire an extra step and wrap sooner
    v += u_x3 * 0.14 * step(vec3(0.5), v);
    v = fract(v + (src - 0.5) * (u_x0 * 0.25) + 0.0005);
    gl_FragColor = vec4(v, 1.0);
}
