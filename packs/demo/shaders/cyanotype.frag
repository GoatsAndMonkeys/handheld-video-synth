// Cyanotype: the picture printed in Prussian blue. A three-tap gradient
// pulls out edges and draws them as pale linework over the deep blue
// ground, with flat washes stepped in where the frame is bright — an
// architect's blueprint — and the first knob sweeps that toward a
// continuous-tone sun print, shadows drowned in blue, highlights
// bleached back to paper. The Bayer cell lies faintly under everything
// as paper tooth. Age fades the blue toward teal and yellows the
// whites like an old folio. No clock — a contact print holds still.
// x0 line vs photo, x1 edge sensitivity, x2 exposure, x3 age
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_dither;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    vec2 px = 1.0 / u_resolution;

    // cheap gradient: centre plus one tap right, one tap up
    float l0 = dot(texture2D(u_tex0, v_texcoord).rgb, W);
    float lx = dot(texture2D(u_tex0, v_texcoord + vec2(px.x * 1.5, 0.0)).rgb, W);
    float ly = dot(texture2D(u_tex0, v_texcoord + vec2(0.0, px.y * 1.5)).rgb, W);
    float edge = length(vec2(lx - l0, ly - l0)) * mix(3.0, 22.0, u_x1);
    float line = smoothstep(0.12, 0.55, edge);

    // exposure: a floor keeps the print faintly there even at zero
    float expo = 0.30 + u_x2 * 1.1;

    // the chemistry, aged by x3: prussian blue fades toward teal, the
    // whites yellow like old paper
    vec3 deep = mix(vec3(0.03, 0.09, 0.30), vec3(0.07, 0.20, 0.23), u_x3);
    vec3 mid  = mix(vec3(0.13, 0.30, 0.58), vec3(0.16, 0.36, 0.42), u_x3);
    vec3 pale = mix(vec3(0.91, 0.95, 0.99), vec3(0.93, 0.90, 0.74), u_x3);

    // blueprint: hard flat washes stepped from the bright parts of the
    // frame, then the linework printed on top
    float wash = step(0.45, l0) * 0.55 + step(0.72, l0) * 0.45;
    vec3 draft = mix(deep, mid, wash);
    draft = mix(draft, pale, line * clamp(expo, 0.0, 1.0));

    // sun print: continuous tone through the same chemistry, exposure
    // lifting the highlights back to paper; a trace of the linework
    // stays so the two ends of the knob feel related
    float tone = clamp(l0 * expo, 0.0, 1.0);
    vec3 photo = mix(mix(deep, mid, clamp(tone * 2.0, 0.0, 1.0)),
                     pale, clamp(tone * 2.0 - 1.0, 0.0, 1.0));
    photo = mix(photo, pale, line * 0.2);

    // paper tooth, very faint
    float d = texture2D(u_dither, v_texcoord * u_resolution / 4.0).r;
    vec3 col = mix(draft, photo, u_x0) * (1.0 + (d - 0.5) * 0.07);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
