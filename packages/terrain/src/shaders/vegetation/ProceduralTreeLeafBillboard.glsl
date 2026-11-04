#ifndef TERRAIN_PROJECT_PROCEDURAL_TREE_LEAF_BILLBOARD_INCLUDED
#define TERRAIN_PROJECT_PROCEDURAL_TREE_LEAF_BILLBOARD_INCLUDED

vec3 terrainProjectProceduralTreeLeafPointWS(vec3 pointOS, Attributes attributes) {
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    pointOS = terrainProjectAssetAssemblyPositionOS(pointOS, attributes);
  #endif
  vec4 homogeneous = renderer_ModelMat * vec4(pointOS, 1.0);
  return homogeneous.xyz / homogeneous.w;
}

vec3 terrainProjectProceduralTreeLeafFramePointWS(vec3 pointOS, Attributes attributes) {
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    pointOS = terrainProjectAssetAssemblyTransformPositionOS(pointOS, attributes);
  #endif
  vec4 homogeneous = renderer_ModelMat * vec4(pointOS, 1.0);
  return homogeneous.xyz / homogeneous.w;
}

vec3 terrainProjectProceduralTreeLeafOriginWS(Attributes attributes) {
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    vec4 homogeneous = renderer_ModelMat * vec4(terrainProjectAssetAssemblyOriginOS(attributes), 1.0);
    return homogeneous.xyz / homogeneous.w;
  #else
    vec4 homogeneous = renderer_ModelMat * vec4(0.0, 0.0, 0.0, 1.0);
    return homogeneous.xyz / homogeneous.w;
  #endif
}

/**
 * Rebuilds one GPU-varied leaf around its authored petiole/root pivot.
 *
 * Geometry remains camera-facing so authored card dimensions retain their projected size.
 * Lighting retains the procedural botanical card normal. Geometry orientation and the
 * PBR shading frame are intentionally independent, matching a two-sided thin-leaf model.
 */
void terrainProjectBuildProceduralTreeLeafFrame(
  Attributes attributes,
  out vec3 positionWS,
  out vec3 normalWS,
  out vec3 tangentWS,
  out vec3 originWS
) {
  ProceduralTreeLeafFrame frame = terrainProjectProceduralTreeLeafFrame(attributes);
  vec3 variedPivotOS = frame.pivotOS;
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    variedPivotOS = terrainProjectProceduralTreeVariationPositionOS(variedPivotOS, attributes);
  #endif
  vec3 variedUpOS = frame.upOS;
  vec3 variedRightOS = frame.rightOS;
  vec3 variedNormalOS = terrainProjectProceduralTreeLeafShadingNormalOS(
    terrainProjectProceduralTreeLeafPositionOS(frame, attributes.LEAF_SHAPE_POSITION), frame.normalOS
  );
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    variedUpOS = terrainProjectProceduralTreeVariationVectorOS(variedUpOS, attributes);
    variedRightOS = terrainProjectProceduralTreeVariationVectorOS(variedRightOS, attributes);
    variedNormalOS = terrainProjectProceduralTreeVariationVectorOS(variedNormalOS, attributes);
  #endif
  vec3 pivotWS = terrainProjectProceduralTreeLeafFramePointWS(variedPivotOS, attributes);
  vec3 upVectorWS = terrainProjectProceduralTreeLeafFramePointWS(
    variedPivotOS + variedUpOS,
    attributes
  ) - pivotWS;
  vec3 rightVectorWS = terrainProjectProceduralTreeLeafFramePointWS(
    variedPivotOS + variedRightOS,
    attributes
  ) - pivotWS;
  vec3 cameraRightWS = normalize(vec3(
    camera_ViewMat[0][0],
    camera_ViewMat[1][0],
    camera_ViewMat[2][0]
  ));
  vec3 cameraUpWS = vec3(0.0, 1.0, 0.0);
  tangentWS = cameraRightWS;
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    variedNormalOS = terrainProjectAssetAssemblyNormalOS(variedNormalOS, attributes);
  #endif
  normalWS = normalize(mat3(renderer_NormalMat) * variedNormalOS);

  float cardScale = 1.0;
  #ifdef RENDERER_ASSET_ASSEMBLY_INSTANCE
    cardScale = terrainProjectProceduralTreeLeafSize(attributes) *
      terrainProjectProceduralTreeLeafVisibility(attributes);
  #endif
  vec2 local = vec2(
    (attributes.TEXCOORD_0.x * 2.0 - 1.0) * frame.halfWidth,
    attributes.TEXCOORD_0.y * frame.height
  );
  positionWS = pivotWS +
    cameraRightWS * (length(rightVectorWS) * local.x * cardScale) +
    cameraUpWS * (length(upVectorWS) * local.y * cardScale);
  originWS = terrainProjectProceduralTreeLeafOriginWS(attributes);
}

#endif
