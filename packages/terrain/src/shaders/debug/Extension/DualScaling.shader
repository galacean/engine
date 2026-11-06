Shader "Terrain/Debug/Extension/DualScaling" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      DepthState = { WriteEnabled = true; }
      RasterState = { CullMode = CullMode.Back; }
      RenderQueueType = Opaque;

      VertexShader = TerrainExtensionDebugVertex;
      FragmentShader = TerrainDualScalingDebugFragment;

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "terrain/TerrainHeight.glsl"
      #include "debug/TerrainExtensionDebug.glsl"

      #ifdef MATERIAL_ENABLE_DUAL_SCALING
        vec2 material_DualScaling;
      #endif

      void TerrainDualScalingDebugFragment(TerrainExtensionDebugVaryings varyings) {
        if (terrainProjectExtensionDebugDiscard(varyings)) discard;
        #ifdef MATERIAL_ENABLE_DUAL_SCALING
          gl_FragColor = vec4(clamp(material_DualScaling, vec2(0.0), vec2(1.0)), 0.0, 1.0);
        #else
          discard;
        #endif
      }
    }
  }
}
