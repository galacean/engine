Shader "Planning/BridgePick" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      CompareFunction material_WorldPickDepthCompare;
      DepthState = { WriteEnabled = true; CompareFunction = material_WorldPickDepthCompare; }
      CullMode rasterStateCullMode;
      RasterState = { CullMode = rasterStateCullMode; }
      #include "ShaderLibrary/PBR/ForwardPassPBR.glsl"
      float renderer_WorldPickBase;
      VertexShader = PBRVertex;
      FragmentShader = BridgePickFragment;
      void BridgePickFragment(Varyings v) {
        float id = floor(renderer_WorldPickBase + 0.5);
        #ifdef RENDERER_WORLD_PICK_DEPTH
          id = floor(gl_FragCoord.z * 16777215.0 + 0.5);
        #endif
        gl_FragColor = vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
      }
    }
  }
}
