/*
    Response Time
    Based on the response time function from Harlequin's Game Boy and LCD shaders

    This program is free software; you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by the Free
    Software Foundation; either version 2 of the License, or (at your option)
    any later version.
*/
// Source: libretro/common-shaders, motionblur/shaders/response-time.cg
// Ported to the HVS-80 shader convention (single pass, GLES2, 3 params).
// The original reads seven history buffers (PREV..PREV6) and weights them by
// pow(response_time, 1..7) - an exponential dropoff built as a 7-tap FIR. We
// have one history texture (u_tex1, the previous output of this layer), and
// feeding our own output back makes the same exponential an IIR with infinite
// taps: no pow(), no seven fetches, same decay curve. Two params are ours:
// real panels lag asymmetrically (dark->light drags), and the smear streaks.
// x0 resp (response time), x1 asym (dark/light lag balance), x2 smear (streak)
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output frame
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);

    vec3 input_rgb = texture2D(u_tex0, v_texcoord).rgb;
    vec3 prev = texture2D(u_tex1, v_texcoord).rgb;

    // the smear: the trailing image is dragged sideways a little
    float sm = u_x2 * 0.03;
    vec3 prevS = texture2D(u_tex1, v_texcoord - vec2(sm, 0.0)).rgb;
    prev = mix(prev, max(prev, prevS), u_x2);

    // response_time: 0 = instant panel, 1 = long ghosting
    float response_time = u_x0 * 0.94;

    // asymmetry - dark->light transitions lag more than light->dark as asym
    // rises, which is the direction real LCD smear runs
    float rising = step(dot(prev, W), dot(input_rgb, W));
    float asym = (u_x1 - 0.5) * 0.5;
    float r = clamp(response_time + asym * (rising * 2.0 - 1.0), 0.0, 0.985);

    // exponential dropoff, one tap: out += (prev - out) * r
    gl_FragColor = vec4(input_rgb + (prev - input_rgb) * r, 1.0);
}
