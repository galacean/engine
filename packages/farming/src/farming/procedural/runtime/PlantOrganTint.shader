Shader "Farming/PlantOrganTint" {
    SubShader "Default" {
      UsePass "Pipeline/ShadowCaster/Default/ShadowCaster"
      UsePass "Pipeline/DepthOnly/Default/DepthOnly"
      UsePass "Pipeline/ScreenSpaceReflectionSurface/Default/ScreenSpaceReflectionSurface"

      Pass "Forward Pass" {
        Tags { pipelineStage = "Forward"}

        RenderQueueType renderQueueType;
        BlendFactor sourceColorBlendFactor;
        BlendFactor destinationColorBlendFactor;
        BlendFactor sourceAlphaBlendFactor;
        BlendFactor destinationAlphaBlendFactor;
        CullMode rasterStateCullMode;
        Bool blendEnabled;
        Bool depthWriteEnabled;

        DepthState = {
          WriteEnabled = depthWriteEnabled;
        }

        BlendState = {
          Enabled = blendEnabled;
          SourceColorBlendFactor = sourceColorBlendFactor;
          DestinationColorBlendFactor = destinationColorBlendFactor;
          SourceAlphaBlendFactor = sourceAlphaBlendFactor;
          DestinationAlphaBlendFactor = destinationAlphaBlendFactor;
        }

        RasterState = {
          CullMode = rasterStateCullMode;
        }

        RenderQueueType = renderQueueType;

        VertexShader = PBRVertex;
        FragmentShader = PBRFragment;

        vec4 renderer_OrganTint;
#ifndef FORWARD_PASS_PBR_INCLUDED
#define FORWARD_PASS_PBR_INCLUDED

// Vertex stage carries mesh tangent through to fragment only when the surface
// samples a normal-style map AND the mesh actually provides a tangent
// attribute. Anisotropy alone falls back to dFdx/dFdy in fragment, so it does
// not pull tangent through the vertex pipeline.
#if defined(RENDERER_HAS_NORMAL) && defined(RENDERER_HAS_TANGENT) && (defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE))
    #define NEED_VERTEX_TANGENT
#endif

// Fragment needs a tangent space whenever any tangent-space material feature
// is enabled. With NEED_VERTEX_TANGENT the basis comes from the interpolated
// tangent varying; otherwise fragment derives it from dFdx/dFdy.
#if defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE) || defined(MATERIAL_ENABLE_ANISOTROPY)
    #define NEED_TANGENT_SPACE
#endif

#include "ShaderLibrary/Common/Common.glsl"
#include "ShaderLibrary/Common/Fog.glsl"
#include "ShaderLibrary/Common/Transform.glsl"
#include "ShaderLibrary/Common/Attributes.glsl"
#include "ShaderLibrary/Skin/Skin.glsl"
#include "ShaderLibrary/Skin/BlendShape.glsl"
#include "ShaderLibrary/Shadow/Shadow.glsl"
#include "ShaderLibrary/Lighting/VolumetricCloudShadow.glsl"
#ifndef VARYINGS_PBR_INCLUDED
#define VARYINGS_PBR_INCLUDED

struct Varyings{
	vec2 uv;
	#ifdef RENDERER_HAS_UV1
	    vec2 uv1;
	#endif

	#ifdef RENDERER_ENABLE_VERTEXCOLOR
		vec4 vertexColor;
    float organMask;
	#endif

	vec3 positionWS;

	#if SCENE_FOG_MODE != 0
	    vec3 positionVS;
	#endif

	#ifdef RENDERER_HAS_NORMAL
	    vec3 normalWS;
	    #if defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
	        vec3 probeIrradiance;
	        float probeWeight;
	    #endif
	    #ifdef NEED_VERTEX_TANGENT
			vec3 tangentWS;
			vec3 bitangentWS;
	    #endif
	#endif


	#if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
	    vec3 shadowCoord;
	#endif

    vec4 positionCS;
};


#endif

#include "ShaderLibrary/PBR/LightDirectPBR.glsl"
#include "ShaderLibrary/PBR/LightIndirectPBR.glsl"
#include "ShaderLibrary/PBR/VertexPBR.glsl"
#include "ShaderLibrary/PBR/FragmentPBR.glsl"


Varyings PBRVertex(Attributes attributes) {
  Varyings varyings;

  varyings.uv = getUV0(attributes);
  #ifdef RENDERER_HAS_UV1
      varyings.uv1 = attributes.TEXCOORD_1;
  #endif

  #ifdef RENDERER_ENABLE_VERTEXCOLOR
    varyings.vertexColor = vec4(1.0);
    varyings.organMask = attributes.COLOR_0.a;
  #endif


  VertexInputs vertexInputs = getVertexInputs(attributes);

  // positionWS
  varyings.positionWS = vertexInputs.positionWS;

  // positionVS
  #if SCENE_FOG_MODE != 0
	  varyings.positionVS = vertexInputs.positionVS;
	#endif

  // normalWS、tangentWS、bitangentWS
  #ifdef RENDERER_HAS_NORMAL
    varyings.normalWS = vertexInputs.normalWS;
    #if defined(SCENE_USE_PROBE_VOLUME) && defined(SCENE_PROBE_VOLUME_PER_VERTEX)
      vec3 probeIrradiance;
      bool hasProbe = sampleProbeVolume(
        vertexInputs.positionWS,
        vertexInputs.normalWS,
        normalize(camera_Position - vertexInputs.positionWS),
        probeIrradiance
      );
      varyings.probeIrradiance = probeIrradiance;
      varyings.probeWeight = hasProbe ? 1.0 : 0.0;
    #endif
    #ifdef NEED_VERTEX_TANGENT
      varyings.tangentWS = vertexInputs.tangentWS;
      varyings.bitangentWS = vertexInputs.bitangentWS;
    #endif
  #endif

  // ShadowCoord
  #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
      varyings.shadowCoord = getShadowCoord(vertexInputs.positionWS);
  #endif

  gl_Position = renderer_MVPMat * vertexInputs.positionOS;

  varyings.positionCS = gl_Position;

  return varyings;
}


void PBRFragment(Varyings varyings) {
  BSDFData bsdfData;

  // Get aoUV
  vec2 aoUV = varyings.uv;
  #if defined(MATERIAL_HAS_OCCLUSION_TEXTURE) && defined(RENDERER_HAS_UV1)
    if(material_OcclusionTextureCoord == 1.0){
        aoUV = varyings.uv1;
    }
  #endif

  float organMembership = 0.0;
  #ifdef RENDERER_ENABLE_VERTEXCOLOR
    organMembership = varyings.organMask;
    // COLOR_0.a is mask data. Preserve texture alpha and original PBR input.
  #endif
  SurfaceData surfaceData = getSurfaceData(varyings, aoUV, gl_FrontFacing);
  float value = max(surfaceData.albedoColor.r, max(surfaceData.albedoColor.g, surfaceData.albedoColor.b));
  surfaceData.albedoColor = mix(surfaceData.albedoColor,
    renderer_OrganTint.rgb * value, organMembership * renderer_OrganTint.a);

  // Can modify surfaceData here
  initBSDFData(surfaceData, bsdfData);


  vec3 totalDiffuseColor = vec3(0, 0, 0);
  vec3 totalSpecularColor = vec3(0, 0, 0);

  // Get shadow attenuation
  float shadowAttenuation = 1.0;
  #if defined(SCENE_DIRECT_LIGHT_COUNT) && defined(NEED_CALCULATE_SHADOWS)
    #if SCENE_SHADOW_CASCADED_COUNT == 1
      vec3 shadowCoord = varyings.shadowCoord;
    #else
      vec3 shadowCoord = getShadowCoord(varyings.positionWS);
    #endif
    shadowAttenuation *= sampleShadowMap(varyings.positionWS, shadowCoord);
  #endif
  shadowAttenuation *= sampleVolumetricCloudShadow(varyings.positionWS);

  // Evaluate direct lighting
  evaluateDirectRadiance(varyings, surfaceData, bsdfData, shadowAttenuation, totalDiffuseColor, totalSpecularColor);

  // IBL
  evaluateIBL(varyings, surfaceData, bsdfData, totalDiffuseColor, totalSpecularColor);

  #ifdef MATERIAL_ENABLE_TRANSMISSION
      vec3 refractionTransmitted = evaluateTransmission(surfaceData, bsdfData);
      totalDiffuseColor = mix(totalDiffuseColor, refractionTransmitted, surfaceData.transmission);
  #endif

  // Final color
  vec4 color = vec4((totalDiffuseColor + totalSpecularColor).rgb, surfaceData.opacity);

  // Emissive
  color.rgb += surfaceData.emissiveColor;


  #if SCENE_FOG_MODE != 0
      color = fog(color, varyings.positionVS);
  #endif

  #ifdef SCENE_PROBE_BAKE_CAPTURE
      color.a = length(varyings.positionWS - camera_Position) + 1.0;
  #endif

  gl_FragColor = color;
}


#endif

      }
    }
  }
