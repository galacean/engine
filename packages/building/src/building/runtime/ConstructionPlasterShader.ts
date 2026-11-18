import { plasterPalette } from "./ConstructionPlasterPalette";
import { constructionPlasterWarpGLSL } from "./ConstructionPlasterWarp";
/** Native texture UV scale, mortar transition and rim-neighbour normal mechanism.
 * Integer noise, octave count and texture offset follow nani_plaster.1.glsl.
 * Effective boundary distance is shared by all host skin paths; game lighting remains scene-owned. */
const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const paletteGLSL = plasterPalette
  .map((rgb, i) => `if(layer < ${i + 0.5}) return vec3(${rgb.map((v) => linear(v).toFixed(9)).join(",")});`)
  .join("\n");
/** Height above the ground, in metres, over which plaster builds up to full cover. */
export const PLASTER_RISE = 4;
export const constructionPlasterTextureGLSL = `
uniform highp sampler2DArray material_PlasterColors;
uniform highp sampler2D material_PlasterMortar;
`;
export const constructionPlasterGLSL = `${constructionPlasterWarpGLSL}

// Original Jenkins/LCG corner noise is shared by body wear and effective-boundary erosion.
highp uint plasterNativeHash(highp uint v) { v+=v<<10u;v^=v>>6u;v+=v<<3u;v^=v>>11u;return v+(v<<15u); }
float plasterNativeCorner(highp ivec2 p) {
 highp uvec2 q=uvec2(p);
 highp uint v=((q.x*1664525u+plasterNativeHash(q.y))+1013904223u)*1664525u;
 v^=v>>11u;v^=(v<<7u)&2636928640u;v^=(v<<15u)&4022730752u;v^=v>>18u;
 return uintBitsToFloat((v&8388607u)|1065353216u)-1.0;
}
float plasterNativeNoise(vec2 p,int octaves) {
 float value=0.0, amplitude=.5;
 for(int i=0;i<5;i++) {
  if(i>=octaves) break;
  highp ivec2 q=ivec2(floor(p));vec2 f=fract(p);f=f*f*(3.0-2.0*f);
  value+=amplitude*(mix(mix(plasterNativeCorner(q),plasterNativeCorner(q+ivec2(1,0)),f.x),
    mix(plasterNativeCorner(q+ivec2(0,1)),plasterNativeCorner(q+ivec2(1)),f.x),f.y)*2.0-1.0);
  amplitude*=.55;p=(p*1.9)*mat2(.8,-.6,.6,.8);
 }
 return value;
}
float plasterNativeOffset(float wallLength) {
 return (uintBitsToFloat((plasterNativeHash(uint(wallLength*1.75))&8388607u)|1065353216u)-1.0)*10.0;
}
// nani_plaster.1.glsl: five octaves at half-metre chart frequency. Coverage
// depends on geometry and authored wear only, never palette, tint or LOD.
vec2 plasterField(vec2 uv,float wear,float wallLength) {
 float offset=plasterNativeOffset(wallLength);
 float seam=smoothstep(max(0.0,wallLength-1.0),wallLength,uv.x);
 float noise=plasterNativeNoise(uv*.5+.5+offset,5);
 if(seam>0.0) noise=mix(noise,plasterNativeNoise(vec2(wallLength-uv.x,uv.y)*.5+.5+offset,5),seam);
 return vec2(noise+wear*.5,smoothstep(0.0,${PLASTER_RISE.toFixed(1)},uv.y));
}
// Returns surviving coverage, continuous mortar exposure, rim height field.
vec3 plasterSurface(vec2 uv,float wear,float wallLength,float boundaryDistance) {
 vec2 field=plasterField(uv,wear,wallLength);
 float edge=clamp(boundaryDistance,0.0,1.0);
 float edgeWeight=1.0-smoothstep(0.0,1.0,edge);
 float offset=plasterNativeOffset(wallLength);
 float erosionNoise=plasterNativeNoise(uv+23.4+offset,3);
 field.x+=edgeWeight*mix(.3,1.0,erosionNoise)*mix(1.0,5.0,edgeWeight);
 float loss=field.x*mix(2.0,2.8,clamp(wear*2.0,0.0,1.0));
 float survives=wear<=0.0 ? step(.1,edge) : (wear>=1.0 ? 0.0 : step(loss,field.y*2.0)*step(.1,edge));
 float a=min(field.y*1.5-.2,.9),b=a+.1;
 float mortar=wear<=0.0 ? 0.0 : smoothstep(a,b,field.x*2.0);
 float rim=wear<=0.0 ? 0.0 : clamp(smoothstep(a-.1,b,field.x*2.0)-mortar,0.0,1.0);
 return vec3(survives,mortar,rim);
}

`;
/** Color and normal only. Use identical UVs/coverage in depth, picking and all LODs. */
export const constructionPlasterFinishGLSL = `${constructionPlasterTextureGLSL}
vec3 plasterPaletteLinear(float layer) { ${paletteGLSL} return vec3(1.0); }
vec3 plasterMortarColor(float layer) {
 if(layer<.5)return vec3(.47663006,.23876892,.17930369);
 if(layer<1.5)return vec3(.36,.32889602,.1656);
 if(layer<2.5)return vec3(.28,.292544,.2512);
 if(layer<3.5)return vec3(.21,.167412,.1281);
 if(layer<4.5)return vec3(.4,.36568,.244);
 if(layer<5.5)return vec3(.27,.35,.27);
 if(layer<6.5)return vec3(.4,.36568,.244);
 return vec3(0.0);
}
vec3 plasterFinish(vec2 uv,vec4 params,vec3 color,vec3 detail,vec3 position,inout vec3 normal) {
 float offset=plasterNativeOffset(params.y);
 vec2 texUV=uv*.1+offset;
 vec3 paint=texture(material_PlasterColors,vec3(texUV,params.z)).rgb;
 float seam=smoothstep(max(0.0,params.y-1.0),params.y,uv.x);
 // Explicit gradients keep the texture sampling well-defined inside the seam branch.
 vec2 tx=dFdx(texUV),ty=dFdy(texUV);
 if(seam>0.0) paint=mix(paint,textureGrad(material_PlasterColors,
   vec3(vec2(params.y-uv.x,uv.y)*.1+offset,params.z),tx*vec2(-1,1),ty*vec2(-1,1)).rgb,seam);
 paint*=color/plasterPaletteLinear(params.z);
 vec3 mortar=plasterMortarColor(params.z)*1.1*texture(material_PlasterMortar,uv*.2).rgb;
 // Native planar normal map is constant, so it needs no sampler. Derive the UV
 // tangent frame from the actual deformed surface (including round walls).
 vec3 px=dFdx(position),py=dFdy(position);
 vec2 ux=dFdx(uv),uy=dFdy(uv);
 float det=ux.x*uy.y-ux.y*uy.x;
 float footprint=max(length(ux),length(uy));
 vec2 ed=vec2(dFdx(params.w),dFdy(params.w));
 vec2 edgeGradient=abs(det)>1e-10 ? vec2(ed.x*uy.y-ed.y*ux.y,ed.y*ux.x-ed.x*uy.x)/det : vec2(0);
 if(detail.z>0.0 && footprint<.25 && abs(det)>1e-10) {
   float du=plasterSurface(uv+vec2(.01,0),params.x,params.y,params.w+.01*edgeGradient.x).z-detail.z;
   float dv=plasterSurface(uv+vec2(0,.01),params.x,params.y,params.w+.01*edgeGradient.y).z-detail.z;
   vec3 tangent=(px*uy.y-py*ux.y)/det;
   vec3 bitangent=(py*ux.x-px*uy.x)/det;
   // A raised finish h(u,v) has outward normal N - grad(h). Our metric UV
   // tangent points along +u; native cross(N,up) points along -u instead.
   // Native tangent*du - up*dv therefore becomes -dPdu*du - dPdv*dv here.
   // Keep the authored wear field intact; only correct its lighting orientation.
   vec3 edge=-normalize(tangent)*du-normalize(bitangent)*dv;
   if(dot(edge,edge)>1e-12) normal=normalize(mix(normal,normalize(edge),
     detail.y*.3*(1.0-smoothstep(.03,.25,footprint))));
 }
 return mix(paint,mortar,detail.y);
}
`;
