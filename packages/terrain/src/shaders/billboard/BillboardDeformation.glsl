#ifndef TERRAIN_PROJECT_BILLBOARD_DEFORMATION_INCLUDED
#define TERRAIN_PROJECT_BILLBOARD_DEFORMATION_INCLUDED

#define TERRAIN_PROJECT_WIND_BILLBOARD
#include "shared/VegetationWind.glsl"

struct TerrainProjectBillboardDeformation {
  vec3 sourcePositionWS;
  vec3 positionWS;
  vec3 normalWS;
  vec4 tangentWS;
  float windWeight;
};

TerrainProjectBillboardDeformation terrainProjectBillboardDeformation(
  vec4 positionOS,
  vec3 normalOS,
  vec4 tangentOS,
  Attributes attributes
) {
  vec3 cameraRightWS = normalize(vec3(
    camera_ViewMat[0][0],
    camera_ViewMat[1][0],
    camera_ViewMat[2][0]
  ));
  vec3 cameraFacingWS = normalize(vec3(
    camera_ViewMat[0][2],
    camera_ViewMat[1][2],
    camera_ViewMat[2][2]
  ));
  vec3 cameraUpWS = vec3(0.0, 1.0, 0.0);
  mat3 cameraFacingBasis = mat3(cameraRightWS, cameraUpWS, cameraFacingWS);
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    #ifdef RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE
      vec3 modelScale = terrainProjectAssetAssemblyFinalScale(attributes);
      vec4 homogeneousOriginWS = renderer_ModelMat * vec4(0.0, 0.0, 0.0, 1.0);
    #else
      vec3 modelScale = attributes.ASSEMBLY_SCALE.xyz;
      vec4 homogeneousOriginWS = renderer_ModelMat * vec4(attributes.ASSEMBLY_POSITION.xyz, 1.0);
    #endif
  #elif defined(RENDERER_BILLBOARD_INSTANCE)
    vec3 modelScale = vec3(attributes.BILLBOARD_ORIGIN_SCALE_X.w, attributes.BILLBOARD_SCALE_YZ);
    vec4 homogeneousOriginWS = renderer_ModelMat * vec4(attributes.BILLBOARD_ORIGIN_SCALE_X.xyz, 1.0);
  #else
    vec3 modelScale = vec3(
      length(renderer_ModelMat[0].xyz),
      length(renderer_ModelMat[1].xyz),
      length(renderer_ModelMat[2].xyz)
    );
    vec4 homogeneousOriginWS = renderer_ModelMat * vec4(0.0, 0.0, 0.0, 1.0);
  #endif
  vec3 originWS = homogeneousOriginWS.xyz / homogeneousOriginWS.w;
  vec3 positionWS = originWS + cameraFacingBasis * (positionOS.xyz * modelScale);
  #if defined(RENDERER_ASSET_ASSEMBLY_INSTANCE) && !defined(RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE)
    positionWS = mix(originWS, positionWS, attributes.ASSEMBLY_POSITION.w);
  #endif

  TerrainProjectBillboardDeformation deformation;
  deformation.sourcePositionWS = positionWS;
  deformation.normalWS = normalize(cameraFacingBasis * normalOS);
  deformation.tangentWS = vec4(normalize(cameraFacingBasis * tangentOS.xyz), tangentOS.w);
  float windShadingResponse;
  vec3 groundWindDiagnostics;
  vec3 groundWindCarrierNormalWS;
  deformation.positionWS = terrainProjectApplyVegetationWind(
    positionWS,
    originWS,
    attributes,
    deformation.normalWS,
    deformation.tangentWS.xyz,
    windShadingResponse,
    groundWindDiagnostics,
    groundWindCarrierNormalWS
  );
  deformation.windWeight = terrainProjectVegetationVertexColorWeight(attributes) *
    terrainProjectVegetationBaseLockWeight(attributes);
  return deformation;
}

#endif
