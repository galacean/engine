Shader "BlinnPhong" {
  Editor {
    Properties {
      Header("Base") {
        /** Base RGB tint and alpha multiplier. */
        material_BaseColor("BaseColor", Color) = (1, 1, 1, 1);
        /** RGBA texture multiplied by the base color. */
        material_BaseTexture("BaseTexture", Texture2D);
      }

      Header("Emissive") {
        /** Emitted RGB color, added independently of scene lighting. */
        material_EmissiveColor("EmissiveColor", HDRColor) = (0, 0, 0, 1);
        /** RGB texture multiplied by the emissive color. */
        material_EmissiveTexture("EmissiveTexture", Texture2D);
      }

      Header("Normal") {
        /** Tangent-space normal map; RGB values in [0, 1] decode to XYZ in [-1, 1]. */
        material_NormalTexture("NormalTexture", Texture2D);
        /** Scales the normal map's tangent-space X and Y components. */
        material_NormalIntensity("NormalIntensity", Range(0, 5, 0.01)) = 1;
      }

      Header("Specular") {
        /** RGB tint of specular reflection. */
        material_SpecularColor("SpecularColor", Color) = (1, 1, 1, 1);
        /** RGB texture multiplied by the specular color. */
        material_SpecularTexture("SpecularTexture", Texture2D);
        /** Specular exponent; larger values produce narrower highlights. */
        material_Shininess("Shininess", Range(0, 100, 1)) = 16;
      }

      Header("Common") {
        /** Enables alpha blending and disables depth writes. */
        isTransparent("Transparent", Boolean) = false;
        /** Selects which sides of triangles are rendered. */
        renderFace("Render Face", Enum(Front:0, Back:1, Double:2)) = 0;
        /** Alpha blending mode, used when isTransparent is true. */
        blendMode("Blend Mode", Enum(Normal:0, Additive:1)) = 0;
        /** Discards fragments below this alpha threshold; zero disables alpha testing. */
        material_AlphaCutoff("AlphaCutoff", Range(0, 1, 0.01)) = 0;
        /** Scales UV0 by (x, y), then adds the (z, w) offset. */
        material_TilingOffset("TilingOffset", Vector4) = (1, 1, 0, 0);
      }
    }

  }

  SubShader "Default" {
    UsePass "Pipeline/ShadowCaster/Default/ShadowCaster"
    UsePass "Pipeline/DepthOnly/Default/DepthOnly"

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

      VertexShader = BlinnPhongVertex;
      FragmentShader = BlinnPhongFragment;

      #include "ShaderLibrary/BlinnPhong/ForwardPassBlinnPhong.glsl"
    }
  }
}
