Shader "/Folder1/test.gs" {
    SubShader "Default" {
      UsePass "pbr/Default/ShadowCaster"

      RenderQueueType material_QueueType;
      RenderQueueType = material_QueueType;
      RenderQueueType = Opaque;

      RenderQueueType = Unknown;

      Pass "Forward Pass" {
        Tags { pipelineStage = "Forward"} 

        Bool blendEnabled;
        Bool depthWriteEnabled;
        BlendFactor sourceColorBlendFactor;
        BlendFactor destinationColorBlendFactor;
        BlendFactor sourceAlphaBlendFactor;
        BlendFactor destinationAlphaBlendFactor;
        CullMode rasterStateCullMode;

        DepthState customDepthState {
          WriteEnabled = depthWriteEnabled;
        }

        BlendState customBlendState {
          Enabled = blendEnabled;
          SourceColorBlendFactor = sourceColorBlendFactor;
          DestinationColorBlendFactor = destinationColorBlendFactor;
          SourceAlphaBlendFactor = sourceAlphaBlendFactor;
          DestinationAlphaBlendFactor = destinationAlphaBlendFactor;
        }

        RasterState customRasterState {
          CullMode = rasterStateCullMode;
        }

        BlendState = customBlendState;
        DepthState = customDepthState;
        RasterState = customRasterState;

        #define IS_METALLIC_WORKFLOW
        #define MATERIAL_ENABLE_IRIDESCENCE

        __$$insert_maros$$__

        VertexShader = PBRVertex;
        FragmentShader = PBRFragment;

        #include "ForwardPassPBR.glsl"
      }
    }
}
