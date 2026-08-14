// Ink bleed: the dark parts of the picture are a loaded nib held against wet
// paper. Ink deposited under the shadows wicks outward through the feedback
// buffer a little further every frame, and because paper is fibres rather
// than felt it does not spread in circles — a static noise field gives every
// pixel a fibre direction, ink runs along the grain far and across it barely,
// and a finer noise makes some patches thirstier than others, so the front
// comes out ragged and fingered the way a real bloom does. Everything dries
// slowly, so nothing ever fills in solid.
//
// The state is the wetness, and the picture is the state: the sheet is drawn
// as paper plus ink along one straight line in colour space, and the next
// frame recovers the wetness by projecting the colour back onto that line —
// dot with the axis over its own length. That projection takes anything as
// input, which is what makes the effect safe to switch into: whatever the
// last effect left in the buffer reads as some amount of wetness between
// none and full, and one second of drying puts it back where the video says
// it should be.
//
// Two things keep it off the rails at every knob position. Deposit is
// proportional to how dry the paper still is, so the sheet approaches its
// soaked level and never reaches it — even a black frame at full supply
// settles at charcoal, not black. And the capillary term pulls toward a
// fraction of the wettest neighbour minus a threshold, so a front advances
// while a faint wash decays; the paper grain is drawn only where the ink is,
// so bare paper carries no noise for the wicking to feed on.
//
// No clock is declared. Paper does not move; the video is the clock.
//
// x0 bleed, x1 fibre, x2 supply, x3 ink
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output frame: the wet sheet
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;

// sine-free hash: no hardware sin on this gpu
float hash(vec2 p) {
    vec3 q = fract(p.xyx * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
}

// value noise: four corners, smoothstep between them. Two of these is the
// whole fibre model — one coarse for direction, one fine for thirst
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// cheap sine on a unit period: sw(x) ~ sin(2*pi*x)
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }
float cw(float x) { return sw(x + 0.25); }

// wetness back out of a drawn pixel: project onto the paper->ink axis
float wet(vec3 c, vec3 paper, vec3 axis, float ia) {
    return clamp(dot(c - paper, axis) * ia, 0.0, 1.0);
}

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);

    // three ink and paper pairs, picked in hard steps — the projection is
    // rebuilt from whichever pair is live, and since all three run dark ink
    // on light paper, changing ink mid-flow rereads the sheet almost intact
    float sel = floor(clamp(u_x3, 0.0, 0.999) * 3.0);
    float s1 = step(0.5, sel), s2 = step(1.5, sel);
    vec3 ink   = vec3(0.07, 0.06, 0.08);            // india black
    vec3 paper = vec3(0.95, 0.92, 0.86);            // warm rag
    ink   = mix(ink,   vec3(0.30, 0.16, 0.06), s1); // sepia
    paper = mix(paper, vec3(0.94, 0.89, 0.78), s1); // cream laid
    ink   = mix(ink,   vec3(0.10, 0.13, 0.42), s2); // indigo
    paper = mix(paper, vec3(0.93, 0.93, 0.90), s2); // cool cartridge

    vec3 axis = ink - paper;
    float ia = 1.0 / max(dot(axis, axis), 0.25);

    float rough = u_x1;

    // the fibre field. Aspect-corrected so the grain does not stretch, and
    // static: this sheet of paper is always the same sheet of paper
    vec2 q = v_texcoord * vec2(u_resolution.x / u_resolution.y, 1.0);
    float lay = vnoise(q * 4.0);                 // which way the fibres run
    float grain = vnoise(q * 26.0 + 11.0);       // how thirsty this patch is

    float ang = lay + 0.15;
    vec2 along = vec2(cw(ang), sw(ang));
    vec2 across = vec2(-along.y, along.x);

    vec2 px = (1.2 + u_x0 * 1.8) / u_resolution;
    vec2 e1 = along * px;
    vec2 e2 = across * px * mix(1.0, 0.22, rough);

    float i0 = wet(texture2D(u_tex1, v_texcoord).rgb, paper, axis, ia);
    float i1 = wet(texture2D(u_tex1, v_texcoord + e1).rgb, paper, axis, ia);
    float i2 = wet(texture2D(u_tex1, v_texcoord - e1).rgb, paper, axis, ia);
    float i3 = wet(texture2D(u_tex1, v_texcoord + e2).rgb, paper, axis, ia);
    float i4 = wet(texture2D(u_tex1, v_texcoord - e2).rgb, paper, axis, ia);

    // two ways ink can arrive: an even share of the neighbourhood, which is
    // plain soaking, and a fraction of the wettest neighbour, which is a
    // capillary front that advances into dry paper and fingers as it goes.
    // The threshold on the second is what stops a faint wash from feeding
    // itself across the whole sheet
    float wa = 0.25 + rough * 0.12;
    float wb = 0.25 - rough * 0.12;
    float soak = (i1 + i2) * wa + (i3 + i4) * wb;
    float mx = max(max(i1, i2), max(i3, i4));
    float cap = max(mx * 0.90 - 0.035, 0.0);
    float target = mix(soak, cap, 0.35 + rough * 0.45);

    // thirsty patches move ink faster than sized ones
    float rate = clamp((0.20 + u_x0 * 0.55) * (1.0 - rough * 0.75 * grain),
                       0.0, 1.0);
    float w = i0 + (target - i0) * rate;

    w *= 0.955;                                   // drying: half gone in ~15 frames

    // the nib: darkness in the picture loads ink, bass slaps more of it on,
    // and the (1 - w) makes every deposit smaller than the last
    float lum = dot(texture2D(u_tex0, v_texcoord).rgb, W);
    float dark = clamp((0.88 - lum) * 1.35, 0.0, 1.0);
    float supply = (0.02 + u_x2 * 0.13) * (1.0 + u_a0 * 0.9);
    w = clamp(w + supply * dark * (1.0 - w), 0.0, 1.0);

    // granulation: pigment settles into the tooth of the paper, so the grain
    // is only drawn where there is ink to settle. Bare paper stays clean,
    // which is also why the wicking has no noise floor to chew on
    vec3 col = paper + axis * w + axis * (grain - 0.5) * 0.06 * w;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
