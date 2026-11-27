ComputeShader "PostProcess/SunLensFlareVisibilityCompute" {
  WorkgroupSize = (1, 1, 1);
  ComputeKernel = csMain;

  #include "ShaderLibrary/PostProcess/SunLensFlareVisibilityCore.glsl"

  readonly storage PrevVisibilityBuf {
    float prevVis[];
  };

  storage NextVisibilityBuf {
    float nextVis[];
  };

  void csMain() {
    #if defined(GRAPHICS_API_WEBGL2) || defined(GRAPHICS_API_WEBGPU)
      float rawVis = sampleSunLensFlareVisibilityTf(
        renderer_SunLensFlareVisibilityParams0.xy,
        renderer_SunLensFlareVisibilityParams0.z,
        renderer_SunLensFlareVisibilityParams0.w,
        renderer_SunLensFlareVisibilityParams1.x,
        renderer_SunLensFlareDepthRect
      );
      float blendFactor = clamp(renderer_SunLensFlareVisibilityParams1.y, 0.0, 1.0);
      nextVis[0] = mix(prevVis[0], rawVis, blendFactor);
    #else
      nextVis[0] = 1.0;
    #endif
  }
}
