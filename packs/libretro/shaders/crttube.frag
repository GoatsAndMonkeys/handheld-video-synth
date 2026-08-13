//
// PUBLIC DOMAIN CRT STYLED SCAN-LINE SHADER
//
//   by Timothy Lottes
//
// This is more along the style of a really good CGA arcade monitor.
// With RGB inputs instead of NTSC.
// The shadow mask example has the mask rotated 90 degrees for less chromatic aberration.
//
// Left it unoptimized to show the theory behind the algorithm.
//
// It is an example what I personally would want as a display option for pixel art games.
// Please take and use, change, or whatever.
//
// Source: libretro/common-shaders, crt/shaders/crt-lottes.cg
// Ported to the HVS-80 shader convention (single pass, GLES2, 3 params).
// Reduced for a VideoCore IV at 640x480: Warp(), Mask() (shadowMask 1, the
// compressed TV mask) and the Gaus/Scan scanline weighting are kept verbatim
// in spirit; the 11-tap Tri() filter is cut to 3 vertical taps and the 31-tap
// Bloom() is approximated from those same 3 taps with constant weights.
// The sRGB linearise/delinearise pow() pair is dropped (scaleInLinearGamma 0).
// x0 warp (tube curvature), x1 mask (shadow mask depth), x2 glow (bloom)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

// hardcoded from the original #pragma parameters
#define hardScan    -8.0
#define maskLight    1.5
#define brightboost  1.45
#define LINES      240.0

// 1D Gaussian with shape = 2.0, so pow(abs(pos), shape) folds to pos*pos
float Gaus(float pos, float scale) { return exp2(scale * pos * pos); }

// Distortion of scanlines, and end of screen alpha.
vec2 Warp(vec2 pos, vec2 warp) {
    pos = pos * 2.0 - 1.0;
    pos *= vec2(1.0 + (pos.y * pos.y) * warp.x, 1.0 + (pos.x * pos.x) * warp.y);
    return pos * 0.5 + 0.5;
}

// Shadow mask - "very compressed TV style" (original shadowMask == 1)
vec3 Mask(vec2 pos, float maskDark) {
    vec3 mask = vec3(maskDark);
    float mask_line = maskLight;
    float odd = 0.0;
    if (fract(pos.x / 6.0) < 0.5) odd = 1.0;
    if (fract((pos.y + odd) / 2.0) < 0.5) mask_line = maskDark;
    pos.x = fract(pos.x / 3.0);
    if (pos.x < 0.333) mask.r = maskLight;
    else if (pos.x < 0.666) mask.g = maskLight;
    else mask.b = maskLight;
    return mask * mask_line;
}

void main() {
    vec2 warp = vec2(0.031, 0.041) * (u_x0 * 4.0);
    float maskDark = mix(1.0, 0.25, u_x1);
    float bloomAmount = u_x2 * 0.55;

    vec2 pos = Warp(v_texcoord, warp);

    // off-tube area is black glass
    vec2 edge = step(vec2(0.0), pos) * step(pos, vec2(1.0));
    float inside = edge.x * edge.y;

    // three nearest scanlines, snapped to line centres
    float lp = pos.y * LINES;
    float li = floor(lp) + 0.5;
    float dst = -(lp - li);              // Dist() on the y axis
    float oneLine = 1.0 / LINES;
    vec2 c = vec2(pos.x, (li) * oneLine);

    vec3 a = texture2D(u_tex0, vec2(c.x, c.y - oneLine)).rgb * brightboost;
    vec3 b = texture2D(u_tex0, c).rgb * brightboost;
    vec3 d = texture2D(u_tex0, vec2(c.x, c.y + oneLine)).rgb * brightboost;

    float wa = Gaus(dst - 1.0, hardScan);
    float wb = Gaus(dst,       hardScan);
    float wd = Gaus(dst + 1.0, hardScan);
    vec3 outColor = a * wa + b * wb + d * wd;

    // Bloom(): the wide BloomScan gaussian is near-flat over 3 lines
    outColor += (a * 0.25 + b * 0.5 + d * 0.25) * bloomAmount;

    // The original runs the mask at 1080p+ where it costs little light. At
    // 640x480 one mask cell is one output pixel, so deep masks black the
    // picture out; normalise to unit mean so `mask` redistributes light
    // between the phosphors instead of removing it.
    float meanMask = ((maskLight + 2.0 * maskDark) / 3.0)
                   * ((maskLight + maskDark) * 0.5);
    outColor *= Mask(floor(v_texcoord * u_resolution) + 0.5, maskDark) / meanMask;

    gl_FragColor = vec4(outColor * inside, 1.0);
}
