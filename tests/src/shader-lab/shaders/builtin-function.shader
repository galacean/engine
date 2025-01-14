Shader "/Folder1/test.gs" {
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
        #define MATERIAL_ENABLE_IRIDESCENCE

        __$$insert_maros$$__

        VertexShader = PBRVertex;
        FragmentShader = PBRFragment;

        #include "ForwardPassPBR.glsl"
      }
    }
}
