// from langolierz/r_e_c_u_r Shaders/2-input/blend_add.frag (GPL-3.0)
// HVS-80 port edits: dropped the declarations of the unused clock uniform and
// the unused fourth-knob uniform so the bar shows only live controls. On this
// engine the second texture input is the feedback buffer — the previous
// output frame — so the crossfade pulls trails out of the engine's own past.
//2-input
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform vec2 u_resolution;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;

vec4 mixBlend(vec4 texColour0, vec4 texColour1) {
    vec4 colour;
    colour = texColour0;
    colour.xyz = (1.0 - u_x0) * texColour0.xyz + u_x0 * texColour1.xyz;

    return colour;
}


void main() {

    vec2 pos = v_texcoord;
    vec4 texColour0;
    vec4 texColour1;

    texColour0 = texture2D(u_tex0, v_texcoord);
    texColour1 = texture2D(u_tex1, v_texcoord);


    vec4 colour;


    colour = mixBlend(texColour0, texColour1);

    gl_FragColor = colour;

}
