// Nth-generation photocopy: the picture crushed toward pure toner and
// paper, mids breaking into copier grain, dark edges bleeding like
// spread toner. The copies knob feeds the machine its own last output —
// at zero it copies the live video, up high each frame re-copies the
// previous print and the rot compounds generation by generation. A
// sliver of live signal is always mixed back in, and the old page
// drifts a hair each pass like a misfeed, so the loop never bleaches
// out or seizes solid. No clock — the degradation runs on its own.
// x0 contrast crush, x1 toner speckle, x2 self-copy amount, x3 toner
// colour (fresh black -> blue-black -> the red-brown of a dying drum)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output frame
uniform sampler2D u_dither;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    vec2 px = 1.0 / u_resolution;

    // toner spread: min against two neighbours dilates the darks. The
    // fed-back page was smeared when it was printed, so with copies up
    // this pass stacks on the last and the blacks grow generation by
    // generation.
    float l0 = dot(texture2D(u_tex0, v_texcoord).rgb, W);
    float l1 = dot(texture2D(u_tex0, v_texcoord + vec2(px.x * 1.5, 0.0)).rgb, W);
    float l2 = dot(texture2D(u_tex0, v_texcoord + vec2(0.0, px.y * 1.5)).rgb, W);
    float live = mix(l0, min(l0, min(l1, l2)), 0.6);

    // the page on the glass: live video pulled toward our own last
    // print, capped at 0.85 so real signal always leaks through
    float gen = u_x2 * 0.85;
    float prev = dot(texture2D(u_tex1,
                     v_texcoord + vec2(0.0012, -0.0009) * u_x2).rgb, W);
    float lum = mix(live, prev, gen);
    float before = lum;   // pre-crush tone, for the speckle mask

    // the exposure lamp: an s-curve that steepens to a hard threshold,
    // with the Bayer cell under it so the mids break into copier grain
    float d1 = texture2D(u_dither, v_texcoord * u_resolution / 4.0).r;
    float w = mix(0.55, 0.045, u_x0);
    lum = smoothstep(0.5 - w, 0.5 + w, lum + (d1 - 0.5) * 0.10);

    // toner speckle: two Bayer taps at clashing scales make a cheap
    // static grit; it lands hardest in the mids, flipping crushed
    // pixels to salt and pepper
    float d2 = texture2D(u_dither, v_texcoord * u_resolution * 0.093).r;
    float n = fract(d1 * 5.7 + d2 * 9.3 + d1 * d2 * 3.1);
    float mids = clamp(1.0 - abs(before - 0.5) * 2.0, 0.0, 1.0);
    float spk = step(1.0 - u_x1 * 0.30 * mids, n);
    lum = mix(lum, 1.0 - step(0.5, lum), spk);

    // toner sweep: black, blue-black, then the drum gives out red-brown
    float t1 = clamp(u_x3 * 2.0, 0.0, 1.0);
    float t2 = clamp(u_x3 * 2.0 - 1.0, 0.0, 1.0);
    vec3 toner = mix(mix(vec3(0.04, 0.04, 0.05),
                         vec3(0.07, 0.09, 0.20), t1),
                     vec3(0.38, 0.13, 0.09), t2);
    vec3 col = mix(toner, vec3(0.97, 0.97, 0.95), lum);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
