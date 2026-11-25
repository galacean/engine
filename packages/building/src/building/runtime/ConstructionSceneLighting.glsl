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
#include "ShaderLibrary/Common/OilPaintBrush.glsl"

// Building-owned light metadata is refreshed at the camera boundary, after the
// scene has packed its point-light list. Masks encode identity, never position.
int scene_MasonryPointMask;
int scene_MasonryLegacyMask;
int scene_MasonryFallbackMask;
vec4 scene_MasonryLightPositionRange[8];
vec4 scene_MasonryLightColorIntensity[8];

#if defined(SCENE_DIRECT_LIGHT_COUNT) && defined(NEED_CALCULATE_SHADOWS)
// Single-cascade lookup avoids a second computeCascadeIndex() + cascade-blend sqrt/inversesqrt/tap.
float masonrySampleShadow(vec3 positionWS) {
    vec3 shadowCoord = getShadowCoord(positionWS);
    if (shadowCoord.z <= 0.0 || shadowCoord.z >= 1.0) return 1.0;
    float attenuation = sampleShadowMapRaw(shadowCoord);
    float shadowFade = getShadowFade(positionWS);
    return mix(1.0, mix(attenuation, 1.0, shadowFade), scene_ShadowInfo.x);
}
#endif

// Single-path dielectric shading (metallic=0, IOR=1.5 -> F0=0.04, PI cancels in both lobes).
// Matte masonry (roughness >= 0.72) skips GGX specular without duplicating light loops or structs.
void masonrySurfaceShading(vec3 normalWS, vec3 viewDir, vec3 albedo, float roughness,
    bool glossy, vec3 direction, float dotNL, vec3 lightColor, inout vec3 radiance) {
    float spec = 0.0;
    if (glossy) {
      float r = clamp(roughness, 0.045, 1.0);
      float alpha = r * r;
      float a2 = alpha * alpha;
      vec3 halfDir = normalize(direction + viewDir);
      float dotNV = max(dot(normalWS, viewDir), 0.0001);
      float dotNH = max(dot(normalWS, halfDir), 0.0);
      float dotLH = max(dot(direction, halfDir), 0.0);
      float o = 1.0 - dotLH;
      float o2 = o * o;
      float F = 0.04 + 0.96 * (o2 * o2 * o);
      float denom = dotNH * dotNH * (a2 - 1.0) + 1.0;
      float D = a2 / (denom * denom);
      // Height-correlated Smith-GGX Hammon approximation avoids two sqrt() SFU ops per light.
      float V = 0.5 / max(mix(2.0 * dotNL * dotNV, dotNL + dotNV, alpha), 1e-6);
      spec = F * (D * V);
    }
    radiance += (dotNL * lightColor) * (albedo * 0.96 + vec3(spec));
}

