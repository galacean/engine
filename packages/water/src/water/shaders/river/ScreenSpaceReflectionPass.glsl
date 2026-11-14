
    Pass "ScreenSpaceReflectionSurface" {
      Tags {
        pipelineStage = "ScreenSpaceReflectionSurface",
        {{VALUE_001_SCREENSPACEREFLECTION_MATERIAL_RECEIVER_CONTRACT_TAG}} = "{{VALUE_002_SCREENSPACEREFLECTION_MATERIAL_RECEIVER_CONTRACT}}"
      }
      DepthState ssrSurfaceDepthState {
        WriteEnabled = true;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState ssrSurfaceRasterState { CullMode = CullMode.Off; }
      DepthState = ssrSurfaceDepthState;
      RasterState = ssrSurfaceRasterState;
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;
      #include "{{WATER_SSR_INCLUDE}}"
    }
