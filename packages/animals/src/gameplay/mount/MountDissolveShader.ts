// Adapted from project 0f463b65-f20d-45b3-8d5d-e1e145473b6a, shader/dissolve.glsl.
// Keep the current engine's PBR and skin includes; never replace global engine includes.
const dissolve = `
sampler2D mount_NoiseTexture;
float mount_Visibility;
float mount_EdgeWidth;
vec3 mount_EdgeColor;
float mountDissolve(vec2 uv) {
  if (mount_Visibility >= 1.0) return 1.0;
  if (mount_Visibility <= 0.0) discard;
  float diff = mount_Visibility * (1.0 + mount_EdgeWidth) - texture2D(mount_NoiseTexture, uv).r;
  if (diff <= 0.0) discard;
  return clamp(diff / max(mount_EdgeWidth, 0.0001), 0.0, 1.0);
}
`;

const depthPass = (shadow: boolean) => `
Pass "${shadow ? "ShadowCaster" : "DepthOnly"}" {
  Tags { pipelineStage = "${shadow ? "ShadowCaster" : "DepthOnly"}" }
  VertexShader = mountDepthVertex;
  FragmentShader = mountDepthFragment;
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
  struct MountDepthVaryings { vec2 uv; };
  MountDepthVaryings mountDepthVertex(Attributes attr) {
    MountDepthVaryings v;
    v.uv = getUV0(attr);
    VertexInputs inputs = getVertexInputs(attr);
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
  void mountDepthFragment(MountDepthVaryings v) {
    mountDissolve(v.uv);
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

/** PBR dissolve presentation with matching depth and shadow masks. */
export const MOUNT_DISSOLVE_SHADER = `Shader "Mount/Dissolve" {
SubShader "Default" {
  ${depthPass(true)}
  ${depthPass(false)}
  Pass "Forward" {
    Tags { pipelineStage = "Forward" }
    RenderQueueType renderQueueType;
    BlendFactor sourceColorBlendFactor;
    BlendFactor destinationColorBlendFactor;
    BlendFactor sourceAlphaBlendFactor;
    BlendFactor destinationAlphaBlendFactor;
    CullMode rasterStateCullMode;
    Bool blendEnabled;
    Bool depthWriteEnabled;
    DepthState = { WriteEnabled = depthWriteEnabled; }
    BlendState = {
      Enabled = blendEnabled;
      SourceColorBlendFactor = sourceColorBlendFactor;
      DestinationColorBlendFactor = destinationColorBlendFactor;
      SourceAlphaBlendFactor = sourceAlphaBlendFactor;
      DestinationAlphaBlendFactor = destinationAlphaBlendFactor;
    }
    RasterState = { CullMode = rasterStateCullMode; }
    RenderQueueType = renderQueueType;
    VertexShader = PBRVertex;
    FragmentShader = mountFragment;
    #include "ShaderLibrary/PBR/ForwardPassPBR.glsl"
    ${dissolve}
    void mountFragment(Varyings v) {
      float edge = mountDissolve(v.uv);
      PBRFragment(v);
      gl_FragColor.rgb = mix(mount_EdgeColor, gl_FragColor.rgb, edge);
    }
  }
}}
`;
