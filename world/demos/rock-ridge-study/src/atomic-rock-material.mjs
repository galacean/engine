// Port of the atomic generator's RockSurfaceColor.glsl and Projection.glsl at
// galacean/engine b2887feee34df433303d1c3197a679e4c219367d (MIT).
// Marble Cliff 05 by Amal Kumar / Poly Haven (CC0); use the original 1K pair.
export const ORIGINAL_ROCK_PRESENTATION='atomic-rock-triplanar-1';
export const ATOMIC_ROCK_TEXTURE_ROOT='https://cdn.jsdelivr.net/gh/galacean/engine@b2887feee34df433303d1c3197a679e4c219367d/world/demos/procedural-rock/assets/';

export function loadAtomicRockTextures(THREE,anisotropy,onLoad,onError){
 function load(name,colorSpace){
  const texture=new THREE.TextureLoader().load(ATOMIC_ROCK_TEXTURE_ROOT+name,onLoad,undefined,onError);
  texture.colorSpace=colorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=true;
  texture.anisotropy=Math.min(4,anisotropy);
  return texture;
 }
 return {base:load('marble_cliff_05_disp_1k.png',THREE.SRGBColorSpace),normal:load('marble_cliff_05_nor_gl_1k.png',THREE.NoColorSpace)};
}

// Same automatic tiling rule as the generator, applied to each fitted world OBB.
export function atomicRockTileMeters(rock,geometry){
 const p=geometry.parameters;
 return Math.max(.02,p.obbWidth*rock.scale*(rock.longitudinalScale??1),p.obbHeight*rock.scale*(rock.verticalScale??1),p.obbDepth*rock.scale*(rock.lateralScale??1))/2;
}

export function applyAtomicRockTexture(material,textures,tileMeters){
 material.color.set('#b8bcc2');
 material.roughness=1;
 material.onBeforeCompile=shader=>{
  shader.uniforms.atomicRockBase={value:textures.base};
  shader.uniforms.atomicRockNormal={value:textures.normal};
  shader.uniforms.atomicRockTileMeters={value:tileMeters};
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\nvarying vec3 vAtomicRockWorld; varying vec3 vAtomicRockNormal;')
   .replace('#include <defaultnormal_vertex>','#include <defaultnormal_vertex>\nvAtomicRockNormal=inverseTransformDirection(transformedNormal,viewMatrix);')
   .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvAtomicRockWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>',`#include <common>
varying vec3 vAtomicRockWorld; varying vec3 vAtomicRockNormal;
uniform sampler2D atomicRockBase; uniform sampler2D atomicRockNormal;
uniform float atomicRockTileMeters;
vec3 atomicRockGradient(vec3 sampleNormal,vec3 tangent,vec3 bitangent){
 vec3 n=sampleNormal*2.0-1.0;
 return -(tangent*n.x+bitangent*n.y)/max(n.z,0.1);
}
`)
   .replace('#include <color_fragment>',`#include <color_fragment>
vec3 arN=normalize(vAtomicRockNormal),arP=vAtomicRockWorld/max(atomicRockTileMeters,0.01);
vec3 arSigns=vec3(arN.x<0.0?-1.0:1.0,arN.y<0.0?-1.0:1.0,arN.z<0.0?-1.0:1.0);
vec3 arWeights=pow(abs(arN),vec3(4.0));
arWeights/=max(dot(arWeights,vec3(1.0)),0.00001);
vec2 arUvX=vec2(-arSigns.x*arP.z,arP.y);
vec2 arUvY=vec2(arP.x,-arSigns.y*arP.z);
vec2 arUvZ=vec2(arSigns.z*arP.x,arP.y);
vec3 arColor=texture2D(atomicRockBase,arUvX).rgb*arWeights.x
 +texture2D(atomicRockBase,arUvY).rgb*arWeights.y
 +texture2D(atomicRockBase,arUvZ).rgb*arWeights.z;
diffuseColor.rgb*=vec3(dot(arColor,vec3(0.2126,0.7152,0.0722)));
`)
   .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
vec3 arGradient=atomicRockGradient(texture2D(atomicRockNormal,arUvX).rgb,
 vec3(0.0,0.0,-arSigns.x),vec3(0.0,1.0,0.0))*arWeights.x
 +atomicRockGradient(texture2D(atomicRockNormal,arUvY).rgb,
 vec3(1.0,0.0,0.0),vec3(0.0,0.0,-arSigns.y))*arWeights.y
 +atomicRockGradient(texture2D(atomicRockNormal,arUvZ).rgb,
 vec3(arSigns.z,0.0,0.0),vec3(0.0,1.0,0.0))*arWeights.z;
arGradient-=arN*dot(arN,arGradient);
normal=normalize(mat3(viewMatrix)*normalize(arN-0.35*arGradient));
`);
 };
 material.customProgramCacheKey=()=>ORIGINAL_ROCK_PRESENTATION;
 return material;
}
