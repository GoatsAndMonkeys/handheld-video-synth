// Sabattier solarize: tones above the threshold fold back down into
// metallic negatives, like re-exposing a darkroom print. Offset
// per-channel thresholds fringe the creases with color.
// x0 threshold, x1 amount, x2 fringe, x3 double — a second fold down in
// the shadows, banding the whole range (0 = single fold)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

void main() {
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    vec3 t = clamp(vec3(u_x0) + u_x2 * 0.15 * vec3(-1.0, 0.0, 1.0),
                   0.02, 1.0);
    vec3 folded = mix(src, clamp(2.0 * t - src, 0.0, 1.0), step(t, src));
    // fold again beneath the first crease: two creases, not one
    vec3 lo = t * 0.45;
    vec3 twice = mix(clamp(2.0 * lo - folded, 0.0, 1.0), folded,
                     step(lo, folded));
    folded = mix(folded, twice, u_x3);
    gl_FragColor = vec4(mix(src, folded, u_x1), 1.0);
}
