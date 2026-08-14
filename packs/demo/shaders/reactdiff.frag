// Reaction-diffusion: two invented chemicals fed by the picture, living in
// the feedback buffer. A spreads fast and is topped up everywhere; B spreads
// half as fast, eats A wherever it already is, and is skimmed off slightly
// faster than it is made. That one imbalance is the whole of it — the
// leftovers organise into Turing patterns: fingerprint worms, coral heads,
// leopard spots, depending on how the feed and kill rates sit relative to
// each other. Bright parts of the video keep seeding B, so the growth
// happens where the image is and follows it as it moves.
//
// The picture IS the state. Red carries A and green carries B, each through
// a straight line from the palette table, and the shader inverts that line
// on the next frame to read the chemistry back out. Because the map is
// affine the constant terms cancel in the laplacian, so a five-tap
// neighbourhood costs four subtractions rather than four decodes. Blue is
// spare: nothing is ever read back from it, so it takes the third dimension
// of the palette and a rim light on the reaction fronts for free.
//
// Nothing here can run away. A and B are clamped to 0..1 every frame, the
// palette slots are picked in discrete steps (so the inverse never divides
// by a span passing through zero), and every one of the four palettes maps
// 0..1 into 0..1, so clamping the colour can never corrupt a legal state.
// Whatever the buffer held when you switched in decodes to some pair of
// numbers in range and the chemistry pulls it back: a white frame reads as
// all-B and is skimmed away in a second, a black frame reads as clean
// substrate, which is exactly how you would start it anyway. A sparse static
// dust of seed points means it still nucleates over a black input.
//
// No clock is declared — the simulation's clock is the frame, one step per
// frame, and freeze holds the picture still without stalling it.
//
// x0 pattern (worms -> coral -> spots), x1 scale, x2 seed, x3 palette
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output frame: the chemical field
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a1;

// sine-free hash: no hardware sin on this gpu
float hash(vec2 p) {
    vec3 q = fract(p.xyx * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
}

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);

    // four palettes, chosen in hard steps rather than blended: the red and
    // green spans are what the decode divides by, and sliding between +0.83
    // and -0.90 would pass through zero on the way
    float sel = floor(clamp(u_x3, 0.0, 0.999) * 4.0);
    float s1 = step(0.5, sel), s2 = step(1.5, sel), s3 = step(2.5, sel);

    // K = (red base, red span, green base, green span) — every slot maps
    // 0..1 onto 0..1, which is what makes the round trip lossless
    vec4 K = vec4(0.96, -0.90, 0.10,  0.85);           // reef: coral on teal
    vec3 P = vec3(0.30, -0.05, -0.28);                 // blue: base, A, B
    K = mix(K, vec4(0.12,  0.83, 0.75, -0.72), s1);    // leopard: gold hide
    P = mix(P, vec3(0.10,  0.12,  0.05), s1);
    K = mix(K, vec4(0.12,  0.80, 0.80, -0.75), s2);    // indigo on bone
    P = mix(P, vec3(0.55,  0.25,  0.30), s2);
    K = mix(K, vec4(0.05,  0.55, 0.25,  0.75), s3);    // acid: green on mauve
    P = mix(P, vec3(0.15,  0.55, -0.10), s3);

    float ira = 1.0 / K.y;      // no span is smaller than 0.55 anywhere
    float igb = 1.0 / K.w;

    // tap spacing sets the diffusion length, and the diffusion length sets
    // how big a spot or how fat a stripe comes out
    vec2 px = (1.2 + u_x1 * 2.4) / u_resolution;

    vec4 c = texture2D(u_tex1, v_texcoord);
    vec2 n = texture2D(u_tex1, v_texcoord + vec2(px.x, 0.0)).rg
           + texture2D(u_tex1, v_texcoord - vec2(px.x, 0.0)).rg
           + texture2D(u_tex1, v_texcoord + vec2(0.0, px.y)).rg
           + texture2D(u_tex1, v_texcoord - vec2(0.0, px.y)).rg;
    n *= 0.25;

    // read the chemistry back out; the laplacian is the same line minus the
    // same line, so only the span survives and the bases drop out
    float a = clamp((c.r - K.x) * ira, 0.0, 1.0);
    float b = clamp((c.g - K.z) * igb, 0.0, 1.0);
    float la = clamp((n.x - c.r) * ira, -1.0, 1.0);
    float lb = clamp((n.y - c.g) * igb, -1.0, 1.0);

    // seeding: bright video squared, so highlights inject and mid-grey
    // barely does, plus a fixed dust of nucleation points that keeps the
    // sheet alive when the picture is black
    float lum = dot(texture2D(u_tex0, v_texcoord).rgb, W);
    float dust = step(0.996, hash(floor(v_texcoord * u_resolution * 0.5)));
    float seed = (0.012 + u_x2 * 0.075) * lum * lum + dust * 0.006;

    // the knob walks a line through the live wedge of the feed/kill plane:
    // worms and mazes at the bottom, coral in the middle, spots at the top.
    // Off the line in either direction the field either fills solid or dies
    // back to substrate, so the line is the effect
    float f = 0.020 + u_x0 * 0.040 + u_a1 * 0.006;   // the room stirs the feed
    float kl = 0.0505 + u_x0 * 0.0140;

    float rr = a * b * b;                            // B eats A, autocatalytic
    a = clamp(a + 0.90 * la - rr + f * (1.0 - a) - seed * 0.5, 0.0, 1.0);
    b = clamp(b + 0.45 * lb + rr - (f + kl) * b + seed, 0.0, 1.0);

    // blue owes nothing to the simulation, so the fronts get a rim light
    float sheen = clamp(abs(lb) * 3.0, 0.0, 1.0);
    vec3 col = vec3(K.x + a * K.y,
                    K.z + b * K.w,
                    P.x + a * P.y + b * P.z + sheen * 0.22);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
