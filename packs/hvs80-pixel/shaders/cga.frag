// CGA mode 4: four colours off a 1981 IBM card. The palette knob sweeps
// green/red/brown up through the classic cyan/magenta/grey into the
// rarely-seen tweak set with its intensity bit lit. The ntsc knob fakes
// composite artefact fringing the way the games really did it: alternate
// columns bleed into their neighbours and lean orange or blue, so edges
// pick up colours the card never had. Clockless — no motion of its own.
// x0 palette, x1 pixel, x2 artefacts, x3 dither
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_dither;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

// running nearest-colour: acc is (best colour, best distance so far)
vec4 pick(vec4 acc, vec3 p, vec3 c) {
    vec3 d = c - p;
    float dd = dot(d, d);
    return mix(acc, vec4(p, dd), step(dd, acc.w));
}

void main() {
    // the card's own 320 columns at the bottom of the knob
    float n = mix(320.0, 80.0, u_x1);
    vec2 grid = vec2(n, n * u_resolution.y / u_resolution.x);
    vec2 chunk = floor(v_texcoord * grid);
    vec3 pix = texture2D(u_tex0, (chunk + 0.5) / grid).rgb;

    // palette sweep: palette 0 at the bottom, palette 1 resting in the
    // centre, the intensity-bit tweak set at the top. Entries fade
    // green->cyan->light cyan, red->magenta->light red, brown->grey->white
    float s1 = clamp(u_x0 * 2.0, 0.0, 1.0);
    float s2 = clamp(u_x0 * 2.0 - 1.0, 0.0, 1.0);
    vec3 c1 = mix(mix(vec3(0.0, 0.667, 0.0), vec3(0.0, 0.667, 0.667), s1),
                  vec3(0.333, 1.0, 1.0), s2);
    vec3 c2 = mix(mix(vec3(0.667, 0.0, 0.0), vec3(0.667, 0.0, 0.667), s1),
                  vec3(1.0, 0.333, 0.333), s2);
    vec3 c3 = mix(mix(vec3(0.667, 0.333, 0.0), vec3(0.667), s1),
                  vec3(1.0), s2);

    // composite: the next column bleeds in, tinted by column parity —
    // even columns lean orange, odd lean blue, like the 8088 games
    vec3 nb = texture2D(u_tex0, (chunk + vec2(1.5, 0.5)) / grid).rgb;
    const vec3 W = vec3(0.299, 0.587, 0.114);
    float par = mod(chunk.x, 2.0);
    vec3 fringe = mix(vec3(0.35, 0.05, -0.3), vec3(-0.3, 0.0, 0.35), par);
    float edge = dot(pix, W) - dot(nb, W);
    vec3 feed = mix(pix, nb, u_x2 * 0.35) + u_x2 * edge * fringe * 2.0;

    feed += (texture2D(u_dither, chunk / 4.0).r - 0.5) * u_x3 * 0.6;

    // nearest of the four: black seed plus three palette compares
    vec3 c = clamp(feed, 0.0, 1.0);
    vec4 b = vec4(0.0, 0.0, 0.0, dot(c, c));
    b = pick(b, c1, c);
    b = pick(b, c2, c);
    b = pick(b, c3, c);
    vec3 q = b.rgb;

    // and a little of the bleed survives the quantiser — composite blur
    q += fringe * edge * u_x2 * 0.75;
    gl_FragColor = vec4(clamp(q, 0.0, 1.0), 1.0);
}
