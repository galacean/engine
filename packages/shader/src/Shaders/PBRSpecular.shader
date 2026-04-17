Shader "PBRSpecular" {
  Editor {
    Properties {
      Header("Base") {
        material_IOR("IOR", Range(0, 5, 0.01)) = 1.5;
        material_BaseColor("BaseColor", Color) = (1, 1, 1, 1);
        material_BaseTexture("BaseTexture", Texture2D);
      }

      Header("Specular Glossiness") {
        material_SpecularColor("SpecularColor", Color) = (1, 1, 1, 1);
        material_Glossiness("Glossiness", Range(0, 1, 0.01)) = 1;
        material_SpecularGlossinessTexture("SpecularGlossinessTexture", Texture2D);
      }

      Header("Normal") {
        material_NormalTexture("NormalTexture", Texture2D);
        material_NormalIntensity("NormalIntensity", Range(0, 5, 0.01)) = 1;
      }

      Header("Emissive") {
        material_EmissiveColor("EmissiveColor", HDRColor) = (0, 0, 0, 1);
        material_EmissiveTexture("EmissiveTexture", Texture2D);
      }

      Header("Occlusion") {
        material_OcclusionTexture("OcclusionTexture", Texture2D);
        material_OcclusionIntensity("OcclusionIntensity", Range(0, 5, 0.01)) = 1;
        material_OcclusionTextureCoord("OcclusionTextureCoord", Enum(UV0:0, UV1:1)) = 0;
      }

      Header("Clear Coat") {
        material_ClearCoat("ClearCoat", Range(0, 1, 0.01)) = 0;
        material_ClearCoatTexture("ClearCoatTexture", Texture2D);
        material_ClearCoatRoughness("ClearCoatRoughness", Range(0, 1, 0.01)) = 0;
        material_ClearCoatRoughnessTexture("ClearCoatRoughnessTexture", Texture2D);
        material_ClearCoatNormalTexture("ClearCoatNormalTexture", Texture2D);
      }

      Header("Common") {
        isTransparent("Transparent", Boolean) = false;
        renderFace("Render Face", Enum(Front:0, Back:1, Double:2)) = 0;
        blendMode("Blend Mode", Enum(Normal:0, Additive:1)) = 0;
        material_AlphaCutoff("AlphaCutoff", Range(0, 1, 0.01)) = 0;
        material_TilingOffset("TilingOffset", Vector4) = (1, 1, 0, 0);
      }
    }

  }

  SubShader "Default" {
    UsePass "Utility/ShadowMap/Default/ShadowCaster"
    UsePass "Utility/DepthOnly/Default/DepthOnly"

    Pass "Forward Pass" {
      Tags { pipelineStage = "Forward" }

      RenderQueueType renderQueueType;
      BlendFactor sourceColorBlendFactor;
      BlendFactor destinationColorBlendFactor;
      BlendFactor sourceAlphaBlendFactor;
      BlendFactor destinationAlphaBlendFactor;
      CullMode rasterStateCullMode;
      Bool blendEnabled;
      Bool depthWriteEnabled;

      DepthState = {
        WriteEnabled = depthWriteEnabled;
      }

      BlendState = {
        Enabled = blendEnabled;
        SourceColorBlendFactor = sourceColorBlendFactor;
        DestinationColorBlendFactor = destinationColorBlendFactor;
        SourceAlphaBlendFactor = sourceAlphaBlendFactor;
        DestinationAlphaBlendFactor = destinationAlphaBlendFactor;
      }

      RasterState = {
        CullMode = rasterStateCullMode;
      }

      RenderQueueType = renderQueueType;

      VertexShader = PBRVertex;
      FragmentShader = PBRFragment;

      #include "PBR/ForwardPassPBR.glsl"
    }
  }
}
