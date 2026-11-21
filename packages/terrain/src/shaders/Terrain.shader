Shader "Terrain/Terrain" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      CompareFunction material_WorldPickDepthCompare;
      DepthState = {
        CompareFunction = material_WorldPickDepthCompare;
        WriteEnabled = true;
      }
      RasterState = {
        CullMode = CullMode.Back;
      }
      RenderQueueType = Opaque;

      VertexShader = TerrainVertex;
      FragmentShader = TerrainFragment;

      #include "terrain/TerrainForwardPass.glsl"
    }

    Pass "SSRReceiver" {
      Tags { pipelineStage = "SSRReceiver" }

      DepthState = {
        Enabled = true;
        WriteEnabled = false;
        CompareFunction = CompareFunction.LessEqual;
      }
      BlendState = {
        Enabled = false;
      }
      StencilState = {
        Enabled = true;
        ReferenceValue = 1;
        Mask = 255;
        WriteMask = 255;
        CompareFunctionFront = CompareFunction.Always;
        CompareFunctionBack = CompareFunction.Always;
        PassOperationFront = StencilOperation.Replace;
        PassOperationBack = StencilOperation.Replace;
        FailOperationFront = StencilOperation.Keep;
        FailOperationBack = StencilOperation.Keep;
        ZFailOperationFront = StencilOperation.Keep;
        ZFailOperationBack = StencilOperation.Keep;
      }
      RasterState = {
        CullMode = CullMode.Back;
      }
      RenderQueueType = Opaque;

      VertexShader = TerrainSSRReceiverVertex;
      FragmentShader = TerrainSSRReceiverFragment;

      #include "terrain/TerrainSSRReceiverPass.glsl"
    }

    Pass "ShadowCaster" {
      Tags { pipelineStage = "ShadowCaster" }

      DepthState = {
        WriteEnabled = true;
      }
      RasterState = {
        CullMode = CullMode.Back;
      }
      RenderQueueType = Opaque;

      VertexShader = TerrainShadowVertex;
      FragmentShader = TerrainShadowFragment;

      #define TERRAIN_PROJECT_SHADOW_CASTER_PASS
      #include "terrain/TerrainDepthShadowPass.glsl"
    }

    Pass "DepthOnly" {
      Tags { pipelineStage = "DepthOnly" }

      DepthState = {
        WriteEnabled = true;
      }
      RasterState = {
        CullMode = CullMode.Back;
      }
      RenderQueueType = Opaque;

      VertexShader = TerrainDepthOnlyVertex;
      FragmentShader = TerrainDepthOnlyFragment;

      #define TERRAIN_PROJECT_DEPTH_ONLY_PASS
      #include "terrain/TerrainDepthShadowPass.glsl"
    }
  }
}
