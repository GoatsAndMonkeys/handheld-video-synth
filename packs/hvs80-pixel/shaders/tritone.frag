// Three-tone poster: black, one colour of your choosing, and white.
// CGA's discipline without CGA's fixed palette — the picture is cut into
// three flat tones by brightness, dithered at the edges so gradients
// stipple instead of banding. x0 picks the middle colour (0.14 is a
// screenprint yellow), x1 pixel size, x2 dither, x3 where the cuts fall.
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_dither;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

// hue -> full-saturation rgb without trig: three shifted triangle waves
vec3 hue2rgb(float h) {
    vec3 k = mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0);
    return clamp(abs(k - 3.0) - 1.0, 0.0, 1.0);
}

void main() {
    float px = mix(320.0, 48.0, u_x1);
    vec2 grid = vec2(px, px * u_resolution.y / u_resolution.x);
    vec2 cell = floor(v_texcoord * grid);
    vec3 src = texture2D(u_tex0, (cell + 0.5) / grid).rgb;

    float l = dot(src, vec3(0.299, 0.587, 0.114));
    // ordered dither before the cut: the stipple lands on the boundaries
    float bay = texture2D(u_dither, cell / 4.0).r;
    l += (bay - 0.5) * u_x2 * 0.55;

    // balance slides both cuts: low = mostly white, high = mostly black
    float b = (u_x3 - 0.5) * 0.45;
    float lo = 0.30 + b;
    float hi = 0.68 + b;

    vec3 ink = hue2rgb(u_x0);
    vec3 c = mix(vec3(0.0), ink, step(lo, l));
    c = mix(c, vec3(1.0), step(hi, l));
    gl_FragColor = vec4(c, 1.0);
}
