#ifndef TERRAIN_PROJECT_ASSET_ASSEMBLY_ATTRIBUTES_INCLUDED
#define TERRAIN_PROJECT_ASSET_ASSEMBLY_ATTRIBUTES_INCLUDED

struct Attributes {
  vec3 POSITION;
  #ifdef RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION
    float PLANT_CANOPY_DEPTH;
  #endif
  #if defined(MATERIAL_WIND_PROCEDURAL_PLANT) || defined(MATERIAL_WIND_PROCEDURAL_FLOWER)
    // Tree xyz: rest hinge axis. Flower xyz: rest beam section. w: canonical beam height.
    vec4 PLANT_WIND;
  #endif
  #if defined(RENDERER_GENERATION_REVEAL) && defined(RENDERER_INSTANCE_GENERATION_REVEAL)
    // x: newly published instance, yz: world-space reveal origin and height.
    vec3 GENERATION_REVEAL;
  #endif
  #ifdef RENDERER_HAS_UV
    vec2 TEXCOORD_0;
  #endif
  #ifdef RENDERER_HAS_UV1
    vec2 TEXCOORD_1;
  #endif
  #if (defined(MATERIAL_WIND_HERO_TREE_HIERARCHY) || defined(MATERIAL_WIND_SLOD_FAR)) && (defined(MATERIAL_VEGETATION_CLIMATE_BRANCH) || defined(MATERIAL_VEGETATION_CLIMATE_LEAF))
    // Asset Assembly tree batches retain the direct-Prefab mechanical element/root-tip
    // coordinate. Per-instance transforms remain isolated in the Assembly buffer below.
    vec2 TEXCOORD_3;
  #endif
  #ifdef RENDERER_ENABLE_VERTEXCOLOR
    vec4 COLOR_0;
  #endif
  #ifdef RENDERER_HAS_NORMAL
    vec3 NORMAL;
  #endif
  #ifdef RENDERER_HAS_TANGENT
    vec4 TANGENT;
  #endif
  #ifdef RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME
    vec2 TEXCOORD_2;
    vec3 LEAF_SHAPE_POSITION;
    vec3 LEAF_SHAPE_NORMAL;
  #endif
  #if !defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME) && (defined(RENDERER_PROCEDURAL_TREE_LEAF_BILLBOARD) || defined(MATERIAL_WIND_PROCEDURAL_TREE) || (defined(RENDERER_PROCEDURAL_TREE_GPU_VARIATION) && !defined(RENDERER_PROCEDURAL_TREE_GPU_BRANCH_VARIATION)))
    vec3 LEAF_PIVOT;
  #endif
  #if !defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME) && defined(RENDERER_PROCEDURAL_TREE_LEAF_BILLBOARD)
    vec3 LEAF_UP;
    vec2 LEAF_LOCAL;
  #endif
  #if defined(RENDERER_PROCEDURAL_TREE_GPU_VARIATION) || defined(MATERIAL_WIND_PROCEDURAL_TREE)
    vec4 TREE_VARIATION_ROOT;
    // x: branch influence, y: leaf visibility rank, z: primary-subtree visibility rank.
    vec4 TREE_VARIATION_DATA;
  #endif
  #ifdef RENDERER_PROCEDURAL_TREE_GPU_BRANCH_VARIATION
    // Woody vertices use the generated centerline for shape variation.
    vec3 TREE_VARIATION_CENTER;
  #endif
  #ifndef RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE
    // Compact instances reuse POSITION.w for signed LOD fade and keep color Material-owned.
    vec4 ASSEMBLY_POSITION;
    vec4 ASSEMBLY_ROTATION;
    vec4 ASSEMBLY_SCALE;
    #ifndef RENDERER_ASSET_ASSEMBLY_COMPACT_INSTANCE
      // rgb: material tint, w: signed LOD dither coverage. Never store discrete tree style data in w.
      vec4 ASSEMBLY_COLOR;
    #endif
    #if defined(RENDERER_PROCEDURAL_TREE_GPU_VARIATION) && !defined(RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG)
      // x: branch length, y: leaf density, z: leaf-card size, w: branch-direction seed.
      vec4 ASSEMBLY_TREE_VARIATION;
      // rgb: linear per-instance leaf color, w: signed LOD coverage for the GPU leaf variant.
      // The leaf variant already consumes this attribute; keeping fade here avoids activating
      // ASSEMBLY_COLOR and exceeding the WebGL vertex-input budget of the full leaf program.
      vec4 ASSEMBLY_TREE_LEAF_COLOR;
    #endif
  #endif
};

#endif