void masonryDirectRadiance(vec3 albedo, vec3 normalWS, vec3 positionWS,
    vec3 viewDir, float roughness, bool glossy, inout vec3 radiance) {
    #ifdef SCENE_DIRECT_LIGHT_COUNT
      for (int i = 0; i < SCENE_DIRECT_LIGHT_COUNT; i++) {
        if (!isRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[i])) {
          DirectLight light = getDirectLight(i);
          vec3 dir = -light.direction;
          float dotNL = max(dot(normalWS, dir), 0.0);
          if (dotNL > 0.0) {
            float atten = 1.0;
            if (i == 0) {
              #ifdef NEED_CALCULATE_SHADOWS
                atten = masonrySampleShadow(positionWS);
              #endif
              if (atten > 0.0) {
                atten *= sampleVolumetricCloudShadow(positionWS);
              }
            }
            if (atten > 0.0) {
              masonrySurfaceShading(normalWS, viewDir, albedo, roughness, glossy,
                  dir, dotNL, light.color * atten, radiance);
            }
          }
        }
      }
    #endif
    #ifdef SCENE_POINT_LIGHT_COUNT
      uint legacyMask = uint(scene_MasonryLegacyMask);
      uint pointMask = uint(scene_MasonryPointMask);
      for (int i = 0; i < SCENE_POINT_LIGHT_COUNT; i++) {
        uint bit = 1u << uint(i);
        bool pbr = !isRendererCulledByLight(renderer_Layer.xy, scene_PointLightCullingMask[i]);
        bool legacy = (legacyMask & bit) != 0u;
        if (pbr || legacy) {
          PointLight light = getPointLight(i);
          if (dot(light.color, light.color) > 0.0) {
            vec3 delta = light.position - positionWS;
            float d2 = dot(delta, delta), r2 = light.distance * light.distance;
            if (d2 < r2 && light.distance > 0.0) {
              float invD = inversesqrt(max(d2, 1e-20));
              vec3 dir = delta * invD;
              float dotNL = max(dot(normalWS, dir), 0.0);
              if (dotNL > 0.0) {
                if (pbr) {
                  float dOverR = (d2 * invD) / light.distance;
                  float dOverR2 = dOverR * dOverR;
                  vec3 irradianceColor = light.color * clamp(1.0 - dOverR2 * dOverR2, 0.0, 1.0);
                  masonrySurfaceShading(normalWS, viewDir, albedo, roughness, glossy,
                      dir, dotNL, irradianceColor, radiance);
                }
                if (legacy && (pointMask & bit) != 0u) {
                  float cosine = d2 > 0.0001 ? dotNL : max(0.0, dot(normalWS, delta * inversesqrt(0.0001)));
                  float falloff = 1.0 - d2 / r2;
                  radiance += albedo * light.color * (cosine * falloff * falloff / (1.0 + d2));
                }
              }
            }
          }
        }
      }
    #endif
    #ifdef SCENE_SPOT_LIGHT_COUNT
      for (int i = 0; i < SCENE_SPOT_LIGHT_COUNT; i++) {
        if (!isRendererCulledByLight(renderer_Layer.xy, scene_SpotLightCullingMask[i])) {
          SpotLight light = getSpotLight(i);
          vec3 lVec = light.position - positionWS;
          float d2 = dot(lVec, lVec), r2 = light.distance * light.distance;
          if (d2 < r2 && light.distance > 0.0) {
            float invD = inversesqrt(max(d2, 1e-20));
            vec3 dir = lVec * invD;
            float dotNL = max(dot(normalWS, dir), 0.0);
            if (dotNL > 0.0) {
              float spotEffect = smoothstep(light.penumbraCos, light.angleCos, dot(dir, -light.direction));
              float dOverR = (d2 * invD) / light.distance;
              float dOverR2 = dOverR * dOverR;
              vec3 lightColor = light.color * (spotEffect * clamp(1.0 - dOverR2 * dOverR2, 0.0, 1.0));
              masonrySurfaceShading(normalWS, viewDir, albedo, roughness, glossy,
                  dir, dotNL, lightColor, radiance);
            }
          }
        }
      }
    #endif
    // Lights beyond the engine's point-light capacity contribute only the local lobe.
    if (scene_MasonryFallbackMask != 0) {
      for (int i = 0; i < 8; i++) {
        if ((uint(scene_MasonryFallbackMask) & (1u << uint(i))) != 0u) {
          vec4 p = scene_MasonryLightPositionRange[i], c = scene_MasonryLightColorIntensity[i];
          vec3 col = c.rgb * c.a;
          if (any(notEqual(col, vec3(0.0)))) {
            vec3 delta = p.xyz - positionWS;
            float d2 = dot(delta, delta), r2 = p.w * p.w;
            if (d2 < r2 && p.w > 0.0) {
              float cosine = max(0.0, dot(normalWS, delta * inversesqrt(max(d2, 0.0001))));
              float falloff = 1.0 - d2 / r2;
              radiance += albedo * col * (cosine * falloff * falloff / (1.0 + d2));
            }
          }
        }
      }
    }
}

