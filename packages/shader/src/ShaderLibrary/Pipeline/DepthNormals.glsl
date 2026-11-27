#ifndef DEPTH_NORMALS_INCLUDED
#define DEPTH_NORMALS_INCLUDED

#if defined(RENDERER_HAS_NORMAL) && !defined(MATERIAL_OMIT_NORMAL) && defined(RENDERER_HAS_TANGENT) && (defined(MATERIAL_HAS_NORMALTEXTURE) || (defined(DEPTH_NORMALS_PBR) && defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE)))
  #define NEED_VERTEX_TANGENT
#endif

#if defined(MATERIAL_HAS_NORMALTEXTURE) || (defined(DEPTH_NORMALS_PBR) && (defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE) || defined(MATERIAL_ENABLE_ANISOTROPY)))
  #define NEED_TANGENT_SPACE
#endif

#include "ShaderLibrary/Common/Common.glsl"
#include "ShaderLibrary/Common/Normal.glsl"
#include "ShaderLibrary/Common/Transform.glsl"
#include "ShaderLibrary/Common/Attributes.glsl"
#include "ShaderLibrary/Skin/Skin.glsl"
#include "ShaderLibrary/Skin/BlendShape.glsl"
#include "ShaderLibrary/Pipeline/DepthNormalsCommon.glsl"
#include "ShaderLibrary/PBR/VertexPBR.glsl"

vec4 material_BaseColor;
float material_AlphaCutoff;
#ifdef MATERIAL_HAS_BASETEXTURE
  sampler2D material_BaseTexture;
#endif

float material_NormalIntensity;
#ifdef MATERIAL_HAS_NORMALTEXTURE
  sampler2D material_NormalTexture;
#endif

#ifdef DEPTH_NORMALS_PBR
  #define DEPTH_NORMALS_MIN_ROUGHNESS 0.045

  float material_Roughness;
  float material_ScreenSpaceReflectionIntensity;
  #ifdef MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE
    sampler2D material_RoughnessMetallicTexture;
  #endif

  #ifdef MATERIAL_ENABLE_CLEAR_COAT
    float material_ClearCoat;
    float material_ClearCoatRoughness;
    #ifdef MATERIAL_HAS_CLEAR_COAT_TEXTURE
      sampler2D material_ClearCoatTexture;
    #endif
    #ifdef MATERIAL_HAS_CLEAR_COAT_ROUGHNESS_TEXTURE
      sampler2D material_ClearCoatRoughnessTexture;
    #endif
    #ifdef MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE
      sampler2D material_ClearCoatNormalTexture;
    #endif
  #endif

  #ifdef MATERIAL_ENABLE_ANISOTROPY
    vec3 material_AnisotropyInfo;
    #ifdef MATERIAL_HAS_ANISOTROPY_TEXTURE
      sampler2D material_AnisotropyTexture;
    #endif
  #endif

  float depthNormalsGetAARoughnessFactor(vec3 n) {
    vec3 dxy = max(abs(dFdx(n)), abs(dFdy(n)));
    return max(max(dxy.x, dxy.y), dxy.z);
  }
#endif

struct Varyings {
  vec2 uv;
  #ifdef RENDERER_ENABLE_VERTEXCOLOR
    float vertexAlpha;
  #endif
  vec3 positionWS;
  #if defined(RENDERER_HAS_NORMAL) && !defined(MATERIAL_OMIT_NORMAL)
    vec3 normalWS;
    #ifdef NEED_VERTEX_TANGENT
      vec3 tangentWS;
      vec3 bitangentWS;
    #endif
  #endif
};

Varyings depthNormalsVertex(Attributes attributes) {
  Varyings varyings;
  VertexInputs inputs = getVertexInputs(attributes);
  varyings.uv = getUV0(attributes);
  varyings.positionWS = inputs.positionWS;

  #if defined(RENDERER_HAS_NORMAL) && !defined(MATERIAL_OMIT_NORMAL)
    varyings.normalWS = inputs.normalWS;
    #ifdef NEED_VERTEX_TANGENT
      varyings.tangentWS = inputs.tangentWS;
      varyings.bitangentWS = inputs.bitangentWS;
    #endif
  #endif

  #ifdef RENDERER_ENABLE_VERTEXCOLOR
    varyings.vertexAlpha = attributes.COLOR_0.a;
  #endif

  gl_Position = renderer_MVPMat * inputs.positionOS;
  return varyings;
}

