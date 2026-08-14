// datamosh: the motion vectors keep arriving but the keyframes never
// do. where the picture still matches its own displaced past the block
// smears along the old vector; where the residual is too big, fresh
// video punches a hole through the mush.
// x0 smear (how long the mosh holds), x1 push (block motion), x2 punch,
// x3 iframe — at 0 the keyframes never arrive at all; wind it up and one
// lands every so often, clearing the buffer everywhere at once so the
// clean picture flashes back for a frame and the mosh starts over
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;   // previous output = the decoded buffer
uniform float u_time;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    vec2 blk = floor(v_texcoord * vec2(20.0, 15.0)) + floor(u_time * 1.6);
    vec2 mv = (vec2(hash(blk), hash(blk + 31.7)) - 0.5) * (0.004 + u_x1 * 0.06);

    vec3 src = texture2D(u_tex0, v_texcoord).rgb;
    vec3 prev = texture2D(u_tex1, fract(v_texcoord + mv)).rgb * 0.995;

    // residual too big to fake: let the i-frame through
    float d = abs(dot(src, W) - dot(prev, W));
    float k = clamp((d - (0.55 - u_x2 * 0.5)) * 7.0, 0.0, 1.0);
    float ir = step(0.02, u_x3)
             * step(fract(u_time * (0.12 + u_x3 * 2.2)), 0.02 + u_x3 * 0.05);
    gl_FragColor = vec4(mix(mix(src, mix(prev, src, k), u_x0 * 0.98), src, ir),
                        1.0);
}
