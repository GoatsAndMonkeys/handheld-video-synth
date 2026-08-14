// from langolierz/r_e_c_u_r Shaders/2-input/mix_lumaKey.frag (GPL-3.0)
// HVS-80 port edits: the original is in the older conjur convention, so the
// varying and samplers are renamed to this engine's (tcoord -> v_texcoord,
// tex -> u_tex0, tex2 -> u_tex1); the declarations of the unused resolution,
// int-params, and the two clock uniforms are dropped; the f0/f1/f2 helper
// values moved from global initialisers into main() — GLSL ES 1.00 only
// allows constant expressions as global initialisers. Everything else is as
// written, driven through the engine's legacy fparams binding. On this
// engine the second texture input is the feedback buffer — the previous
// output frame — so the keyed band fills with trails.
//2-input

varying vec2 v_texcoord;   //
uniform sampler2D u_tex0;  // texture one
uniform sampler2D u_tex1;  // texture two
uniform vec4 fparams;      // 4 floats coming in
//f0:key luma:
//f1:key range:
//f2:edge opacity:

//---------------------------------------------------------------------------------------------------

vec3 rgb2hsv(vec3 c)
{
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c)
{
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}



void main() {

   float f0 = mix(0.0, 1.0, fparams[0]);
   float f1 = mix(0.0, 0.5, fparams[1]);
   float f2 = mix(0.0, 1.0, fparams[2]);

   vec3 outc;
   vec4 base  = texture2D(u_tex0, v_texcoord.xy);
   vec4 blend = texture2D(u_tex1, v_texcoord.xy);

   vec3 hsv = rgb2hsv(base.rgb);

   if( (hsv.z > (f0-f1)) && (hsv.z < (f0+f1)) ){
      if(hsv.z-(f0-f1) < f2){
         outc = mix(base.rgb,blend.rgb,(hsv.z-(f0-f1))/f2);
      } else if((f0+f1)-hsv.z < f2){
         outc = mix(base.rgb,blend.rgb,((f0+f1)-hsv.z)/f2);
      } else {
         outc = blend.rgb;
      }


   } else {
      outc = base.rgb;
   }




   gl_FragColor=vec4(outc,1.0);

}
