// UI text panel, drawn scissored to a screen rectangle.
// u_rect = (origin x, origin y, width, height) as fractions of the screen.
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform vec4 u_rect;

void main() {
    vec2 uv = (v_texcoord - u_rect.xy) / u_rect.zw;
    gl_FragColor = vec4(texture2D(u_tex0, uv).rgb, 1.0);
}
