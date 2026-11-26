Shader "PostProcess/SunLensFlareVisibility" {
  SubShader "Default" {
    Pass "TransformFeedback" {
      Tags { pipelineStage = "TransformFeedback" }

      VertexShader = visibilityTfVert;
      FragmentShader = visibilityTfFrag;

      #include "ShaderLibrary/PostProcess/SunLensFlare.glsl"
    }
  }
}
