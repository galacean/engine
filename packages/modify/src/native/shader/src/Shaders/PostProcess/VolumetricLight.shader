Shader "PostProcess/VolumetricLight" {
  SubShader "Default" {
    Pass "Volumetric Light Coarse" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = fragVolumetricCoarse;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/PostProcess/VolumetricLight.glsl"
    }

    Pass "Volumetric Light Fine Cascade" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = fragVolumetricFine;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/PostProcess/VolumetricLight.glsl"
    }
  }
}
