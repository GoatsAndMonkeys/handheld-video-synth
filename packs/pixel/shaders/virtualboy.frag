// Virtual Boy: the whole picture in four shades of LED red on black —
// Nintendo's 1995 headache machine drew everything with one row of red
// LEDs swept across the eye by a vibrating mirror, so the image is pure
// 660nm with dark seams between the scanned rows. Luma quantized to four
// levels drives the red; a second sample shifted sideways is the stereo
// half your other eye was supposed to get. Clockless — nothing moves
// until the picture does. Bass flares the brightest shade.
//
// x0 pixel size, x1 scanline depth, x2 parallax ghost, x3 red heat
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;

void main() {
    float px = mix(224.0, 72.0, u_x0);
    vec2 grid = vec2(px, px * u_resolution.y / u_resolution.x);
    vec2 p = v_texcoord * grid;
    vec2 cell = floor(p);
    vec3 src = texture2D(u_tex0, (cell + 0.5) / grid).rgb;
    float lum = dot(src, vec3(0.299, 0.587, 0.114));

    // the unfused double image: same picture a few cells to the left,
    // kept dimmer so it reads as a ghost and not a smear
    float off = floor(u_x2 * 6.0);
    vec3 gsrc = texture2D(u_tex0, (cell + vec2(off, 0.0) + 0.5) / grid).rgb;
    float glum = dot(gsrc, vec3(0.299, 0.587, 0.114));
    lum = max(lum, glum * min(u_x2 * 1.4, 0.6));

    // four shades: black, dark, mid, bright — the LED had exactly these
    float shade = floor(lum * 3.999) / 3.0;

    // heat bends the response: cold squares the curve (embers on black),
    // hot lifts it toward the LED running flat out
    float v = mix(shade * shade, sqrt(shade), u_x3);
    v *= mix(0.55, 1.0, u_x3);
    // bass punches only the top shade, like the display overdriving
    v += u_a0 * 0.35 * step(0.83, shade);

    // the dark seams between mirror-scanned rows
    float e = abs(fract(p.y) - 0.5);
    v *= 1.0 - u_x1 * 0.85 * step(0.35, e);

    v = clamp(v, 0.0, 1.0);
    // pure red, with the faintest orange lean when run hot
    gl_FragColor = vec4(v, v * v * u_x3 * 0.12, 0.0, 1.0);
}
