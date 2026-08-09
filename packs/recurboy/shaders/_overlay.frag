// UI overlay strip, drawn scissored to the bottom of the screen
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec2 u_resolution;
uniform float u_strip;

void main() {
    vec2 uv = vec2(v_texcoord.x, v_texcoord.y / u_strip);
    gl_FragColor = vec4(texture2D(u_tex0, uv).rgb, 1.0);
}
