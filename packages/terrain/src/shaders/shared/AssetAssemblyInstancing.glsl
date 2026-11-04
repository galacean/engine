#ifndef TERRAIN_PROJECT_ASSET_ASSEMBLY_INSTANCING_INCLUDED
#define TERRAIN_PROJECT_ASSET_ASSEMBLY_INSTANCING_INCLUDED

#ifdef RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG
  vec4 material_ProceduralTreeVariationCatalog[8];
  vec4 material_ProceduralTreeBranchShapeCatalog[8];
  vec4 material_ProceduralTreeColorCatalog[8];
  #ifdef MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION
    // Previous leaf/branch density, playback progress, density band. The target stays canonical.
    vec4 material_ProceduralTreeDensityTransition[8];
    vec4 material_TreeDissolvePalette[8];
  #endif
#endif

#ifdef RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE
  #include "shared/Instancing.glsl"
  // Ordinary MeshRenderers own their transform through renderer_ModelMat
  // Their remaining renderer-group uniforms are packed by the Engine's generic instance batcher
  vec4 renderer_AssetAssemblyColor;
  #ifdef RENDERER_PROCEDURAL_TREE_GPU_VARIATION
    vec4 renderer_ProceduralTreeVariation;
    vec4 renderer_ProceduralTreeLeafColor;
    // x: curvature radians/metre; y: retained branch density; z: main-trunk radial scale
    vec4 renderer_ProceduralTreeBranchShape;
  #endif
#endif

#ifdef RENDERER_PROCEDURAL_TREE_LEAF_MASK_LIBRARY
float renderer_ProceduralTreeLeafShape;
#endif

#ifdef RENDERER_PROCEDURAL_TREE_BARK_UV_SCALE
  #ifdef RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG
    vec2 terrainProjectProceduralTreeBarkUvScaleFromInstance(Attributes attributes) {
      return vec2(attributes.ASSEMBLY_COLOR.x);
    }
  #else
    vec4 renderer_ProceduralTreeBarkUvScale;
    vec2 terrainProjectProceduralTreeBarkUvScale() {
      return renderer_ProceduralTreeBarkUvScale.xy;
    }
  #endif
#endif

#ifdef RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG
int terrainProjectProceduralTreeCatalogIndex(Attributes attributes) {
  return int(clamp(floor(attributes.ASSEMBLY_SCALE.w + 0.5), 0.0, 7.0));
}
#endif

vec3 terrainProjectAssetAssemblyRotate(vec4 rotation, vec3 value) {
  return value + 2.0 * cross(rotation.xyz, cross(rotation.xyz, value) + rotation.w * value);
}

vec4 terrainProjectAssetAssemblyRotation(Attributes attributes) {
  #ifdef RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE
    return vec4(0.0, 0.0, 0.0, 1.0);
  #else
    return attributes.ASSEMBLY_ROTATION;
  #endif
}

vec3 terrainProjectAssetAssemblyEmbeddedScale(Attributes attributes) {
  #ifdef RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE
    return vec3(1.0);
  #else
    return attributes.ASSEMBLY_SCALE.xyz;
  #endif
}

vec3 terrainProjectAssetAssemblyFinalScale(Attributes attributes) {
  #ifdef RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE
    return vec3(
      length(renderer_ModelMat[0].xyz),
      length(renderer_ModelMat[1].xyz),
      length(renderer_ModelMat[2].xyz)
    );
  #else
    return attributes.ASSEMBLY_SCALE.xyz;
  #endif
}

#ifdef RENDERER_PROCEDURAL_TREE_GPU_VARIATION
vec4 terrainProjectProceduralTreeVariation(Attributes attributes) {
  #ifdef RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG
    vec4 variation = material_ProceduralTreeVariationCatalog[terrainProjectProceduralTreeCatalogIndex(attributes)];
    #ifndef RENDERER_PROCEDURAL_TREE_GPU_BRANCH_VARIATION
      variation.x = max(variation.x, 1.0);
    #endif
    return variation;
  #elif defined(RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE)
    return renderer_ProceduralTreeVariation;
  #else
    return attributes.ASSEMBLY_TREE_VARIATION;
  #endif
}

