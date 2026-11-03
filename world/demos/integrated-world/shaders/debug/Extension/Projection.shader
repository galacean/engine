Shader "Terrain/Debug/Extension/Projection" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      DepthState = { WriteEnabled = true; }
      RasterState = { CullMode = CullMode.Back; }
      RenderQueueType = Opaque;

      VertexShader = TerrainExtensionDebugVertex;
      FragmentShader = TerrainProjectionDebugFragment;

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "terrain/TerrainHeight.glsl"
      #include "debug/TerrainExtensionDebug.glsl"

      #ifdef MATERIAL_ENABLE_PROJECTION
        float material_ProjectionScale;
      #endif

      void TerrainProjectionDebugFragment(TerrainExtensionDebugVaryings varyings) {
        if (terrainProjectExtensionDebugDiscard(varyings)) discard;
        #ifdef MATERIAL_ENABLE_PROJECTION
          vec2 projected = fract(varyings.positionWS.xz * material_ProjectionScale);
          gl_FragColor = vec4(projected, 0.0, 1.0);
        #else
          discard;
        #endif
      }
    }
  }
}
