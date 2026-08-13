///////////////
//	TV-out tweaks
//	Author: aliaspider - aliaspider@gmail.com
//	License: GPLv3
////////////////////////////////////////////////////////
// this shader is meant to be used when running
// an emulator on a real CRT-TV @240p or @480i
//
// these values will be used instead
// if COMPOSITE_CONNECTION is defined
// to simulate different signal resolutions(bandwidth)
// for luma (Y) and chroma ( I and Q )
// this is just an approximation
// and will only simulate the low bandwidth anspect of
// composite signal, not the crosstalk between luma and chroma
// Y = 4MHz I=1.3MHz Q=0.4MHz
// formula is MHz=resolution*15750Hz
// 15750Hz being the horizontal Frequency of NTSC
// (=262.5*60Hz)
////////////////////////////////////////////////////////
// Source: libretro/common-shaders, crt/shaders/tvout-tweaks.cg
// Ported to the HVS-80 shader convention (single pass, GLES2, 3 params).
// The composite path is kept: sample horizontally, convert to YIQ, then give
// Y, I and Q different bandwidths so colour smears sideways while luma stays
// sharp. Reduced for a VideoCore IV: the original's four taps become three,
// and STU() - the windowed-sinc reconstruction filter, two sin() per tap per
// component, twenty-four sin() per pixel - is replaced by placing the taps at
// the bandwidth distance and blending, which lands in the same place far
// cheaper. TV colour levels (16-235) become a continuous knob.
// x0 band (luma bandwidth), x1 bleed (chroma bandwidth), x2 levels (TV range)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

const mat3 RGB_to_YIQ = mat3(0.299,     0.595716,  0.211456,
                             0.587,    -0.274453, -0.522591,
                             0.114,    -0.321263,  0.311135);
const mat3 YIQ_to_RGB = mat3(1.0,       1.0,       1.0,
                             0.9563,   -0.2721,   -1.1070,
                             0.6210,   -0.6474,    1.7046);

// L()/LCHR(): squeeze full-range 0-255 into TV's 16-235 / 16-240
vec3 LEVELS(vec3 c0, float amt) {
    vec3 tv = clamp((c0 - 16.5 / 256.0) * 256.0 / (236.0 - 16.0), 0.0, 1.0);
    return mix(c0, tv, amt);
}

void main() {
    // signal resolution: 0 = sharp RGB scart, 1 = the RF-modulator mush
    float mush  = u_x0;
    float bleed = u_x1;
    float lumaW   = mix(0.7,  9.0, mush)  / u_resolution.x;
    float chromaW = mix(2.0, 30.0, bleed) / u_resolution.x;

    vec3 c0 = LEVELS(texture2D(u_tex0, v_texcoord).rgb, u_x2);
    vec3 cA = LEVELS(texture2D(u_tex0, v_texcoord + vec2(lumaW, 0.0)).rgb, u_x2);
    vec3 cB = LEVELS(texture2D(u_tex0, v_texcoord - vec2(chromaW, 0.0)).rgb, u_x2);

    vec3 y0 = RGB_to_YIQ * c0;
    vec3 yA = RGB_to_YIQ * cA;
    vec3 yB = RGB_to_YIQ * cB;

    // Y keeps the narrow window; I and Q are pulled from far to the left, so
    // colour lags and spreads to the right of every edge exactly as a
    // low-bandwidth composite decoder does. Q is narrower than I.
    float Y = mix(y0.x, (y0.x + yA.x) * 0.5, mush);
    vec2 IQ = mix(y0.yz, yB.yz, 0.25 + 0.5 * bleed);
    IQ.y = mix(IQ.y, yB.z, 0.3);

    gl_FragColor = vec4(YIQ_to_RGB * vec3(Y, IQ), 1.0);
}