vec4 terrainProjectProceduralTreeBranchShape(Attributes attributes) {
  #ifdef RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG
    return material_ProceduralTreeBranchShapeCatalog[terrainProjectProceduralTreeCatalogIndex(attributes)];
  #elif defined(RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE)
    return renderer_ProceduralTreeBranchShape;
  #else
    return vec4(attributes.ASSEMBLY_POSITION.w, attributes.ASSEMBLY_SCALE.w, 1.0, 0.0);
  #endif
}
#endif

float terrainProjectProceduralTreeBranchInfluence(Attributes attributes) {
  #ifdef RENDERER_PROCEDURAL_TREE_GPU_VARIATION
    return clamp(floor(attributes.TREE_VARIATION_DATA.x * 0.5 + 0.00001), 0.0, 1.0);
  #else
    return 0.0;
  #endif
}

float terrainProjectProceduralTreeBranchProgress(Attributes attributes) {
  #ifdef RENDERER_PROCEDURAL_TREE_GPU_VARIATION
    float branchInfluence = terrainProjectProceduralTreeBranchInfluence(attributes);
    return clamp(attributes.TREE_VARIATION_DATA.x - branchInfluence * 2.0, 0.0, 1.0);
  #else
    return 0.0;
  #endif
}

/**
 * Values below one prune only the terminal woody tube; they do not move its centerline.
 * Collapsing every later ring to zero radius makes its triangles degenerate while retaining
 * the one shared source Mesh. Values above one keep the existing subtree-growth behavior.
 */
float terrainProjectProceduralTreeBranchTipRadiusScale(float branchControl, Attributes attributes) {
  #ifdef RENDERER_PROCEDURAL_TREE_GPU_VARIATION
    float retainedProgress = min(branchControl, 1.0);
    float transitionStart = max(retainedProgress - 0.025, 0.0);
    float tipScale = 1.0 - smoothstep(transitionStart, retainedProgress, terrainProjectProceduralTreeBranchProgress(attributes));
    return mix(1.0, tipScale, terrainProjectProceduralTreeBranchInfluence(attributes));
  #else
    return 1.0;
  #endif
}

float terrainProjectProceduralTreeBranchAngle(float distanceFromRoot, Attributes attributes) {
  #ifdef RENDERER_PROCEDURAL_TREE_GPU_VARIATION
    vec3 key = attributes.TREE_VARIATION_ROOT.xyz * vec3(12.9898, 78.233, 37.719) +
      fract(terrainProjectProceduralTreeVariation(attributes).w) * vec3(19.19, 47.77, 83.17);
    float unitAngle = fract(sin(dot(key, vec3(1.0))) * 43758.5453);
    float curvature = max(terrainProjectProceduralTreeBranchShape(attributes).x, 0.0);
    return (unitAngle * 2.0 - 1.0) * curvature * max(distanceFromRoot, 0.0) *
      terrainProjectProceduralTreeBranchInfluence(attributes);
  #else
    return 0.0;
  #endif
}

vec3 terrainProjectProceduralTreeRotateY(vec3 value, float angle) {
  float cosine = cos(angle);
  float sine = sin(angle);
  return vec3(
    value.x * cosine - value.z * sine,
    value.y,
    value.x * sine + value.z * cosine
  );
}

#ifdef MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION
float terrainProjectProceduralTreeDensityReveal(Attributes attributes) {
  vec4 transition = material_ProceduralTreeDensityTransition[terrainProjectProceduralTreeCatalogIndex(attributes)];
  vec2 targetDensity = vec2(terrainProjectProceduralTreeVariation(attributes).y,
    terrainProjectProceduralTreeBranchShape(attributes).y);
  float influence = terrainProjectProceduralTreeBranchInfluence(attributes);
  float previous = mix(1.0, step(attributes.TREE_VARIATION_DATA.z, transition.y), influence);
  float target = mix(1.0, step(attributes.TREE_VARIATION_DATA.z, targetDensity.y), influence);
  #ifndef RENDERER_PROCEDURAL_TREE_GPU_BRANCH_VARIATION
    float rank = fract(attributes.TREE_VARIATION_DATA.y);
    previous *= 1.0 - step(transition.x, rank);
    target *= 1.0 - step(targetDensity.x, rank);
  #endif
  // Ranks choose membership only. Every changed element shares one sweep clock.
  return mix(previous, target, transition.z);
}
#endif

