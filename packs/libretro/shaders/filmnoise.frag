// filmnoise: a print that has been round the projector too many times —
// two-strip Technicolor records slipping out of registration, emulsion
// grain, hair scratches, gate weave and a hot centre inside a breathing
// vignette.
// x0 wear (grain / scratches / weave), x1 strip (technicolor), x2 gate
//
// Ported to the HVS-80 GLES2 convention (single pass, 3 params) from the
// libretro slang-shaders collection, file film/shaders/film_noise.slang.
// Source: https://github.com/libretro/slang-shaders
//
// ---------------- original header, verbatim ----------------
// film noise
// by hunterk
// license: public domain
//
// (the two-strip step is credited inside the original to aybe:
//  https://github.com/aybe/RetroArch-shaders/blob/master/shaders/technicolor1.cg)
// -----------------------------------------------------------
//
// Changes made in the port: Vulkan UBO/push-constant plumbing and the
// vertex stage dropped; the original's 14 parameters folded onto three;
// the film-scratch/dirt LUT texture it samples (noise1) is replaced with
// procedural hairs, since that asset is not vendored here; the sin()-based
// hash swapped for this project's fract hash (cheaper on VideoCore IV);
// the original's blue-record coordinate bug (it reused the red offsets)
// fixed. 3 texture fetches.
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// hunterk's filters: one red record, one blue-green record
const vec3 REDFILTER = vec3(1.0, 0.0, 0.0);
const vec3 BGFILTER  = vec3(0.0, 1.0, 0.7);

void main() {
    float wear = u_x0;
    float frame = floor(u_time * 24.0);         // film runs at 24

    // gate weave — the frame never sits quite still in the gate
    vec2 uv = v_texcoord - 0.5;
    uv.y += (hash(vec2(frame, 7.0)) - 0.5) * 0.010 * wear;
    uv.x += (hash(vec2(frame, 19.0)) - 0.5) * 0.005 * wear;

    // three records pulled slightly out of registration
    float mis = 0.02 * u_x1;
    vec3 red_light = texture2D(u_tex0, uv + vec2( 0.30,  0.18) * mis + 0.5).rgb;
    vec3 green_light = texture2D(u_tex0, uv + vec2(-0.15, -0.20) * mis + 0.5).rgb;
    vec3 blue_light = texture2D(u_tex0, uv + vec2(-0.28,  0.22) * mis + 0.5).rgb;
    vec3 film = vec3(red_light.r, green_light.g, blue_light.b);

    // two-strip Technicolor: red negative + blue-green negative, printed back
    float rednegative = film.r;
    float bgnegative = (film.g + film.b * 0.7) * 0.5;
    vec3 result = rednegative * REDFILTER + bgnegative * BGFILTER;
    film = mix(film, result, u_x1);

    // emulsion grain
    film += (hash(v_texcoord * 421.0 + frame) - 0.5) * wear * 0.22;

    // hair scratches: a couple of vertical lines that live a few frames
    float t2 = floor(u_time * 6.0);
    float sc = step(0.45, hash(vec2(t2, 11.0)))
             * smoothstep(0.0028, 0.0, abs(v_texcoord.x - hash(vec2(t2, 3.0))));
    sc += step(0.72, hash(vec2(t2, 31.0)))
        * smoothstep(0.0016, 0.0, abs(v_texcoord.x - hash(vec2(t2, 23.0))));
    film = mix(film, vec3(0.95), clamp(sc, 0.0, 1.0) * wear * 0.85);

    // vignette + hotspot, size flickering with the arc
    float len = length(v_texcoord - 0.5) / 1.25;
    float vig = smoothstep(0.0, 1.0 - u_x2 * 0.5, len);
    float flick = 1.0 + 0.2 * (hash(vec2(frame, 5.0)) - 0.5);
    film *= mix(1.0, 1.0 - vig, u_x2 * 0.8 * flick);
    film += (1.0 - vig) * 0.3 * u_x2 * flick;

    gl_FragColor = vec4(clamp(film, 0.0, 1.0), 1.0);
}
