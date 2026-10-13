Shader "PBR" {
  Editor {
    Properties{
      Header("Base"){
        /** Index of refraction used for dielectric reflection and transmission. */
        material_IOR("IOR", Range(0, 5, 0.01)) = 1.5;
        /** Base RGB tint and alpha multiplier. */
        material_BaseColor("BaseColor", Color) = (1, 1, 1, 1);
        /** RGBA texture multiplied by the base color. */
        material_BaseTexture("BaseTexture", Texture2D);
      }

      Header("Metal Roughness") {
        /** Metalness factor: zero is dielectric and one is metallic. */
        material_Metal( "Metal", Range(0,1,0.01) ) = 1;
        /** Surface roughness; larger values broaden specular highlights. */
        material_Roughness( "Roughness", Range( 0, 1, 0.01 ) ) = 1;
        /** G scales roughness; B scales metalness. */
        material_RoughnessMetallicTexture("RoughnessMetallicTexture", Texture2D);
      }
      
      Header("Specular") {
        /** Strength multiplier for specular reflection. */
        material_SpecularIntensity( "Intensity", Range(0,2,0.01) ) = 1;
        /** RGB tint of specular reflection. */
        material_SpecularColor( "Color", Color ) = (1, 1, 1, 1);
        /** Alpha channel scales specular intensity. */
        material_SpecularIntensityTexture("IntensityTexture", Texture2D);
        /** RGB texture multiplied by the specular color. */
        material_SpecularColorTexture("ColorTexture", Texture2D);
      }

      Header("Anisotropy") {
        /** Strength of direction-dependent roughness; zero is isotropic. */
        anisotropy("Intensity", Range(0, 1, 0.01)) = 0;
        /** Anisotropy direction angle in the tangent plane, in degrees. */
        anisotropyRotation("Rotation", Range(0, 360, 1)) = 0;
        /** RG maps to a tangent-plane direction in [-1, 1]; B scales anisotropy. */
        material_AnisotropyTexture("Texture", Texture2D);
      }

      Header("Normal") {
        /** Tangent-space normal map; RGB values in [0, 1] decode to XYZ in [-1, 1]. */
        material_NormalTexture("NormalTexture", Texture2D);
        /** Scales tangent-space X and Y for the surface and clear-coat normal maps. */
        material_NormalIntensity("NormalIntensity", Range(0, 5, 0.01)) = 1;
      }

      Header("Emissive") {
        /** Emitted RGB color, added independently of scene lighting. */
        material_EmissiveColor("EmissiveColor", HDRColor ) = (0, 0, 0, 1);
        /** RGB texture multiplied by the emissive color. */
        material_EmissiveTexture("EmissiveTexture", Texture2D);
      }

      Header("Occlusion") {
        /** R channel ambient-occlusion map; one leaves indirect lighting unoccluded. */
        material_OcclusionTexture("OcclusionTexture", Texture2D);
        /** Strength of the occlusion map; zero removes its effect. */
        material_OcclusionIntensity("OcclusionIntensity", Range(0, 5, 0.01)) = 1;
        /** UV set used to sample the occlusion texture. */
        material_OcclusionTextureCoord("OcclusionTextureCoord", Enum(UV0:0, UV1:1)) = 0;
      }
      
      Header("Clear Coat") {
        /** Strength of the additional clear-coat reflection layer. */
        material_ClearCoat("ClearCoat", Range(0, 1, 0.01)) = 0;
        /** R channel multiplier for clear-coat strength. */
        material_ClearCoatTexture("ClearCoatTexture", Texture2D);
        /** Roughness of the clear-coat reflection layer. */
        material_ClearCoatRoughness("ClearCoatRoughness", Range(0, 1, 0.01)) = 0;
        /** G channel multiplier for clear-coat roughness. */
        material_ClearCoatRoughnessTexture("ClearCoatRoughnessTexture", Texture2D);
        /** Tangent-space normal map for the clear-coat layer. */
        material_ClearCoatNormalTexture("ClearCoatNormalTexture", Texture2D);
      }

      Header("Thin Film Iridescence"){
        /** Strength of thin-film interference. */
        iridescence("Iridescence", Range(0, 1, 0.01)) = 0;
        /** Index of refraction of the thin-film layer. */
        iridescenceIOR("IOR", Range(1, 5, 0.01)) = 1.3;
        /** Minimum (x) and maximum (y) thin-film thickness in nanometers; without a thickness map, y is used. */
        iridescenceRange("ThicknessRange", Vector2) = (100, 400);
        /** G maps thickness between iridescenceRange.x and iridescenceRange.y. */
        material_IridescenceThicknessTexture("ThicknessTexture", Texture2D);
        /** R channel multiplier for thin-film interference strength. */
        material_IridescenceTexture("IridescenceTexture", Texture2D);
      }

      Header("Sheen"){
        /** RGB tint of the sheen reflection layer. */
        sheenColor("Color", Color ) = (0, 0, 0, 1);
        /** Strength multiplier for the sheen reflection color. */
        sheenIntensity("Intensity", Range(0, 1, 0.01)) = 1;
        /** Roughness of the sheen reflection layer. */
        material_SheenRoughness("Roughness", Range(0, 1, 0.01)) = 0;
        /** RGB texture multiplied by the sheen color. */
        material_SheenTexture("ColorTexture", Texture2D);
        /** Alpha channel scales sheen roughness. */
        material_SheenRoughnessTexture("RoughnessTexture", Texture2D);
      }

      Header("Transmission") {
        /** Fraction of light transmitted through the surface. */
        material_Transmission("Transmission", Range(0, 1, 0.01)) = 0;
        /** R channel multiplier for transmission. */
        material_TransmissionTexture("TransmissionTexture", Texture2D);
        /** Volume thickness in world units, used for refraction and light absorption. */
        material_Thickness("Thickness", Range(0, 5, 0.01)) = 0;
        /** G channel multiplier for volume thickness. */
        material_ThicknessTexture("ThicknessTexture", Texture2D);
        /** Shape approximation used to trace transmitted light through the material. */
        refractionMode("RefractionMode", Enum(Sphere:0, Planar:1)) = 1;
        /** RGB color reached by transmitted light after traveling the attenuation distance. */
        material_AttenuationColor("AttenuationColor", Color ) = (1, 1, 1, 1);
        /** Distance in world units to reach the attenuation color; use a positive value. */
        material_AttenuationDistance("AttenuationDistance", Range(0, 5, 0.01)) = 0;
      }

      Header("Common") {
        /** Enables alpha blending and disables depth writes. */
        isTransparent("Transparent", Boolean) = false;
        /** Selects which sides of triangles are rendered. */
        renderFace("Render Face", Enum(Front:0, Back:1, Double:2)) = 0;
        /** Alpha blending mode, used when isTransparent is true. */
        blendMode("Blend Mode", Enum(Normal:0, Additive:1)) = 0;
        /** Discards fragments below this alpha threshold; zero disables alpha testing. */
        material_AlphaCutoff( "AlphaCutoff", Range(0, 1, 0.01) ) = 0;
        /** Scales UV0 by (x, y), then adds the (z, w) offset. */
        material_TilingOffset("TilingOffset", Vector4) = (1, 1, 0, 0);
      }
    }
      
  }
        
    SubShader "Default" {
      UsePass "Pipeline/ShadowCaster/Default/ShadowCaster"
      UsePass "Pipeline/DepthOnly/Default/DepthOnly"

      Pass "Forward Pass" {
        Tags { pipelineStage = "Forward"} 

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

        #include "ShaderLibrary/PBR/ForwardPassPBR.glsl"
      }
    }
  }