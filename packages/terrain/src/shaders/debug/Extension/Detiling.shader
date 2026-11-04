Shader "Terrain/Debug/Extension/Detiling" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      DepthState = { WriteEnabled = true; }
      RasterState = { CullMode = CullMode.Back; }
      RenderQueueType = Opaque;

      VertexShader = TerrainExtensionDebugVertex;
      FragmentShader = TerrainDetilingDebugFragment;

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "terrain/TerrainHeight.glsl"
      #include "debug/TerrainExtensionDebug.glsl"

      #ifdef MATERIAL_ENABLE_DETILING
        float material_DetilingStrength;
      #endif

      void TerrainDetilingDebugFragment(TerrainExtensionDebugVaryings varyings) {
        if (terrainProjectExtensionDebugDiscard(varyings)) discard;
        #ifdef MATERIAL_ENABLE_DETILING
          gl_FragColor = vec4(vec3(clamp(material_DetilingStrength, 0.0, 1.0)), 1.0);
        #else
          discard;
        #endif
      }
    }
  }
}
