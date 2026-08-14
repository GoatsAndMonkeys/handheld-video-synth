// After rose-curve-interpolation: Grandi's rose r = cos(k·theta), with k
// swept continuously so the flower morphs petal count the way the toy's
// slider does — at whole k it closes crisply, between them it opens into
// spiralling not-quite-flowers. Drawn as a glowing stroke: each pixel
// measures how far it sits from the curve at its own angle.
//
// x0 petals, x1 stroke, x2 colour drift, x3 video blend
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;
uniform float u_a1;
uniform float u_a2;

float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }

vec3 pal(float h) {
    return 0.5 + 0.5 * vec3(sw(h), sw(h + 0.333), sw(h + 0.667));
}

void main() {
    vec2 uv = v_texcoord;
    vec3 vid = texture2D(u_tex0, uv).rgb;

    float asp = u_resolution.x / u_resolution.y;
    vec2 p = uv - 0.5;
    p.x *= asp;
    float r = length(p);
    float th = atan(p.y, p.x) + u_time * 0.12;

    // petal count drifts around the knob setting; bass swells the bloom
    float k = 1.0 + u_x0 * 8.0 + 0.6 * sw(u_time * 0.05);
    float R = (0.16 + 0.24 * (0.5 + 0.5 * u_a0)) * (0.8 + 0.3 * u_a1);

    // the rose at this pixel's angle — negative lobes fold to the opposite
    // side, so evaluate both branches and keep the nearer one
    float c1 = abs(r - abs(R * cos(k * th)));
    float c2 = abs(r - abs(R * cos(k * (th + 3.14159265))));
    float d = min(c1, c2);

    float w = 0.004 + u_x1 * 0.020 + 0.004 * u_a2;
    float m = 1.0 - smoothstep(w * 0.5, w, d);
    float glow = exp(-d * d / max(w * w * 30.0, 1e-6)) * 0.45;

    // a second, fainter rose one petal off, the interpolation ghost
    float k2 = k + 1.0;
    float g2 = abs(r - abs(R * 0.8 * cos(k2 * th)));
    float ghost = exp(-g2 * g2 / max(w * w * 18.0, 1e-6)) * 0.20;

    float hue = u_time * 0.04 + r * (0.3 + u_x2 * 1.2);
    vec3 line = pal(hue);

    vec3 ground = vid * u_x3 * 0.85;
    vec3 col = ground * (1.0 - m) + line * m + line * glow
             + pal(hue + 0.4) * ghost;
    gl_FragColor = vec4(col, 1.0);
}