float terrainProjectProceduralTreeBranchVisibility(Attributes attributes) {
  #ifdef RENDERER_PROCEDURAL_TREE_GPU_VARIATION
    #ifdef MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION
      // Keep complete source geometry while the fragment shader dissolves it.
      return 1.0;
    #else
      return mix(1.0, step(attributes.TREE_VARIATION_DATA.z,
        clamp(terrainProjectProceduralTreeBranchShape(attributes).y, 0.0, 1.0)),
        terrainProjectProceduralTreeBranchInfluence(attributes));
    #endif
  #else
    return 1.0;
  #endif
}

float terrainProjectProceduralTreeLeafVisibility(Attributes attributes) {
  #ifdef RENDERER_PROCEDURAL_TREE_GPU_VARIATION
    #ifdef MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION
      return 1.0;
    #else
      return (1.0 - step(clamp(terrainProjectProceduralTreeVariation(attributes).y, 0.0, 1.0),
        fract(attributes.TREE_VARIATION_DATA.y))) * terrainProjectProceduralTreeBranchVisibility(attributes);
    #endif
  #else
    return 1.0;
  #endif
}

float terrainProjectProceduralTreeLeafSize(Attributes attributes) {
  #ifdef RENDERER_PROCEDURAL_TREE_GPU_VARIATION
    return max(terrainProjectProceduralTreeVariation(attributes).z, 0.00001);
  #else
    return 1.0;
  #endif
}

#if defined(RENDERER_PROCEDURAL_TREE_GPU_VARIATION) && !defined(RENDERER_PROCEDURAL_TREE_GPU_BRANCH_VARIATION)
vec3 terrainProjectProceduralTreeVariationLeafPivotOS(Attributes attributes) {
  #ifdef RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME
    return terrainProjectProceduralTreeLeafPivotOS(attributes);
  #else
    return attributes.LEAF_PIVOT;
  #endif
}
#endif

vec3 terrainProjectProceduralTreeVariationPositionOS(vec3 positionOS, Attributes attributes) {
  #ifdef RENDERER_PROCEDURAL_TREE_GPU_VARIATION
    float branchInfluence = terrainProjectProceduralTreeBranchInfluence(attributes);
    float branchControl = max(terrainProjectProceduralTreeVariation(attributes).x, 0.00001);
    // Shrinking is a terminal prune. Only values above one grow the source centerline.
    float branchCenterlineScale = max(branchControl, 1.0);
    #ifdef RENDERER_PROCEDURAL_TREE_GPU_BRANCH_VARIATION
      // Every woody vertex carries the center of its generated tube ring. Scale the
      // level-zero trunk only in that radial frame: its height and centerline stay
      // unchanged, while child-branch centerlines and the whole crown do not move.
      float trunkRadialScale = max(terrainProjectProceduralTreeBranchShape(attributes).z, 0.00001);
      vec3 sourceRadialOffsetOS = positionOS - attributes.TREE_VARIATION_CENTER;
      vec3 variedTrunkPositionOS = attributes.TREE_VARIATION_CENTER + sourceRadialOffsetOS * trunkRadialScale;

      // Branch controls continue to move only child-branch centerlines. Their tube
      // radii remain authored, so a trunk-diameter edit cannot inflate the crown.
      vec3 scaledCenterOffset =
        (attributes.TREE_VARIATION_CENTER - attributes.TREE_VARIATION_ROOT.xyz) * branchCenterlineScale;
      float branchAngle = terrainProjectProceduralTreeBranchAngle(length(scaledCenterOffset), attributes);
      vec3 variedCenterOS = attributes.TREE_VARIATION_ROOT.xyz + terrainProjectProceduralTreeRotateY(
        scaledCenterOffset,
        branchAngle
      );
      vec3 variedPositionOS = variedCenterOS + terrainProjectProceduralTreeRotateY(
        sourceRadialOffsetOS,
        branchAngle
      ) * terrainProjectProceduralTreeBranchTipRadiusScale(branchControl, attributes);
    #else
      // Both fixed and camera-facing cards deform around the same authored branch attachment.
      // Fixed cards also consume the per-instance size/density controls in this path.
      vec3 leafPivotOS = terrainProjectProceduralTreeVariationLeafPivotOS(attributes);
      vec3 scaledPivotOffset =
        (leafPivotOS - attributes.TREE_VARIATION_ROOT.xyz) * branchCenterlineScale;
      float branchAngle = terrainProjectProceduralTreeBranchAngle(length(scaledPivotOffset), attributes);
      vec3 variedPivotOS = attributes.TREE_VARIATION_ROOT.xyz + terrainProjectProceduralTreeRotateY(
        scaledPivotOffset,
        branchAngle
      );
      // Trunk-attached cards keep their attachment but still consume leaf size/density.
      variedPivotOS = mix(leafPivotOS, variedPivotOS, branchInfluence);
      float leafScale = terrainProjectProceduralTreeLeafSize(attributes) *
        terrainProjectProceduralTreeLeafVisibility(attributes);
      vec3 variedLeafLocalOS = terrainProjectProceduralTreeRotateY(
        positionOS - leafPivotOS,
        branchAngle
      ) * leafScale;
      #ifndef RENDERER_PROCEDURAL_TREE_LEAF_BILLBOARD
        // The tree silhouette may scale X/Z independently from Y. Counter-scale the
        // fixed leaf's local frame so the outer instance transform applies Y uniformly
        // to both card axes and cannot stretch the authored texture aspect ratio.
        vec3 finalInstanceScale = terrainProjectAssetAssemblyFinalScale(attributes);
        float uniformLeafInstanceScale = max(abs(finalInstanceScale.y), 0.00001);
        variedLeafLocalOS *= vec3(uniformLeafInstanceScale) /
          max(abs(finalInstanceScale), vec3(0.00001));
      #endif
      vec3 variedPositionOS = variedPivotOS + variedLeafLocalOS;
    #endif
    #ifdef RENDERER_PROCEDURAL_TREE_GPU_BRANCH_VARIATION
      vec3 shapedPositionOS = mix(variedTrunkPositionOS, variedPositionOS, branchInfluence);
    #else
      vec3 shapedPositionOS = variedPositionOS;
    #endif
    return mix(attributes.TREE_VARIATION_ROOT.xyz, shapedPositionOS, terrainProjectProceduralTreeBranchVisibility(attributes));
  #else
    return positionOS;
  #endif
}

