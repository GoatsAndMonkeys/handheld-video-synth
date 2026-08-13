// screen melt: the frame sags through the feedback buffer, bright
// (heavy) areas dripping fastest, columns slipping at their own rates —
// Doom screen-wipe meets hot wax. x0 melt (feedback), x1 drip, x2 waver,
// x3 reset — the wax periodically re-forms from live video (0 = never)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output frame
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

// sine-free hash: no hardware sin on this gpu. two values per call
vec2 hash2(float p) {
    vec3 q = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yzx + 33.33);
    return fract((q.xx + q.yz) * q.zy);
}

// parabolic stand-in for sin(2pi*x), within 6%
float wave(float x) {
    float t = fract(x) - 0.5;
    return 16.0 * t * (abs(t) - 0.5);
}

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    float col = floor(v_texcoord.x * 120.0);
    vec2 h = hash2(col);            // x: drip rate, y: waver phase
    float rate = 0.4 + h.x;
    float wob = u_x2 * 0.004 *
        wave(u_time * 0.41380 + v_texcoord.y * 2.38732 + h.y);
    // probe upward to weigh the sagging pixel: bright = heavy = fast
    float sag = u_x1 * 0.03 * rate;
    vec3 probe = texture2D(u_tex1, v_texcoord + vec2(0.0, sag)).rgb;
    sag *= 0.35 + dot(probe, W);
    vec3 prev = texture2D(u_tex1, v_texcoord + vec2(wob, sag)).rgb * 0.997;
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    // columns re-form on their own beat, so the reset sweeps rather
    // than snapping the whole frame at once
    float reform = step(0.93, fract(u_time * u_x3 * 0.35 + h.x));
    gl_FragColor = vec4(mix(src, prev, u_x0 * 0.95 * (1.0 - reform)), 1.0);
}
