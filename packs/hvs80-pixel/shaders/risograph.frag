// Risograph: the picture split onto two spot-ink plates and overprinted
// on warm paper. Each plate is a coarse Bayer-grain stipple of its own
// tone curve — one holds the shadows hard, the other carries midtones
// and leans into saturated colour. The plates never quite line up: each
// is pushed a few pixels a different way, and bass thumps shove the
// sheet further, like a sloppy pass through the duplicator. No clock —
// the misprint only moves when the picture or the music does.
// x0 ink pairing (pink/blue, orange/teal, pink/green, yellow/purple),
// x1 misregistration, x2 grain coarseness, x3 ink density
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_dither;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;   // bass shoves the registration

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);

    // grain cell size in pixels: tight riso stipple up to chunky grain
    float g = mix(3.0, 13.0, u_x2);
    vec2 grid = u_resolution / g;

    // registration error, in texcoords: squared so the low half of the
    // knob stays near-true, the top half drifts to ~8px. Bass adds a
    // shove on top, a bad feed on every kick.
    float err = u_x1 * u_x1 * 0.013 + u_a0 * 0.006;
    vec2 uvA = v_texcoord + vec2(0.90, 0.45) * err;
    vec2 uvB = v_texcoord - vec2(0.55, 1.00) * err;

    // plate A: the shadow plate. Squared curve keeps it off the paper
    // until the tone really drops, so it prints contrasty.
    vec2 cA = floor(uvA * grid);
    vec3 sA = texture2D(u_tex0, (cA + 0.5) / grid).rgb;
    float dA = texture2D(u_dither, cA / 4.0).r;
    float la = 1.0 - dot(sA, W);
    float densA = la * la * 1.5;

    // plate B: the midtone plate, softer, plus a pull toward wherever
    // the frame is saturated — that is where a second ink earns its keep
    vec2 cB = floor(uvB * grid);
    vec3 sB = texture2D(u_tex0, (cB + 0.5) / grid).rgb;
    float dB = texture2D(u_dither, cB / 4.0).r;
    float satB = max(sB.r, max(sB.g, sB.b)) - min(sB.r, min(sB.g, sB.b));
    float densB = (1.0 - dot(sB, W)) * 0.7 + satB * 0.6;

    // ink knob: floor of 0.35 so zero still prints a ghost, never blank
    float flood = 0.35 + u_x3 * 1.05;
    float covA = smoothstep(dA - 0.28, dA + 0.28, densA * flood);
    float covB = smoothstep(dB - 0.28, dB + 0.28, densB * flood);

    // the drum inks: four real riso pairings, stepped through in order
    float q = u_x0 * 3.999;
    float s1 = step(1.0, q);
    float s2 = step(2.0, q);
    float s3 = step(3.0, q);
    vec3 inkA = mix(vec3(1.00, 0.10, 0.55),                     // fluor pink
               mix(vec3(1.00, 0.42, 0.18),                      // orange
               mix(vec3(1.00, 0.10, 0.55),                      // fluor pink
                   vec3(1.00, 0.91, 0.08), s3), s2), s1);       // yellow
    vec3 inkB = mix(vec3(0.00, 0.47, 0.75),                     // blue
               mix(vec3(0.00, 0.51, 0.54),                      // teal
               mix(vec3(0.00, 0.66, 0.36),                      // green
                   vec3(0.46, 0.36, 0.65), s3), s2), s1);       // purple

    // translucent soy ink over warm paper: multiply, so the overlap of
    // the two plates makes its own third colour
    vec3 col = vec3(0.96, 0.93, 0.85);
    col *= mix(vec3(1.0), inkA, covA);
    col *= mix(vec3(1.0), inkB, covB);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