vec3 terrainProjectProceduralTreeVariationVectorOS(vec3 vectorOS, Attributes attributes) {
  #ifdef RENDERER_PROCEDURAL_TREE_GPU_VARIATION
    float branchControl = max(terrainProjectProceduralTreeVariation(attributes).x, 0.00001);
    float branchCenterlineScale = max(branchControl, 1.0);
    #ifdef RENDERER_PROCEDURAL_TREE_GPU_BRANCH_VARIATION
      float distanceFromRoot = length(
        (attributes.TREE_VARIATION_CENTER - attributes.TREE_VARIATION_ROOT.xyz) * branchCenterlineScale
      );
    #else
      float distanceFromRoot = length(
        (terrainProjectProceduralTreeVariationLeafPivotOS(attributes) - attributes.TREE_VARIATION_ROOT.xyz) *
          branchCenterlineScale
      );
    #endif
    return terrainProjectProceduralTreeRotateY(
      vectorOS,
      terrainProjectProceduralTreeBranchAngle(distanceFromRoot, attributes)
    );
  #else
    return vectorOS;
  #endif
}

/** Applies only the rigid/non-uniform instance transform, without procedural-tree deformation. */
vec3 terrainProjectAssetAssemblyTransformPositionOS(vec3 positionOS, Attributes attributes) {
  #ifdef RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE
    return positionOS;
  #else
    vec3 transformed = terrainProjectAssetAssemblyRotate(
      terrainProjectAssetAssemblyRotation(attributes),
      positionOS * terrainProjectAssetAssemblyEmbeddedScale(attributes)
    ) + attributes.ASSEMBLY_POSITION.xyz;
    #if defined(RENDERER_ASSET_ASSEMBLY_COMPACT_INSTANCE)
      return transformed;
    #elif defined(RENDERER_PROCEDURAL_TREE_GPU_VARIATION)
      return transformed;
    #else
      return mix(attributes.ASSEMBLY_POSITION.xyz, transformed, attributes.ASSEMBLY_POSITION.w);
    #endif
  #endif
}

vec3 terrainProjectAssetAssemblyPositionOS(vec3 positionOS, Attributes attributes) {
  return terrainProjectAssetAssemblyTransformPositionOS(
    terrainProjectProceduralTreeVariationPositionOS(positionOS, attributes),
    attributes
  );
}

float terrainProjectProceduralTreeLeafShape(Attributes attributes) {
  #ifdef RENDERER_PROCEDURAL_TREE_LEAF_MASK_LIBRARY
    return clamp(floor(renderer_ProceduralTreeLeafShape + 0.5), 0.0, 4.0);
  #else
    return 0.0;
  #endif
}

