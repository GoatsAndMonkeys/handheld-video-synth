// thermal camera: luminance becomes heat through an iron-bow palette
// (black - purple - red - orange - white) or FLIR rainbow, with the
// stepped bands real thermal imagers show. x0 heat, x1 pal, x2 bands,
// x3 floor — cold cutoff: everything below it reads as dead black
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

// both ramps are base + constant deltas — the bands never overlap, so
// this is the same curve the chained mixes drew, at half the maths
vec3 iron(float h) {
    return vec3(0.0, 0.0, 0.06)
         + vec3(0.33, 0.00,  0.47) * smoothstep(0.00, 0.25, h)
         + vec3(0.57, 0.10, -0.38) * smoothstep(0.25, 0.55, h)
         + vec3(0.10, 0.55, -0.15) * smoothstep(0.55, 0.80, h)
         + vec3(0.00, 0.35,  0.80) * smoothstep(0.80, 1.00, h);
}

vec3 flir(float h) {
    return vec3(0.0, 0.0, 0.55)
         + vec3( 0.00,  0.80,  0.35) * smoothstep(0.00, 0.30, h)
         + vec3( 0.10,  0.10, -0.70) * smoothstep(0.30, 0.50, h)
         + vec3( 0.90,  0.05, -0.10) * smoothstep(0.50, 0.70, h)
         + vec3(-0.05, -0.80, -0.05) * smoothstep(0.70, 0.90, h)
         + vec3( 0.05,  0.85,  0.95) * smoothstep(0.90, 1.00, h);
}

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    float l = dot(src, W);
    float heat = clamp((l - 0.5) * (0.6 + u_x0 * 2.2)
                       + 0.5 + (u_x0 - 0.5) * 0.3, 0.0, 1.0);
    heat = max(heat - u_x3 * 0.85, 0.0) / max(1.0 - u_x3 * 0.85, 0.05);
    float steps = mix(64.0, 6.0, u_x2);
    heat = floor(heat * steps + 0.5) / steps;

    // x1 is a uniform, so outside its narrow crossfade only one
    // palette is ever walked
    vec3 c;
    if (u_x1 < 0.45)      c = iron(heat);
    else if (u_x1 > 0.55) c = flir(heat);
    else c = mix(iron(heat), flir(heat), smoothstep(0.45, 0.55, u_x1));

    gl_FragColor = vec4(c, 1.0);
}
