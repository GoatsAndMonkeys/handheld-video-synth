// mdecho — MilkDrop's video echo composite stage. The frame is laid over a
// scaled copy of itself, optionally flipped in x, in y or in both, blended
// by max with a little addition on top; then the brightness lift and the
// solarise (invert-the-highlights) option that live in the same stage. The
// copy is taken from the previous output as well as from the live picture,
// which is what makes the second image lag and smear rather than sit
// perfectly over the first.
//
// No clock is declared here, so the speed slot stays off the bar — every
// bit of motion in this one is the picture's own.
//
// The echo taps hand back exactly the brightness the lift adds, so the loop
// gain stays under one however the knobs land: this stage cannot run away
// to white, and solarise folds highlights back down rather than up.
//
// After MilkDrop's engine (MilkDrop3 / BeatDrop, BSD 3-Clause, Copyright
// (c) 2018 Maxim Volskiy and individual contributors, descending from Ryan
// Geiss's Nullsoft MilkDrop 2). Reimplemented from the documented
// behaviour of that engine; no .milk preset content is used anywhere in
// this pack — presets belong to their own authors and are not covered by
// that grant. The notice is carried in the pack LICENSE.
//
// x0 echo size, x1 orientation in quarters (straight / flip x / flip y /
// both), x2 blend, x3 gamma lift then solarise
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

void main() {
    vec2 uv = v_texcoord;

    // gamma below the middle of the last knob, solarise above it; the
    // feedback weight is divided back out by any lift over 1
    float lift = mix(0.70, 1.85, min(u_x3 * 2.0, 1.0));
    float fbW = 0.80 / max(lift, 1.0);

    vec3 src = texture2D(u_tex0, uv).rgb;
    vec3 fb = texture2D(u_tex1, uv).rgb;
    vec3 base = max(src, fb * fbW);

    // orientation in quarters, picked with floats — no branch, no index
    float o = floor(min(u_x1, 0.999) * 4.0);
    float fx = 1.0 - 2.0 * mod(o, 2.0);
    float fy = 1.0 - 2.0 * step(2.0, o);

    // under 1 the copy shrinks and the clamped edge streaks a frame round
    // it; over 1 it is a magnified overlay
    float ez = mix(0.65, 2.40, u_x0);
    vec2 ec = clamp((uv - 0.5) * vec2(fx, fy) / ez + 0.5, 0.002, 0.998);
    vec3 eFb = texture2D(u_tex1, ec).rgb;
    vec3 eSrc = texture2D(u_tex0, ec).rgb;
    vec3 echo = max(eFb * fbW, eSrc);

    // max keeps the loop bounded; the additive part is taken from the live
    // picture only, so it can never feed itself
    vec3 col = mix(base, max(base, echo), u_x2);
    col += eSrc * u_x2 * 0.30;
    col *= lift;

    float sol = clamp(u_x3 * 2.0 - 1.0, 0.0, 1.0);
    col = clamp(col, 0.0, 1.0);
    col = mix(col, 1.0 - abs(col * 2.0 - 1.0), sol);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
