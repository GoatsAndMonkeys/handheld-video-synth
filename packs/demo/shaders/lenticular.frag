// Lenticular: the ridged-plastic postcard. Vertical slats act as the
// lenses; a virtual viewing angle sweeps slowly across them, and where
// each ridge sits against that angle it shows the live picture, the
// half-depth echo or the deep tap from the delay ring — tilting past the
// ridges flips the picture between moments, the wiggle-card trick with
// time as the second print. A specular line rides each ridge as the card
// turns, and bass rocks it in your hand.
//
// x0 slat width, x1 sweep speed, x2 time spread, x3 glint
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex2;   // delay ring, deep tap
uniform sampler2D u_tex3;   // delay ring, half depth
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;

// cheap sine on a unit period: sw(x) ~ sin(2*pi*x)
float sw(float x) { float t = fract(x) - 0.5; return 16.0 * t * (abs(t) - 0.5); }

void main() {
    // ~5 px ribs up to ~50 px slats on the 640-wide surface
    float w = 0.008 + u_x0 * 0.072;
    float fx = fract(v_texcoord.x / w);

    // the card rocks: a slow sweep whose rate is the knob, plus bass
    float rate = 0.02 + u_x1 * 0.30;
    float tilt = sw(u_time * rate) * 0.9 + u_a0 * 0.35 * sw(u_time * 1.6);
    tilt = clamp(tilt, -1.2, 1.2);

    // viewing angle per ridge: the ridge's own slope fans the view out,
    // so mid-sweep the slats hold different moments side by side
    float view = 0.5 + tilt * 0.5 + (fx - 0.5) * 0.38;

    vec3 live = texture2D(u_tex0, v_texcoord).rgb;
    vec3 mid  = texture2D(u_tex3, v_texcoord).rgb;
    vec3 old  = texture2D(u_tex2, v_texcoord).rgb;
    // spread pulls the past facets toward now when it is low
    mid = mix(live, mid, u_x2);
    old = mix(live, old, u_x2);

    // three facets per ridge, soft edges so the flip reads as a roll
    float s1 = smoothstep(0.30, 0.37, view);
    float s2 = smoothstep(0.63, 0.70, view);
    vec3 pic = mix(old, mid, s1);
    pic = mix(pic, live, s2);

    // plastic: a thin highlight sliding across each ridge with the tilt,
    // and a faint seam shadow where the slats meet
    float hi = 1.0 - smoothstep(0.0, 0.10, abs(fx - clamp(0.5 - tilt * 0.35, 0.06, 0.94)));
    float seam = smoothstep(0.86, 1.0, abs(fx - 0.5) * 2.0);
    pic += u_x3 * hi * 0.55;
    pic *= 1.0 - u_x3 * seam * 0.30;

    gl_FragColor = vec4(clamp(pic, 0.0, 1.0), 1.0);
}
