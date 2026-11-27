Shader "PostProcess/VolumetricLight" {
  SubShader "Default" {
    Pass "Volumetric Light Low Extract" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = fragVolumetricLowExtract;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/PostProcess/VolumetricLight.glsl"
    }

    Pass "Volumetric Light Low Coarse" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = fragVolumetricLowCoarse;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/PostProcess/VolumetricLight.glsl"
    }

    Pass "Volumetric Light Low Fine" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = fragVolumetricFine;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/PostProcess/VolumetricLight.glsl"
    }

    Pass "Volumetric Light Raymarch" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = fragVolumetricRaymarch;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/PostProcess/VolumetricLight.glsl"
    }

    Pass "Volumetric Light Bilateral Blur" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = fragVolumetricBilateralBlur;

      #include "ShaderLibrary/Blit/BlitVertex.glsl"
      #include "ShaderLibrary/PostProcess/VolumetricLight.glsl"
    }
  }
}
