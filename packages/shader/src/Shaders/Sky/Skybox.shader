Shader "Sky/Skybox" {
  Editor {
    Properties {
      Header("Base") {
        material_TintColor("TintColor", Color) = (1, 1, 1, 1);
        material_Exposure("Exposure", Range(0, 8, 0.1)) = 1;
        material_Rotation("Rotation", Range(0, 360, 1)) = 0;
        material_CubeTexture("CubeTexture", TextureCube);
        material_CubeTexture2("Secondary CubeTexture", TextureCube);
        material_CubeTextureBlend("CubeTexture Blend", Range(0, 1, 0.01)) = 0;
      }
    }
  }

  SubShader "Default" {
    Pass "Forward Pass" {
      Tags { pipelineStage = "Forward" }

      DepthState = {
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }

      VertexShader = SkyboxVertex;
      FragmentShader = SkyboxFragment;

      #include "ShaderLibrary/Common/Common.glsl"

      struct Attributes {
        vec3 POSITION;
      };

      struct Varyings {
        vec3 v_cubeUV;
      };

      mat4 camera_VPMat;
      float material_Rotation;
      samplerCube material_CubeTexture;
      #ifdef MATERIAL_HAS_SECONDARY_CUBE_TEXTURE
        samplerCube material_CubeTexture2;
        float material_CubeTextureBlend;
      #endif
      float material_Exposure;
      vec4 material_TintColor;

      vec4 rotateY(vec4 v, float angle) {
        const float deg2rad = 3.1415926 / 180.0;
        float radian = angle * deg2rad;
        float sina = sin(radian);
        float cosa = cos(radian);
        mat2 m = mat2(cosa, -sina, sina, cosa);
        return vec4(m * v.xz, v.yw).xzyw;
      }

      Varyings SkyboxVertex(Attributes attributes) {
        Varyings varyings;
        varyings.v_cubeUV = attributes.POSITION;
        gl_Position = camera_VPMat * rotateY(vec4(attributes.POSITION, 1.0), material_Rotation);
        return varyings;
      }

      void SkyboxFragment(Varyings varyings) {
        vec4 textureColor = textureCube(material_CubeTexture, varyings.v_cubeUV);
        #ifdef ENGINE_NO_SRGB
          textureColor = sRGBToLinear(textureColor);
        #endif
        #ifdef MATERIAL_HAS_SECONDARY_CUBE_TEXTURE
          vec4 secondaryTextureColor = textureCube(material_CubeTexture2, varyings.v_cubeUV);
          #ifdef ENGINE_NO_SRGB
            secondaryTextureColor = sRGBToLinear(secondaryTextureColor);
          #endif
          textureColor = mix(textureColor, secondaryTextureColor, material_CubeTextureBlend);
        #endif
        textureColor.rgb *= material_Exposure * material_TintColor.rgb;
        gl_FragColor = textureColor;
      }
    }
  }
}
