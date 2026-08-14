// luma key: the live source keyed against the mixer's own output bus.
// wherever the picture crosses the key level one image punches straight
// through the other, and since the background bus is the last frame back
// round the loop, the held-back side fills with trails. bus gain stays
// under unity and crawls outward a hair, or the key just eats itself.
// x0 level (where the key breaks), x1 soft (edge width), x2 swap,
// x3 keysrc (which bus drives the key — the live source at 0, the
// output bus at the top, so the key reads its own trails and the edge
// walks outward on its own)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output = the background bus
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    vec3 live = texture2D(u_tex0, v_texcoord).rgb;
    vec3 bus = texture2D(u_tex1, (v_texcoord - 0.5) * 0.994 + 0.5).rgb * 0.97;

    // one divide sets the whole key: clip at level, ramp across soft
    float k = clamp((mix(dot(live, W), dot(bus, W), u_x3) - u_x0)
                    / (0.015 + u_x1 * 0.7) + 0.5, 0.0, 1.0);
    k = mix(k, 1.0 - k, step(0.5, u_x2));   // polarity switch on the panel
    gl_FragColor = vec4(mix(bus, live, k), 1.0);
}
