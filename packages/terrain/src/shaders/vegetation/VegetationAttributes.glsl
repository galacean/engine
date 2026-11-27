#ifndef TERRAIN_PROJECT_VEGETATION_ATTRIBUTES_INCLUDED
#define TERRAIN_PROJECT_VEGETATION_ATTRIBUTES_INCLUDED

// Project-local extension of the Engine vertex contract. Hero woody geometry carries two
// component-coherent attachment anchors; leaf cards additionally carry their woody pivot.
// Ordinary vegetation retains the exact stock layout.
struct Attributes {
  vec3 POSITION;
  #ifdef RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION
    float PLANT_CANOPY_DEPTH;
  #endif
  #if defined(MATERIAL_WIND_PROCEDURAL_PLANT) || defined(MATERIAL_WIND_PROCEDURAL_FLOWER)
    vec4 PLANT_WIND;
  #endif
  #if defined(RENDERER_PROCEDURAL_TREE_GPU_VARIATION) || defined(MATERIAL_WIND_PROCEDURAL_TREE)
    vec4 TREE_VARIATION_ROOT;
    vec4 TREE_VARIATION_DATA;
  #endif
  #if !defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME) && defined(MATERIAL_WIND_PROCEDURAL_TREE)
    vec3 LEAF_PIVOT;
  #endif

  #ifdef RENDERER_HAS_BLENDSHAPE
    #ifndef RENDERER_BLENDSHAPE_USE_TEXTURE
      vec3 POSITION_BS0;
      vec3 POSITION_BS1;
      #if defined(RENDERER_BLENDSHAPE_HAS_NORMAL) && defined(RENDERER_BLENDSHAPE_HAS_TANGENT)
        vec3 NORMAL_BS0;
        vec3 NORMAL_BS1;
        vec3 TANGENT_BS0;
        vec3 TANGENT_BS1;
      #else
        #if defined(RENDERER_BLENDSHAPE_HAS_NORMAL) || defined(RENDERER_BLENDSHAPE_HAS_TANGENT)
          vec3 POSITION_BS2;
          vec3 POSITION_BS3;
          #ifdef RENDERER_BLENDSHAPE_HAS_NORMAL
            vec3 NORMAL_BS0;
            vec3 NORMAL_BS1;
            vec3 NORMAL_BS2;
            vec3 NORMAL_BS3;
          #endif
          #ifdef RENDERER_BLENDSHAPE_HAS_TANGENT
            vec3 TANGENT_BS0;
            vec3 TANGENT_BS1;
            vec3 TANGENT_BS2;
            vec3 TANGENT_BS3;
          #endif
        #else
          vec3 POSITION_BS2;
          vec3 POSITION_BS3;
          vec3 POSITION_BS4;
          vec3 POSITION_BS5;
          vec3 POSITION_BS6;
          vec3 POSITION_BS7;
        #endif
      #endif
    #endif
  #endif

  #ifdef RENDERER_HAS_UV
    vec2 TEXCOORD_0;
  #endif
  #if defined(RENDERER_HAS_UV1) || defined(MATERIAL_WIND_VERTEX_PIVOT)
    vec2 TEXCOORD_1;
  #endif
  #if defined(MATERIAL_WIND_HERO_TREE_HIERARCHY) || defined(MATERIAL_WIND_SLOD_FAR)
    // Quantized P3 contract: normalized uint16 element index + normalized uint16
    // element-local compliance progress. Full hierarchy variants resolve pivots from the
    // mechanical textures; LOD2 consumes only the card-coherent ID and root-tip coordinate.
    vec2 TEXCOORD_3;
  #endif
  #if defined(MATERIAL_WIND_VERTEX_PIVOT) && !defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME)
    vec2 TEXCOORD_2;
  #endif
  #ifdef RENDERER_HAS_SKIN
    vec4 JOINTS_0;
    vec4 WEIGHTS_0;
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
};

#endif