vec3 terrainProjectAssetAssemblyOriginOS(Attributes attributes) {
  #ifdef RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE
    return vec3(0.0);
  #else
    return attributes.ASSEMBLY_POSITION.xyz;
  #endif
}

vec3 terrainProjectAssetAssemblyNormalOS(vec3 normalOS, Attributes attributes) {
  #if defined(RENDERER_PROCEDURAL_TREE_GPU_VARIATION) && !defined(RENDERER_PROCEDURAL_TREE_LEAF_BILLBOARD)
    normalOS = terrainProjectProceduralTreeVariationVectorOS(normalOS, attributes);
  #endif
  #ifdef RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE
    // renderer_NormalMat applies the Entity transform after this function.
    return normalize(normalOS);
  #else
    #if defined(RENDERER_PROCEDURAL_TREE_GPU_VARIATION) && !defined(RENDERER_PROCEDURAL_TREE_GPU_BRANCH_VARIATION) && !defined(RENDERER_PROCEDURAL_TREE_LEAF_BILLBOARD)
      // Fixed GPU leaves receive a uniform local scale above, so their shading frame must
      // not inherit the tree silhouette's inverse non-uniform normal transform.
      vec3 inverseScaleNormal = normalOS;
    #else
      vec3 inverseScaleNormal = normalOS / max(abs(terrainProjectAssetAssemblyEmbeddedScale(attributes)), vec3(0.00001));
    #endif
    vec3 instanceNormalOS = normalize(
      terrainProjectAssetAssemblyRotate(terrainProjectAssetAssemblyRotation(attributes), inverseScaleNormal)
    );
    return instanceNormalOS;
  #endif
}

vec3 terrainProjectAssetAssemblyTangentOS(vec3 tangentOS, Attributes attributes) {
  #if defined(RENDERER_PROCEDURAL_TREE_GPU_VARIATION) && !defined(RENDERER_PROCEDURAL_TREE_LEAF_BILLBOARD)
    tangentOS = terrainProjectProceduralTreeVariationVectorOS(tangentOS, attributes);
  #endif
  #ifdef RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE
    return normalize(tangentOS);
  #else
    return normalize(
      terrainProjectAssetAssemblyRotate(terrainProjectAssetAssemblyRotation(attributes), tangentOS)
    );
  #endif
}

vec3 terrainProjectAssetAssemblyColor(Attributes attributes) {
  #ifdef RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG
    return material_ProceduralTreeColorCatalog[terrainProjectProceduralTreeCatalogIndex(attributes)].rgb;
  #elif defined(RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE)
    #if defined(RENDERER_PROCEDURAL_TREE_GPU_VARIATION) && !defined(RENDERER_PROCEDURAL_TREE_GPU_BRANCH_VARIATION)
      return renderer_ProceduralTreeLeafColor.rgb;
    #else
      return renderer_AssetAssemblyColor.rgb;
    #endif
  #else
    #if defined(RENDERER_ASSET_ASSEMBLY_COMPACT_INSTANCE)
      return vec3(1.0);
    #elif defined(RENDERER_PROCEDURAL_TREE_GPU_VARIATION) && !defined(RENDERER_PROCEDURAL_TREE_GPU_BRANCH_VARIATION)
      return attributes.ASSEMBLY_TREE_LEAF_COLOR.rgb;
    #else
      return attributes.ASSEMBLY_COLOR.rgb;
    #endif
  #endif
}

float terrainProjectAssetAssemblyLodFade(Attributes attributes) {
  #ifdef RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG
    return clamp(attributes.ASSEMBLY_POSITION.w, -1.0, 1.0);
  #elif defined(RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE)
    return terrainProjectLodFade();
  #else
    #if defined(RENDERER_ASSET_ASSEMBLY_COMPACT_INSTANCE)
      return clamp(attributes.ASSEMBLY_POSITION.w, -1.0, 1.0);
    #elif defined(RENDERER_PROCEDURAL_TREE_GPU_VARIATION) && !defined(RENDERER_PROCEDURAL_TREE_GPU_BRANCH_VARIATION)
      return clamp(attributes.ASSEMBLY_TREE_LEAF_COLOR.w, -1.0, 1.0);
    #else
      return clamp(attributes.ASSEMBLY_COLOR.w, -1.0, 1.0);
    #endif
  #endif
}

#endif
