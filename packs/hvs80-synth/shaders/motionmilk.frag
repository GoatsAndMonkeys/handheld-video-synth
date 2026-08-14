// Motion milk: the frame is measured against the delay ring and only the
// DIFFERENCE is shown. Still areas sink into a deep dusk ground (the live
// picture survives in it as a dim imprint — that imprint is what makes
// the ring taps a readable record of the past); movement pours in as
// luminous milk. The ring holds this shader's own output, so three guards
// stop the milk echoing itself back forever: both taps must disagree with
// now (a ghost at one depth alone is vetoed by the other), a small floor
// eats faint residue, and when the taps agree with each other too well
// the light is starved — a steady self-echo agrees perfectly and dies.
// x0 gain — the engine also deepens the ring reach with this knob,
// x1 ground hue, x2 signed tints — brightening and darkening split into
// complementary colours drifting slowly round the wheel, x3 live blend
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex2;   // ring tap at x0 depth
uniform sampler2D u_tex3;   // ring tap at half depth
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

// cheap sine on a unit period: sw(x) ~ sin(2*pi*x)
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }
float cw(float x) { return sw(x + 0.25); }
vec3 wheel(float h) {
    return 0.5 + 0.5 * vec3(cw(h), cw(h - 0.3333), cw(h - 0.6667));
}

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    vec3 now = texture2D(u_tex0, v_texcoord).rgb;
    vec3 old = texture2D(u_tex2, v_texcoord).rgb;
    vec3 mid = texture2D(u_tex3, v_texcoord).rgb;

    // what a still scene would be showing right now
    vec3 ground = vec3(0.045) + wheel(u_x1) * 0.10;
    vec3 still = mix(ground + now * 0.22, now, u_x3);

    float g = 2.0 + u_x0 * 13.0;
    float d2 = dot(abs(old - still), W);
    float d3 = dot(abs(mid - still), W);
    float raw = min(d2, d3 * 1.5);
    float sep = clamp(abs(d2 - d3) / (raw * 0.5 + 0.02), 0.0, 1.0);
    float m = clamp((raw - 0.035) * g, 0.0, 1.0) * (0.25 + 0.75 * sep);

    // plain milk is a cool white; signed mode paints brightening and
    // darkening in complementary tints a quarter-wheel off the ground
    float dl = dot(still - old, W);
    float drift = u_time * 0.02;
    vec3 tint = mix(vec3(0.72, 0.83, 1.0),
                    mix(wheel(u_x1 + 0.75 + drift),
                        wheel(u_x1 + 0.25 + drift), step(0.0, dl)),
                    u_x2);
    // cap the milk's luma so its own echo can never outshine real motion
    tint *= min(1.0, 0.60 / max(dot(tint, W), 1e-4));
    gl_FragColor = vec4(clamp(still + m * tint, 0.0, 1.0), 1.0);
}
