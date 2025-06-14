Shader "/Folder1/test.gs" {
    SubShader "Default" {
      UsePass "pbr/Default/ShadowCaster"

      RenderQueueType material_QuqueType;
      RenderQueueType = material_QuqueType;
      RenderQueueType = Opaque;

      RenderQueueType = Unknown;

      Pass "Forward Pass" {
        Tags { pipelineStage = "Forward"} 

        DepthState depthState {
          WriteEnabled = depthWriteEnabled;
        }

        BlendState blendState {
          Enabled = blendEnabled;
          SourceColorBlendFactor = sourceColorBlendFactor;
          DestinationColorBlendFactor = destinationColorBlendFactor;
          SourceAlphaBlendFactor = sourceAlphaBlendFactor;
          DestinationAlphaBlendFactor = destinationAlphaBlendFactor;
        }

        RasterState rasterState {
          CullMode = rasterStateCullMode;
        }

        DepthState = depthState;
        BlendState = blendState;
        RasterState = rasterState;

        #define IS_METALLIC_WORKFLOW
        #define MATERIAL_ENABLE_IRIDESCENCE

        __$$insert_maros$$__

        VertexShader = PBRVertex;
        FragmentShader = PBRFragment;

        #include "ForwardPassPBR.glsl"
      }
    }
}
