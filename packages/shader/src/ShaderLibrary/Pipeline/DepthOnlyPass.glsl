#ifndef DEPTH_ONLY_PASS_INCLUDED
#define DEPTH_ONLY_PASS_INCLUDED

#include "ShaderLibrary/Common/Common.glsl"
#include "ShaderLibrary/Common/Transform.glsl"
#include "ShaderLibrary/Common/Attributes.glsl"
#include "ShaderLibrary/Skin/Skin.glsl"
#include "ShaderLibrary/Skin/BlendShape.glsl"

#ifdef MATERIAL_IS_ALPHA_CUTOFF
  vec4 material_TilingOffset;
  vec4 material_BaseColor;
  float material_AlphaCutoff;
  #ifdef MATERIAL_HAS_BASETEXTURE
    sampler2D material_BaseTexture;
  #endif
#endif

struct Varyings {
  vec2 v_uv;
  #if defined(MATERIAL_IS_ALPHA_CUTOFF) && defined(DEPTH_ONLY_USE_VERTEX_ALPHA) && defined(RENDERER_ENABLE_VERTEXCOLOR)
    float v_vertexAlpha;
  #endif
};

Varyings vert(Attributes attr) {
  Varyings v;
  vec4 position = vec4(attr.POSITION, 1.0);

  #ifdef RENDERER_HAS_NORMAL
    vec3 normal = vec3(attr.NORMAL);
    #ifdef RENDERER_HAS_TANGENT
      vec4 tangent = vec4(attr.TANGENT);
    #endif
  #endif

  #ifdef RENDERER_HAS_BLENDSHAPE
    calculateBlendShape(attr, position
      #ifdef RENDERER_HAS_NORMAL
        , normal
        #ifdef RENDERER_HAS_TANGENT
          , tangent
        #endif
      #endif
    );
  #endif

  #ifdef RENDERER_HAS_SKIN
    mat4 skinMatrix = getSkinMatrix(attr);
    position = skinMatrix * position;
  #endif

  #ifdef MATERIAL_IS_ALPHA_CUTOFF
    vec2 uv = vec2(0.0);
    #ifdef RENDERER_HAS_UV
      uv = attr.TEXCOORD_0;
    #endif
    #ifdef MATERIAL_NEED_TILING_OFFSET
      uv = uv * material_TilingOffset.xy + material_TilingOffset.zw;
    #endif
    v.v_uv = uv;
    #if defined(DEPTH_ONLY_USE_VERTEX_ALPHA) && defined(RENDERER_ENABLE_VERTEXCOLOR)
      v.v_vertexAlpha = attr.COLOR_0.a;
    #endif
  #else
    v.v_uv = vec2(0.0);
  #endif

  gl_Position = renderer_MVPMat * position;
  return v;
}

void frag(Varyings v) {
  #ifdef MATERIAL_IS_ALPHA_CUTOFF
    float alpha = material_BaseColor.a;
    #ifdef MATERIAL_HAS_BASETEXTURE
      alpha *= texture2D(material_BaseTexture, v.v_uv).a;
    #endif
    #if defined(DEPTH_ONLY_USE_VERTEX_ALPHA) && defined(RENDERER_ENABLE_VERTEXCOLOR)
      alpha *= v.v_vertexAlpha;
    #endif
    if (alpha < material_AlphaCutoff) {
      discard;
    }
  #endif
}

#endif
