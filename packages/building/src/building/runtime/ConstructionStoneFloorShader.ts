/** Pattern 0 of retained nani_roof_floor.1.glsl: original height, seed, normal,
 * roughness and brick palette. The host supplies a bounded parallax search and
 * its scene lighting; it does not claim the original temporal raymarch/depth ABI.
 * Shared by resident and distance views so a LOD switch cannot change paving. */
export const constructionStoneFloorGLSL = `
uniform highp sampler2D material_StoneFloorNormal;
uniform highp sampler2D material_StoneFloorHeight;
uniform highp sampler2D material_StoneFloorSeed;
uniform highp sampler2D material_StoneFloorRoughness;
uniform highp sampler2DArray material_StoneFloorPalette;
float stoneFloorHash(uint x) { x+=x<<10u; x^=x>>6u; x+=x<<3u; x^=x>>11u; x+=x<<15u;
 return uintBitsToFloat((x&8388607u)|1065353216u)-1.0; }
vec3 stoneFloorPalette(vec2 uv,float color,float variation) {
 float layer=0.0, weight=.9;
 if(color==1.0 || color==5.0) {layer=1.0;weight=1.0;}
 else if(color==2.0 || color==7.0) {layer=2.0;weight=1.3*mix(1.0,1.3,variation);}
 else if(color==3.0 || color==6.0 || color==8.0 || color==9.0) {layer=3.0;weight=.9*mix(1.0,1.1,variation);}
 else if(color==11.0) {layer=4.0;weight=mix(1.0,1.4,variation);}
 return texture(material_StoneFloorPalette,vec3(uv,layer)).rgb*weight;
}
vec3 stoneFloorFinish(vec2 chart,vec4 transform,float color,vec3 position,vec3 cameraPosition,inout vec3 normal,out float roughness) {
 vec2 uv=chart*transform.xy+transform.zw;
 vec2 ux=dFdx(uv),uy=dFdy(uv);
 vec3 px=dFdx(position),py=dFdy(position);
 float det=ux.x*uy.y-ux.y*uy.x;
 vec3 tangent=abs(det)>1e-12 ? (px*uy.y-py*ux.y)/det : vec3(1,0,0);
 vec3 bitangent=abs(det)>1e-12 ? (py*ux.x-px*uy.x)/det : vec3(0,0,1);
 vec3 view=cameraPosition-position;
 // UV vectors are metres/texture-repeat; retain their metric lengths for POM.
 float vz=max(.1,dot(normal,normalize(view)));
 vec2 ray=vec2(dot(normalize(view),normalize(tangent))/max(length(tangent),.001),
               dot(normalize(view),normalize(bitangent))/max(length(bitangent),.001))*.075/vz;
 float layer=0.0, previous=0.0, height=1.0;
 vec2 sampleUV=uv;
 // Fade subpixel parallax without changing the stone identity or color field.
 ray*=1.0-smoothstep(.005,.025,max(length(ux),length(uy)));
 for(int i=0;i<12;i++) {
   height=1.0-textureGrad(material_StoneFloorHeight,sampleUV,ux,uy).r;
   if(layer>=height)break;
   previous=layer-height;layer+=1.0/12.0;sampleUV=uv-ray*layer;
 }
 float after=layer-height;
 float blend=clamp(after/max(after-previous,1e-6),0.0,1.0);
 sampleUV+=ray*(blend/12.0);
 vec3 seed=textureGrad(material_StoneFloorSeed,sampleUV,ux,uy).rgb;
 uint id=uint(int(trunc(seed.x*32.0-.5)+trunc(seed.y*32.0-.5)));
 vec2 random=vec2(stoneFloorHash(id^7993234u),stoneFloorHash(id^9730541u));
 float r=textureGrad(material_StoneFloorRoughness,sampleUV,ux,uy).r;
 float h=textureGrad(material_StoneFloorHeight,sampleUV,ux,uy).r;
 vec3 mapped=textureGrad(material_StoneFloorNormal,sampleUV,ux,uy).rgb*2.0-1.0;
 mapped.z*=.13333332538604736;
 normal=normalize(tangent/max(dot(tangent,tangent),1e-8)*mapped.x+bitangent/max(dot(bitangent,bitangent),1e-8)*mapped.y+normal*mapped.z);
 roughness=mix(.75,1.0,r)*mix(.8,1.0,random.y);
 return stoneFloorPalette(position.xz*.1+random*.3+seed.z*.5+r*.1,color,seed.z)*.8*mix(.7,1.0,h);
}
`;
