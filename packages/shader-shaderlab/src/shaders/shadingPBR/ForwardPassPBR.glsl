#ifndef FORWARD_PASS_PBR_INCLUDED
#define FORWARD_PASS_PBR_INCLUDED

#include "Common.glsl"
#include "Fog.glsl"

#include "AttributesPBR.glsl"
#include "VaryingsPBR.glsl"
#include "LightDirectPBR.glsl"
#include "LightIndirectPBR.glsl"
#include "BTDF.glsl"

#include "VertexPBR.glsl"
#include "FragmentPBR.glsl"


Varyings PBRVertex(Attributes attributes) {
  Varyings varyings;

  varyings.uv = getUV0(attributes);
  #ifdef RENDERER_HAS_UV1
      varyings.uv1 = attributes.TEXCOORD_1;
  #endif

  #ifdef RENDERER_ENABLE_VERTEXCOLOR
    varyings.vertexColor = attributes.COLOR_0;
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
    #ifdef RENDERER_HAS_TANGENT
      varyings.tangentWS = vertexInputs.tangentWS;
      varyings.bitangentWS = vertexInputs.bitangentWS;
    #endif
  #endif

  // ShadowCoord
  #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
      varyings.shadowCoord = getShadowCoord(vertexInputs.positionWS);
  #endif

  gl_Position = renderer_MVPMat * vertexInputs.positionOS;

  return varyings;
}


void PBRFragment(Varyings varyings) {
  BRDFData brdfData;

  // Get aoUV
  vec2 aoUV = varyings.uv;
  #if defined(MATERIAL_HAS_OCCLUSION_TEXTURE) && defined(RENDERER_HAS_UV1)
    if(material_OcclusionTextureCoord == 1.0){
        aoUV = varyings.uv1;
    }
  #endif

  SurfaceData surfaceData = getSurfaceData(varyings, aoUV, gl_FrontFacing);

  // Can modify surfaceData here
  initBRDFData(surfaceData, brdfData);


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

  // Evaluate direct lighting
  evaluateDirectRadiance(varyings, surfaceData, brdfData, shadowAttenuation, totalDiffuseColor, totalSpecularColor);

  // IBL
  evaluateIBL(varyings, surfaceData, brdfData, totalDiffuseColor, totalSpecularColor);

  #ifdef MATERIAL_ENABLE_TRANSMISSION 
      vec3 refractionTransmitted = evaluateTransmission(surfaceData, brdfData);
      totalDiffuseColor = mix(totalDiffuseColor, refractionTransmitted, surfaceData.transmission);
  #endif

  // Final color
  vec4 color = vec4((totalDiffuseColor + totalSpecularColor).rgb, surfaceData.opacity);

  // Emissive
  color.rgb += surfaceData.emissiveColor;


  #if SCENE_FOG_MODE != 0
      color = fog(color, varyings.positionVS);
  #endif

  color = linearToGamma(color);

  gl_FragColor = color;
}


#endif