// The material producer supplies LINEAR albedo and a world-space surface normal.
// Use the scene's actual PBR/IBL/shadow implementation, including runtime macros.
vec3 masonrySceneLight(Varyings lightingVaryings, vec3 albedo, vec3 normalWS, vec3 positionWS, float roughness) {
    #ifdef SCENE_OIL_PAINT_STYLE
      applyOilPaintBrushSurface(positionWS, normalWS, 0.34, 0.0, albedo, normalWS, roughness);
    #endif
    vec3 n = normalize(normalWS);
    // Matte masonry (brick=0.80, roof=0.735..1.0, plaster=0.90, stone/timber>=0.80) skips
    // GGX specular and specular cubemap fetches while preserving the 4% dielectric ambient bounce.
    bool glossy = roughness < 0.72;
    #ifdef SCENE_USE_PROBE_VOLUME
      vec3 viewDir = normalize(camera_Position - positionWS);
    #else
      vec3 viewDir = glossy ? normalize(camera_Position - positionWS) : vec3(0.0);
    #endif
    vec3 radiance = vec3(0.0);
    masonryDirectRadiance(albedo, n, positionWS, viewDir, roughness, glossy, radiance);
    SurfaceData s;
    s.position = positionWS;
    s.normal = n;
    s.viewDir = viewDir;
    BSDFData bsdf;
    vec3 diffuseAlbedo = albedo * 0.96;
    bsdf.diffuseColor = glossy ? diffuseAlbedo : (diffuseAlbedo + vec3(0.04));
    bsdf.diffuseAO = 1.0;
    evaluateDiffuseIBL(lightingVaryings, s, bsdf, radiance);
    // Keep envDFGApprox / energyComp / specular cubemap local to this block so matte pixels
    // never keep specular temporaries live in GPRs across direct lights and diffuse IBL.
    if (glossy) {
      float clampedRoughness = clamp(roughness, 0.045, 1.0);
      float dotNV = max(dot(n, viewDir), 0.0001);
      vec2 dfg = envDFGApprox(clampedRoughness, dotNV);
      float energyComp = 1.0 + 0.04 * (1.0 / max(dfg.x + dfg.y, 1e-6) - 1.0);
      vec3 envRad = getLightProbeRadiance(s, n, clampedRoughness);
      float specularAO = evaluateSpecularOcclusion(dotNV, 1.0, clampedRoughness);
      radiance += (specularAO * (0.04 * dfg.x + dfg.y) * energyComp) * envRad;
    }
    return radiance;
}
Varyings initMasonryLightingVaryings(vec3 normalWS, vec3 positionWS) {
    Varyings lightingVaryings;
    lightingVaryings.positionWS = positionWS;
    lightingVaryings.positionCS = vec4(0.0);
    lightingVaryings.uv = vec2(0.0);
    #ifdef RENDERER_HAS_NORMAL
      lightingVaryings.normalWS = normalWS;
      #if defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
        lightingVaryings.probeIrradiance = vec3(0.0);
        lightingVaryings.probeWeight = 0.0;
      #endif
    #endif
    return lightingVaryings;
}
vec3 masonryResidentSceneLight(vec3 albedo,vec3 normalWS,vec3 positionWS,float roughness) {
    Varyings lightingVaryings = initMasonryLightingVaryings(normalWS, positionWS);
    return masonrySceneLight(lightingVaryings,albedo,normalWS,positionWS,roughness);
}
vec3 masonryFarProxyLight(vec3 albedo, vec3 normalWS, vec3 positionWS) {
    #ifdef SCENE_OIL_PAINT_STYLE
      applyOilPaintBrushSurface(positionWS, normalWS, 0.34, albedo, normalWS);
    #endif
    Varyings lightingVaryings = initMasonryLightingVaryings(normalWS, positionWS);
    SurfaceData s;
    s.albedoColor = albedo;
    s.position = positionWS;
    s.normal = normalWS;
    #ifdef SCENE_USE_PROBE_VOLUME
      s.viewDir = normalize(camera_Position - positionWS);
    #else
      s.viewDir = vec3(0.0);
    #endif
    vec3 diffuseAlbedo = albedo * 0.96;
    BSDFData bsdf;
    // Match LOD0/LOD1 matte dielectric 4% ambient bounce in evaluateDiffuseIBL.
    bsdf.diffuseColor = diffuseAlbedo + vec3(0.04);
    bsdf.diffuseAO = 1.0;
    vec3 diffuse = vec3(0.0);
    #ifdef SCENE_DIRECT_LIGHT_COUNT
      for (int i = 0; i < SCENE_DIRECT_LIGHT_COUNT; i++) {
        if (!isRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[i])) {
          DirectLight light = getDirectLight(i);
          float ndotl = max(dot(normalWS, -light.direction), 0.0);
          if (ndotl > 0.0) {
            float atten = 1.0;
            if (i == 0) {
              #ifdef NEED_CALCULATE_SHADOWS
                atten = masonrySampleShadow(positionWS);
              #endif
              if (atten > 0.0) {
                atten *= sampleVolumetricCloudShadow(positionWS);
              }
            }
            diffuse += diffuseAlbedo * light.color * (ndotl * atten);
          }
        }
      }
    #endif
    // Preserve warm lantern/window point-light glow on LOD2 walls when scene point lights are active
    // without specular/GGX or the dead 8-light overflow fallback loop.
    #ifdef SCENE_POINT_LIGHT_COUNT
      uint legacyMask = uint(scene_MasonryLegacyMask);
      uint pointMask = uint(scene_MasonryPointMask);
      for (int i = 0; i < SCENE_POINT_LIGHT_COUNT; i++) {
        uint bit = 1u << uint(i);
        bool pbr = !isRendererCulledByLight(renderer_Layer.xy, scene_PointLightCullingMask[i]);
        bool legacy = (legacyMask & bit) != 0u;
        if (pbr || legacy) {
          PointLight light = getPointLight(i);
          if (dot(light.color, light.color) > 0.0) {
            vec3 delta = light.position - positionWS;
            float d2 = dot(delta, delta), r2 = light.distance * light.distance;
            if (d2 < r2 && light.distance > 0.0) {
              float invD = inversesqrt(max(d2, 1e-20));
              float ndotl = max(dot(normalWS, delta * invD), 0.0);
              if (ndotl > 0.0) {
                if (pbr) {
                  float dOverR = (d2 * invD) / light.distance;
                  float dOverR2 = dOverR * dOverR;
                  diffuse += diffuseAlbedo * light.color * (ndotl * clamp(1.0 - dOverR2 * dOverR2, 0.0, 1.0));
                }
                if (legacy && (pointMask & bit) != 0u) {
                  float cosine = d2 > 0.0001 ? ndotl : max(0.0, dot(normalWS, delta * inversesqrt(0.0001)));
                  float falloff = 1.0 - d2 / r2;
                  diffuse += (diffuseAlbedo * 1.0416667) * light.color * (cosine * falloff * falloff / (1.0 + d2));
                }
              }
            }
          }
        }
      }
    #endif
    evaluateDiffuseIBL(lightingVaryings, s, bsdf, diffuse);
    return diffuse;
}
vec3 masonrySceneFog(vec3 color, vec3 positionWS) {
    #if SCENE_FOG_MODE != 0
      return fog(vec4(color,1.0),(camera_ViewMat*vec4(positionWS,1.0)).xyz).rgb;
    #else
      return color;
    #endif
}
#endif
