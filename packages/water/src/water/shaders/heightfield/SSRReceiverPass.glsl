    Pass "SSRReceiver" {
      Tags { pipelineStage = "SSRReceiver" }
      DepthState = {
        Enabled = true;
        WriteEnabled = true;
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
      RasterState ssrReceiverRasterState { CullMode = CullMode.Off; }
      RasterState = ssrReceiverRasterState;
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;
      #include "{{WATER_SSR_INCLUDE}}"
    }
