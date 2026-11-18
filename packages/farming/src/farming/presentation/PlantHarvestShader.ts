import plantTint from "../procedural/runtime/PlantOrganTint.shader?raw";

const dissolve = `
sampler2D harvest_NoiseTexture;
float harvest_Visibility;
float harvest_EdgeWidth;
vec3 harvest_EdgeColor;
float harvestDissolve(vec3 positionWS) {
  if (harvest_Visibility >= 1.0) return 1.0;
  if (harvest_Visibility <= 0.0) discard;
  float diff = harvest_Visibility * (1.0 + harvest_EdgeWidth) - texture2D(harvest_NoiseTexture, positionWS.xy * 1.5 + positionWS.z * 0.37).r;
  if (diff <= 0.0) discard;
  return clamp(diff / max(harvest_EdgeWidth, 0.0001), 0.0, 1.0);
}
`;

const depthPass = (shadow: boolean) => `
Pass "${shadow ? "ShadowCaster" : "DepthOnly"}" {
  Tags { pipelineStage = "${shadow ? "ShadowCaster" : "DepthOnly"}" }
  VertexShader = harvestDepthVertex;
  FragmentShader = harvestDepthFragment;
  #include "ShaderLibrary/Common/Common.glsl"
  #include "ShaderLibrary/Common/Transform.glsl"
  #include "ShaderLibrary/Common/Attributes.glsl"
  #include "ShaderLibrary/Skin/Skin.glsl"
  #include "ShaderLibrary/Skin/BlendShape.glsl"
  #include "ShaderLibrary/PBR/VertexPBR.glsl"
  ${dissolve}
  vec4 material_BaseColor;
  sampler2D material_BaseTexture;
  float material_AlphaCutoff;
  ${shadow ? "vec2 scene_ShadowBias; vec3 scene_LightDirection;" : ""}
  struct HarvestDepthVaryings { vec2 uv; vec3 positionWS; };
  HarvestDepthVaryings harvestDepthVertex(Attributes attr) {
    HarvestDepthVaryings v;
    v.uv = getUV0(attr);
    VertexInputs inputs = getVertexInputs(attr);
    v.positionWS = inputs.positionWS;
    vec3 position = inputs.positionWS;
    ${
      shadow
        ? `
    position -= scene_LightDirection * scene_ShadowBias.x;
    #ifdef RENDERER_HAS_NORMAL
      float scale = (1.0 - clamp(dot(-scene_LightDirection, inputs.normalWS), 0.0, 1.0)) * scene_ShadowBias.y;
      position += inputs.normalWS * scale;
    #endif`
        : ""
    }
    gl_Position = camera_VPMat * vec4(position, 1.0);
    ${shadow ? "gl_Position.z = max(gl_Position.z, -1.0);" : ""}
    return v;
  }
  void harvestDepthFragment(HarvestDepthVaryings v) {
    harvestDissolve(v.positionWS);
    #ifdef MATERIAL_IS_ALPHA_CUTOFF
      float alpha = material_BaseColor.a;
      #ifdef MATERIAL_HAS_BASETEXTURE
        alpha *= texture2D(material_BaseTexture, v.uv).a;
      #endif
      if (alpha < material_AlphaCutoff) discard;
    #endif
    #ifdef ENGINE_NO_DEPTH_TEXTURE
      vec4 packedDepth = fract(gl_FragCoord.z * vec4(1.0, 256.0, 65536.0, 16777216.0));
      gl_FragColor = packedDepth - packedDepth.gbaa * vec4(0.00390625, 0.00390625, 0.00390625, 0.0);
    #else
      gl_FragColor = vec4(0.0);
    #endif
  }
}`;

/** Preserve organ tint and texture cutout while dissolving color, depth and shadows together. */
export const PLANT_HARVEST_SHADER = plantTint
  .replace('Shader "Farming/PlantOrganTint"', 'Shader "Farming/HarvestDissolve"')
  .replace('UsePass "Pipeline/ShadowCaster/Default/ShadowCaster"', depthPass(true))
  .replace('UsePass "Pipeline/DepthOnly/Default/DepthOnly"', depthPass(false))
  .replace('UsePass "Pipeline/ScreenSpaceReflectionSurface/Default/ScreenSpaceReflectionSurface"', "")
  .replace("vec4 renderer_OrganTint;", `vec4 renderer_OrganTint; ${dissolve}`)
  .replace(
    "void PBRFragment(Varyings varyings) {",
    "void PBRFragment(Varyings varyings) { float harvestEdge = harvestDissolve(varyings.positionWS);"
  )
  .replace(
    "gl_FragColor = color;",
    "color.rgb = mix(harvest_EdgeColor, color.rgb, harvestEdge); gl_FragColor = color;"
  );
