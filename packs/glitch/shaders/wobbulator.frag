// wobbulator: extra deflection coils clamped round the neck of the tube.
// the raster itself is bent, not the picture painted on it — rings walk
// outward from the centre while a travelling wave runs down the vertical
// scan, so the whole geometry breathes. the added coils never track the
// factory yoke, so the red gun lands a little wide of the other two.
// x0 rings (ring count and depth), x1 wave (horizontal sweep), x2 drive,
// x3 harm — a second coil wound an octave up and driven backwards against
// the first, so the rings beat and knot into standing lobes instead of
// walking out cleanly; at 0 it is the single coil this was built with
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

// sine is far too dear to run five deep: this parabola pair tracks
// sin(2pi x) to about 6%, which is closer than any real coil manages
float wav(float x) {
    float t = fract(x) - 0.5;
    return 16.0 * t * (0.5 - abs(t));
}

void main() {
    // deflection is round; the frame is 4:3, so square the coordinates up
    vec2 p = (v_texcoord - 0.5) * vec2(1.333, 1.0);
    float r = length(p);
    float g = 0.03 + u_x2 * 0.13;       // how hard the yoke is driven

    // concentric rings radiating from the centre of deflection
    float rw = wav(r * (2.0 + u_x0 * 16.0) - fract(u_time * 0.23));
    rw = mix(rw, rw * 0.55 + wav(r * (4.0 + u_x0 * 32.0)
                                 + fract(u_time * 0.31)) * 0.75, u_x3);
    vec2 d = p / max(r, 0.002) * rw * u_x0 * g;

    // and a wave travelling down the frame that walks each line start
    float hw = wav(v_texcoord.y * (0.7 + u_x1 * 5.0) + fract(u_time * 0.17));
    d.x += hw * u_x1 * g * 2.0;

    // clamped, not wrapped: a raster pushed off the tube smears at the edge
    vec3 a = texture2D(u_tex0, clamp(v_texcoord + d, 0.0, 1.0)).rgb;
    vec3 b = texture2D(u_tex0, clamp(v_texcoord + d * 1.7, 0.0, 1.0)).rgb;

    // red coil lags, and where the raster bunches the beam dwells and blooms
    vec3 c = vec3(b.r, a.g, a.b);
    c *= 1.0 + (rw * 0.5 + hw * 0.3) * u_x2 * 0.9;
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
