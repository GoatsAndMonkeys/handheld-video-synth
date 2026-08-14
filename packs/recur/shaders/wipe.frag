// from langolierz/r_e_c_u_r Shaders/2-input/wipe.frag (GPL-3.0)
// HVS-80 port edits: dropped the declarations of the unused clock uniform and
// the unused fourth-knob uniform so the bar shows only live controls. On this
// engine the second texture input is the feedback buffer — the previous
// output frame — so the wipe splits the screen between now and a beat ago.
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


void main(){

    vec2 pos = v_texcoord;
    vec4 texColour0 = texture2D(u_tex0, v_texcoord);
    vec4 texColour1 = texture2D(u_tex1, v_texcoord);

    vec4 colour;

    if(v_texcoord.x > u_x0 && v_texcoord.y > u_x1){colour = texColour0;}
    else {colour = texColour1;}


    gl_FragColor = colour;

}
