// snow: the signal is going. colour goes first — the killer drops out
// long before the luma does — then band-limited static fills in behind
// what's left, every line hunting for a sync it can't quite find, and a
// bar rolls through where vertical sync used to be. at the top of the
// range there is nothing coming in at all.
// x0 snow (signal loss), x1 roll (sync bar), x2 grain, x3 temp (what the
// static is coming out of — a cold blue-white set with the flecks killed
// off at the bottom, the neutral field this was built with at 0.5, and a
// warm one letting confetti through the chroma path at the top)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_time;
uniform vec2 u_resolution;
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
    // a fresh noise field 30 times a second, cycling over two seconds
    float t = floor(fract(u_time * 0.5) * 60.0);
    vec2 px = v_texcoord * u_resolution;
    float amt = u_x0 * u_x0;

    // the bar: a band of the picture where vertical sync gave up
    float roll = fract(v_texcoord.y - fract(u_time * (0.04 + u_x1 * 0.45)));
    float bar = max(0.0, 1.0 - abs(roll - 0.5) * 11.0) * u_x1;

    // each line misses its start by a little more as the signal weakens
    float jit = (hash(vec2(floor(px.y), t)) - 0.5) * (amt * 0.1 + bar * 0.22);
    vec3 c = texture2D(u_tex0, fract(v_texcoord + vec2(jit, 0.0))).rgb;

    // colour killer: no burst worth locking to, so it fades to mono
    c = mix(c, vec3(dot(c, vec3(0.299, 0.587, 0.114))),
            min(1.0, amt * 1.7 + bar));
    c *= 1.0 - bar * 0.5;

    // static — grains run wide because the noise is band-limited too,
    // and a few flecks get through the chroma path coloured
    float n = hash(vec2(floor(px.x * (0.5 - u_x2 * 0.42)) + t * 13.7,
                        floor(px.y * (1.0 - u_x2 * 0.72)) - t * 7.3));
    n = clamp(n * 1.4 - 0.2, 0.0, 1.0);
    vec3 nv = mix(vec3(n), vec3(n, fract(n * 13.1), fract(n * 29.3)),
                  max(0.0, 0.2 + (u_x3 - 0.5) * 0.9));
    nv *= vec3(1.0) + (u_x3 - 0.5) * vec3(0.5, -0.02, -0.55);

    gl_FragColor = vec4(mix(c, nv, clamp(amt * 1.15 + bar * 0.7, 0.0, 1.0)),
                        1.0);
}
