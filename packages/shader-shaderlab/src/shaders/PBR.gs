Shader "PBRShaderName" {
  Editor {
    Properties{
      Header("Base"){
        material_IOR("IOR", Range(0, 5, 0.01)) = 1.5;
        material_BaseColor("BaseColor", Color) = (1, 1, 1, 1);
        material_BaseTexture("BaseTexture", Texture2D);
      }

      Header("Metal Roughness") {
        material_Metal( "Metal", Range(0,1,0.01) ) = 1;
        material_Roughness( "Roughness", Range( 0, 1, 0.01 ) ) = 1;
        material_RoughnessMetallicTexture("RoughnessMetallicTexture", Texture2D);
      }

      Header("Anisotropy") {
        anisotropy("Intensity", Range(0, 1, 0.01)) = 0;
        anisotropyRotation("Rotation", Range(0, 360, 1)) = 0;
        material_AnisotropyTexture("Texture", Texture2D);
      }

      Header("Normal") {
        material_NormalTexture("NormalTexture", Texture2D);
        material_NormalIntensity("NormalIntensity", Range(0, 5, 0.01)) = 1;
      }

      Header("Emissive") {
        material_EmissiveColor("EmissiveColor", Color ) = (0, 0, 0, 1);
        material_EmissiveTexture("EmissiveTexture", Texture2D);
      }

      Header("Occlusion") {
        material_OcclusionTexture("OcclusionTexture", Texture2D);
        material_OcclusionIntensity("OcclusionIntensity", Range(0, 5, 0.01)) = 1;
        material_OcclusionTextureCoord("OcclusionTextureCoord", Float) = 0;
      }
      
      Header("Clear Coat") {
        material_ClearCoat("ClearCoat", Range(0, 1, 0.01)) = 0;
        material_ClearCoatTexture("ClearCoatTexture", Texture2D);
        material_ClearCoatRoughness("ClearCoatRoughness", Range(0, 1, 0.01)) = 0;
        material_ClearCoatRoughnessTexture("ClearCoatRoughnessTexture", Texture2D);
        material_ClearCoatNormalTexture("ClearCoatNormalTexture", Texture2D);
      }

      Header("Thin Film Iridescence"){
        material_Iridescence("Iridescence", Range(0, 1, 0.01)) = 0;
        material_IridescenceIOR("IOR", Range(1, 5, 0.01)) = 1.3;
        material_IridescenceRange("ThicknessRange", Vector2) = (100,400);
        material_IridescenceThicknessTexture("ThicknessTexture", Texture2D);
        material_IridescenceTexture("IridescenceTexture", Texture2D);
      }

      Header("Sheen"){
        sheenColor("Color", Color ) = (0, 0, 0, 1);
        sheenIntensity("Intensity", Range(0, 1, 0.01)) = 1;
        material_SheenRoughness("Roughness", Range(0, 1, 0.01)) = 0;
        material_SheenTexture("ColorTexture", Texture2D);
        material_SheenRoughnessTexture("RoughnessTexture", Texture2D);
      }

      Header("Transmission") {
        material_Transmission("Transmission", Range(0, 1, 0.01)) = 0;
        material_TransmissionTexture("TransmissionTexture", Texture2D);
        material_Thickness("Thickness", Range(0, 5, 0.01)) = 0;
        material_ThicknessTexture("ThicknessTexture", Texture2D);
        refractionMode("RefractionMode", Enum(Sphere:0, Planar:1)) = 1;
        material_AttenuationColor("AttenuationColor", Color ) = (1, 1, 1, 1);
        material_AttenuationDistance("AttenuationDistance", Range(0, 1, 0.01)) = 0;
      }

      Header("Common") {
        isTransparent("Transparent", Boolean) = false;
        renderFace("Render Face", Enum(Front:0, Back:1, Double:2)) = 0;
        blendMode("Blend Mode", Enum(Normal:0, Additive:1)) = 0;
        material_AlphaCutoff( "AlphaCutoff", Range(0, 1, 0.01) ) = 0;
        material_TilingOffset("TilingOffset", Vector4) = (1, 1, 0, 0);
      }
    }
      
    UIScript "UIScriptPath";
  }
        
    SubShader "Default" {
      UsePass "pbr/Default/ShadowCaster"

      Pass "Forward Pass" {
        Tags { pipelineStage = "Forward"} 

        DepthState {
          WriteEnabled = depthWriteEnabled;
        }

        BlendState {
          Enabled = blendEnabled;
          SourceColorBlendFactor = sourceColorBlendFactor;
          DestinationColorBlendFactor = destinationColorBlendFactor;
          SourceAlphaBlendFactor = sourceAlphaBlendFactor;
          DestinationAlphaBlendFactor = destinationAlphaBlendFactor;
        }

        RasterState{
          CullMode = rasterStateCullMode;
        }

        RenderQueueType = renderQueueType;

        #define IS_METALLIC_WORKFLOW
        
        VertexShader = PBRVertex;
        FragmentShader = PBRFragment;

        #include "ForwardPassPBR.glsl"
      }
    }
  }