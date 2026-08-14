// After spectral_mesh and auto_mesh, Andrei Jay's scan-processing video
// resynthesizers: the picture rewoven as a wire mesh. Horizontal threads
// ride up and down on brightness the way a Rutt/Etra raster does, vertical
// threads shear sideways on the same signal, and where warp meets weft the
// crossings burn additively. A two-directional weave where ruttetra is
// sparse horizontal wire — and, like auto_mesh, the music drives it: bass
// pumps the displacement, highs flare the wire. Clockless; motion comes
// from the picture and the room, not a clock.
//
// x0 density, x1 depth, x2 glow, x3 backdrop
varying vec2 v_texcoord;
uniform sampler2D u_tex0;
uniform float u_x0;
uniform float u_x1;
uniform float u_x2;
uniform float u_x3;
uniform float u_a0;
uniform float u_a2;

void main() {
    const vec3 W = vec3(0.299, 0.587, 0.114);
    vec2 uv = v_texcoord;
    float rows = mix(28.0, 96.0, u_x0);

    // displacement is centred on mid-grey, so a flat field stays a flat
    // grid and shapes bulge both ways out of it; the bass pumps the depth
    float disp = u_x1 * (0.10 + 0.10 * u_a0);

    vec3 src0 = texture2D(u_tex0, uv).rgb;
    float lum0 = dot(src0, W);

    // horizontal threads: quantize the displaced row, then one fixed-point
    // step — sample the thread's own row and let its luma place the wire
    float rowY = (floor((uv.y - disp * (lum0 - 0.5)) * rows) + 0.5) / rows;
    vec3 srcH = texture2D(u_tex0, vec2(uv.x, rowY)).rgb;
    float lumH = dot(srcH, W);
    float dH = (uv.y - rowY - disp * (lumH - 0.5)) * rows;

    // vertical threads: the same trick turned ninety degrees
    float colX = (floor((uv.x - disp * (lum0 - 0.5)) * rows) + 0.5) / rows;
    vec3 srcV = texture2D(u_tex0, vec2(colX, uv.y)).rgb;
    float lumV = dot(srcV, W);
    float dV = (uv.x - colX - disp * (lumV - 0.5)) * rows;

    // distances live in row units so the falloff maths stays well away
    // from mediump's floor even at the tightest weave
    float wr = 0.10 + u_x2 * 0.45;
    float k = wr * wr;
    float iH = exp(-dH * dH / k);
    float iV = exp(-dV * dV / k);

    float hot = 1.4 + u_a2 * 1.2;
    vec3 mesh = (srcH * 0.6 + 0.4) * (0.2 + lumH) * iH * hot
              + (srcV * 0.6 + 0.4) * (0.2 + lumV) * iV * hot;

    gl_FragColor = vec4(clamp(mesh + src0 * u_x3 * 0.45, 0.0, 1.0), 1.0);
}
