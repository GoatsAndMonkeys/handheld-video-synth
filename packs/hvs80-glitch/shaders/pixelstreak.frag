// pixel sort: a row is reordered so that everything in one tonal range
// collects into long horizontal runs. a real sort needs the whole line at
// once, which a single pass never has — so instead each run holds the
// colour standing at its head and drags it sideways, which is what a
// sorted row looks like once it is on a screen.
// x0 range (which tones streak, dark -> bright), x1 pull (run length),
// x2 width (how much of the tonal range qualifies), x3 dir (which way
// the sort runs — down the columns at the bottom of the range, along the
// rows as built at 0.5, and back the other way at the top)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    // clock built out of a wrapped phase: ticks along but never grows
    float clk = floor(fract(u_time * 0.04) * 32.0);
    float vert = step(u_x3, 0.33);
    float flip = step(0.67, u_x3);
    vec2 tc = mix(v_texcoord, v_texcoord.yx, vert);
    float jit = hash(vec2(floor(tc.y * 240.0), clk));

    // runs vary row to row, or the sort lines up into an obvious grid
    float len = (0.02 + u_x1 * 0.45) * (0.35 + jit);
    float s = (mix(tc.x, 1.0 - tc.x, flip) + jit) / len;
    float head = floor(s) * len - jit;
    head = mix(head, 1.0 - head, flip);

    vec3 loc = texture2D(u_tex0, v_texcoord).rgb;
    vec2 hp = vec2(clamp(head, 0.0, 1.0), tc.y);
    vec3 run = texture2D(u_tex0, mix(hp, hp.yx, vert)).rgb;

    // only the selected band gets dragged; everything else stays put
    float sel = clamp(1.0 - abs(dot(run, W) - u_x0) * (9.0 - u_x2 * 8.0),
                      0.0, 1.0);

    // the head holds, then the run bleeds back towards live pixels
    float f = fract(s);
    gl_FragColor = vec4(mix(loc, run, sel * (1.0 - f * f * 0.55)), 1.0);
}