void depthNormalsFragment(Varyings varyings) {
  vec2 uv = varyings.uv;

  #ifdef MATERIAL_IS_ALPHA_CUTOFF
    float alpha = material_BaseColor.a;
    #ifdef MATERIAL_HAS_BASETEXTURE
      alpha *= texture2D(material_BaseTexture, uv).a;
    #endif
    #ifdef RENDERER_ENABLE_VERTEXCOLOR
      alpha *= varyings.vertexAlpha;
    #endif
    if (alpha < material_AlphaCutoff) {
      discard;
    }
  #endif

  #if defined(RENDERER_HAS_NORMAL) && !defined(MATERIAL_OMIT_NORMAL)
    vec3 geomNormal = normalize(varyings.normalWS);
  #else
    vec3 geomNormal = normalize(cross(dFdx(varyings.positionWS), dFdy(varyings.positionWS))) * camera_ProjectionParams.x;
  #endif
  bool frontFacing = gl_FrontFacing;
  geomNormal *= float(frontFacing) * 2.0 - 1.0;

  vec3 surfaceNormal = geomNormal;
  #ifdef NEED_TANGENT_SPACE
    #ifdef NEED_VERTEX_TANGENT
      mat3 tbn = mat3(varyings.tangentWS, varyings.bitangentWS, varyings.normalWS);
    #else
      mat3 tbn = getTBNByDerivatives(uv, geomNormal, varyings.positionWS, frontFacing);
    #endif
    #ifdef MATERIAL_HAS_NORMALTEXTURE
      surfaceNormal = getNormalByNormalTexture(tbn, material_NormalTexture, material_NormalIntensity, uv, frontFacing);
    #endif
  #endif

  #ifdef DEPTH_NORMALS_PBR
    float roughness = material_Roughness;
    #ifdef MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE
      roughness *= texture2D(material_RoughnessMetallicTexture, uv).g;
    #endif
    float baseRoughness = max(DEPTH_NORMALS_MIN_ROUGHNESS, min(roughness + depthNormalsGetAARoughnessFactor(surfaceNormal), 1.0));

    #ifdef MATERIAL_ENABLE_ANISOTROPY
      #ifdef CAMERA_ORTHOGRAPHIC
        vec3 viewDir = -camera_Forward;
      #else
        vec3 viewDir = normalize(camera_Position - varyings.positionWS);
      #endif
      float aniso = material_AnisotropyInfo.z;
      vec3 anisoDir = vec3(material_AnisotropyInfo.xy, 0.0);
      #ifdef MATERIAL_HAS_ANISOTROPY_TEXTURE
        vec3 anisoInfo = texture2D(material_AnisotropyTexture, uv).rgb;
        aniso *= anisoInfo.b;
        anisoDir.xy *= anisoInfo.rg * 2.0 - 1.0;
      #endif
      vec3 anisoT = normalize(mat3(tbn[0], tbn[1], surfaceNormal) * anisoDir);
      vec3 anisoB = normalize(cross(surfaceNormal, anisoT));
      vec3 anisotropyDirection = (aniso >= 0.0) ? anisoB : anisoT;
      vec3 anisotropicTangent = cross(anisotropyDirection, viewDir);
      vec3 anisotropicNormal = cross(anisotropicTangent, anisotropyDirection);
      surfaceNormal = normalize(mix(surfaceNormal, anisotropicNormal, abs(aniso) * saturate(5.0 * roughness)));
    #endif

    vec3 chosenNormal = surfaceNormal;
    float chosenRoughness = baseRoughness;

    #ifdef MATERIAL_ENABLE_CLEAR_COAT
      float clearCoat = material_ClearCoat;
      float ccRoughness = material_ClearCoatRoughness;
      #ifdef MATERIAL_HAS_CLEAR_COAT_TEXTURE
        clearCoat *= texture2D(material_ClearCoatTexture, uv).r;
      #endif
      #ifdef MATERIAL_HAS_CLEAR_COAT_ROUGHNESS_TEXTURE
        ccRoughness *= texture2D(material_ClearCoatRoughnessTexture, uv).g;
      #endif
      clearCoat = saturate(clearCoat);
      #ifdef MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE
        vec3 ccNormal = getNormalByNormalTexture(tbn, material_ClearCoatNormalTexture, material_NormalIntensity, uv, frontFacing);
      #else
        vec3 ccNormal = geomNormal;
      #endif
      float finalCCRoughness = max(DEPTH_NORMALS_MIN_ROUGHNESS, min(ccRoughness + depthNormalsGetAARoughnessFactor(ccNormal), 1.0));
      if (clearCoat > 0.1 && finalCCRoughness < baseRoughness) {
        chosenNormal = ccNormal;
        chosenRoughness = finalCCRoughness;
      }
    #endif

    // Shared DepthNormals prepass never discards matte/SSR-disabled opaque geometry; mark roughness = 1.0 instead.
    #ifdef MATERIAL_OMIT_SSR
      chosenRoughness = 1.0;
    #else
      if (!(material_ScreenSpaceReflectionIntensity > 0.0)) {
        chosenRoughness = 1.0;
      }
    #endif

    gl_FragColor = packDepthNormals(chosenNormal, chosenRoughness);
  #else
    gl_FragColor = packDepthNormals(surfaceNormal, 1.0);
  #endif
}

#endif
