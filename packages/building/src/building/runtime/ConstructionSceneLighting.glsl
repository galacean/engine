#ifndef MASONRY_SCENE_LIGHTING_INCLUDED
#define MASONRY_SCENE_LIGHTING_INCLUDED
#include "ShaderLibrary/Common/Common.glsl"
#include "ShaderLibrary/Common/Transform.glsl"
#include "ShaderLibrary/Common/Fog.glsl"
#include "ShaderLibrary/Shadow/Shadow.glsl"
#include "ShaderLibrary/Lighting/VolumetricCloudShadow.glsl"
#include "ShaderLibrary/PBR/VaryingsPBR.glsl"
#include "ShaderLibrary/PBR/LightDirectPBR.glsl"
#include "ShaderLibrary/PBR/LightIndirectPBR.glsl"

// Building-owned light metadata is refreshed at the camera boundary, after the
// scene has packed its point-light list. Masks encode identity, never position.
int scene_MasonryPointMask;
int scene_MasonryLegacyMask;
int scene_MasonryFallbackMask;
vec4 scene_MasonryLightPositionRange[8];
vec4 scene_MasonryLightColorIntensity[8];

void masonryPointRadiance(Varyings v, SurfaceData s, BSDFData bsdf, vec3 legacyNormal,
    vec3 color, vec3 position, float range, bool pbr, bool legacy,
    inout vec3 diffuse, inout vec3 specular) {
    if ((pbr || legacy) && any(notEqual(color,vec3(0.0)))) {
    vec3 delta=position-s.position;
    float d2=dot(delta,delta), r2=range*range;
    // Both existing attenuation functions are zero outside the same radius.
    if (d2<r2 && range>0.0) {
    vec3 direction=delta*inversesqrt(max(d2,1e-20));
    if (pbr) {
      vec3 irradianceColor=color*clamp(1.0-pow(sqrt(d2)/range,4.0),0.0,1.0);
      surfaceShading(v,s,bsdf,direction,irradianceColor,diffuse,specular);
    }
    if (legacy) {
      // Preserve the original near-light clamp and falloff, including both
      // accepted lobes of the current appearance, without a second light loop.
      float cosine=max(0.0,dot(legacyNormal,delta*inversesqrt(max(d2,0.0001))));
      float falloff=1.0-d2/r2;
      diffuse+=s.albedoColor*color*(cosine*falloff*falloff/(1.0+d2));
    }
    }
    }
}
void masonryDirectRadiance(Varyings v, SurfaceData s, BSDFData bsdf, vec3 legacyNormal,
    float shadow, inout vec3 diffuse, inout vec3 specular) {
    #ifdef SCENE_DIRECT_LIGHT_COUNT
      for(int i=0;i<SCENE_DIRECT_LIGHT_COUNT;i++) {
        if(!isRendererCulledByLight(renderer_Layer.xy,scene_DirectLightCullingMask[i])) {
          DirectLight light=getDirectLight(i);
          if(i==0) light.color*=shadow;
          addDirectionalDirectLightRadiance(v,s,bsdf,light,diffuse,specular);
        }
      }
    #endif
    #ifdef SCENE_POINT_LIGHT_COUNT
      for(int i=0;i<SCENE_POINT_LIGHT_COUNT;i++) {
        bool pbr=!isRendererCulledByLight(renderer_Layer.xy,scene_PointLightCullingMask[i]);
        bool legacy=(uint(scene_MasonryLegacyMask)&(1u<<uint(i)))!=0u;
        PointLight light=getPointLight(i);
        if((uint(scene_MasonryPointMask)&(1u<<uint(i)))!=0u) {
          masonryPointRadiance(v,s,bsdf,legacyNormal,light.color,light.position,light.distance,pbr,legacy,diffuse,specular);
        } else if(pbr) {
          // Other systems retain the engine's exact point-light implementation.
          addPointDirectLightRadiance(v,s,bsdf,light,diffuse,specular);
        }
      }
    #endif
    #ifdef SCENE_SPOT_LIGHT_COUNT
      for(int i=0;i<SCENE_SPOT_LIGHT_COUNT;i++) {
        if(!isRendererCulledByLight(renderer_Layer.xy,scene_SpotLightCullingMask[i]))
          addSpotDirectLightRadiance(v,s,bsdf,getSpotLight(i),diffuse,specular);
      }
    #endif
    // Lights beyond the engine's point-light capacity previously contributed
    // only the local lobe. Preserve that behavior, without evaluating them twice.
    if(scene_MasonryFallbackMask!=0) {
      for(int i=0;i<8;i++) {
        if((uint(scene_MasonryFallbackMask)&(1u<<uint(i)))!=0u) {
          vec4 p=scene_MasonryLightPositionRange[i], c=scene_MasonryLightColorIntensity[i];
          masonryPointRadiance(v,s,bsdf,legacyNormal,c.rgb*c.a,p.xyz,p.w,false,true,diffuse,specular);
        }
      }
    }
}

// The material producer supplies LINEAR albedo and a world-space surface normal.
// Use the scene's actual PBR/IBL/shadow implementation, including runtime macros.
vec3 masonrySceneLight(Varyings lightingVaryings, vec3 albedo, vec3 normalWS, vec3 positionWS, float roughness) {
    SurfaceData s;
    s.albedoColor=albedo;
    s.emissiveColor=vec3(0.0);
    s.metallic=0.0;
    s.roughness=clamp(roughness,0.045,1.0);
    s.ambientOcclusion=1.0;
    s.opacity=1.0;
    s.IOR=1.5;
    s.position=positionWS;
    s.positionCS=camera_VPMat*vec4(positionWS,1.0);
    s.normal=normalize(normalWS);
    s.viewDir=normalize(camera_Position-positionWS);
    s.dotNV=max(dot(s.normal,s.viewDir),0.0001);
    s.specularIntensity=1.0;
    s.specularColor=vec3(1.0);
    BSDFData bsdf;
    initBSDFData(s,bsdf);
    float shadow=1.0;
    #if defined(SCENE_DIRECT_LIGHT_COUNT) && defined(NEED_CALCULATE_SHADOWS)
      shadow=sampleShadowMap(positionWS,getShadowCoord(positionWS));
    #endif
    shadow*=sampleVolumetricCloudShadow(positionWS);
    vec3 diffuse=vec3(0.0),specular=vec3(0.0);
    masonryDirectRadiance(lightingVaryings,s,bsdf,normalWS,shadow,diffuse,specular);
    evaluateIBL(lightingVaryings,s,bsdf,diffuse,specular);
    return diffuse+specular;
}
  vec3 masonryResidentSceneLight(vec3 albedo,vec3 normalWS,vec3 positionWS,float roughness) {
    Varyings lightingVaryings;
    lightingVaryings.positionWS=positionWS;
    lightingVaryings.positionCS=camera_VPMat*vec4(positionWS,1.0);
    lightingVaryings.uv=vec2(0.0);
    #ifdef RENDERER_HAS_NORMAL
      lightingVaryings.normalWS=normalWS;
      #if defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
        lightingVaryings.probeIrradiance=vec3(0.0);
        lightingVaryings.probeWeight=0.0;
      #endif
    #endif
    return masonrySceneLight(lightingVaryings,albedo,normalWS,positionWS,roughness);
  }
vec3 masonrySceneFog(vec3 color, vec3 positionWS) {
    #if SCENE_FOG_MODE != 0
      return fog(vec4(color,1.0),(camera_ViewMat*vec4(positionWS,1.0)).xyz).rgb;
    #else
      return color;
    #endif
}
#endif
