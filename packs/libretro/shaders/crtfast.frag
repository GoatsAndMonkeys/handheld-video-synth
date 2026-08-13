/*
    zfast_crt_standard - A simple, fast CRT shader.
    Copyright (C) 2017 Greg Hogan (SoltanGris42)
    This program is free software; you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by the Free
    Software Foundation; either version 2 of the License, or (at your option)
    any later version.
Notes:  This shader does scaling with a weighted linear filter for adjustable
	sharpness on the x and y axes based on the algorithm by Inigo Quilez here:
	http://http://www.iquilezles.org/www/articles/texture/texture.htm
	but modified to be somewhat sharper.  Then a scanline effect that varies
	based on pixel brighness is applied along with a monochrome aperture mask.
	This shader runs at 60fps on the Raspberry Pi 3 hardware at 2mpix/s
	resolutions (1920x1080 or 1600x1200).
*/
// Source: libretro/common-shaders, crt/shaders/zfast_crt.cg
// Ported to the HVS-80 shader convention (single pass, GLES2, 3 params).
// The libretro vertex stage is folded in; the emulator's fixed texture_size
// becomes a live "lines" param so the scanline pitch is performable.
// x0 lines (scanline pitch), x1 scan (scanline darkness), x2 mask (aperture)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

// hardcoded from the original #pragma parameters
#define BLURSCALEX  0.30
#define BRIGHTBOOST 1.25
#define MASK_FADE   0.8

void main() {
    // virtual scanline count stands in for the emulator's texture_size.y
    float lines = floor(mix(90.0, 480.0, u_x0 * u_x0));
    float LOWLUMSCAN = mix(0.5, 10.0, u_x1);
    float HILUMSCAN  = mix(1.0, 22.0, u_x1);
    float MASK_DARK  = u_x2 * 0.6;
    float maskFade   = 0.333 * MASK_FADE;

    vec2 texsz = vec2(u_resolution.x * 0.5, lines);
    vec2 invDims = 1.0 / texsz;

    // "Quilez scaling" but sharper - snaps toward texel centres
    vec2 p = v_texcoord * texsz;
    vec2 i = floor(p) + 0.50;
    vec2 f = p - i;
    p = (i + 4.0 * f * f * f) * invDims;
    p.x = mix(p.x, v_texcoord.x, BLURSCALEX);
    float Y = f.y * f.y;
    float YY = Y * Y;

    // FINEMASK: monochrome aperture grille, one dark column every other pixel
    float whichmask = fract(v_texcoord.x * u_resolution.x * -0.4999);
    // original: 1.0 + float(whichmask < 0.5) * -MASK_DARK
    float mask = 1.0 + (1.0 - step(0.5, whichmask)) * -MASK_DARK;

    vec3 colour = texture2D(u_tex0, p).rgb;

    float scanLineWeight  = (BRIGHTBOOST - LOWLUMSCAN * (Y - 2.05 * YY));
    float scanLineWeightB = 1.0 - HILUMSCAN * (YY - 2.8 * YY * Y);

    gl_FragColor = vec4(colour * mix(scanLineWeight * mask, scanLineWeightB,
                                     dot(colour, vec3(maskFade))), 1.0);
}
