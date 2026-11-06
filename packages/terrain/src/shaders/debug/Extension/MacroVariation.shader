Shader "Terrain/Debug/Extension/MacroVariation" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      DepthState = { WriteEnabled = true; }
      RasterState = { CullMode = CullMode.Back; }
      RenderQueueType = Opaque;

      VertexShader = TerrainExtensionDebugVertex;
      FragmentShader = TerrainMacroVariationDebugFragment;

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "terrain/TerrainHeight.glsl"
      #include "debug/TerrainExtensionDebug.glsl"

      #ifdef MATERIAL_ENABLE_MACRO_VARIATION
        float material_MacroVariationStrength;
      #endif

      void TerrainMacroVariationDebugFragment(TerrainExtensionDebugVaryings varyings) {
        if (terrainProjectExtensionDebugDiscard(varyings)) discard;
        #ifdef MATERIAL_ENABLE_MACRO_VARIATION
          gl_FragColor = vec4(vec3(clamp(material_MacroVariationStrength, 0.0, 1.0)), 1.0);
        #else
          discard;
        #endif
      }
    }
  }
}
