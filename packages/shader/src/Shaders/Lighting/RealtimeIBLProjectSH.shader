Shader "Lighting/RealtimeIBLProjectSH" {
  SubShader "Default" {
    Pass "TransformFeedback" {
      Tags { pipelineStage = "TransformFeedback" }

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Lighting/RealtimeIBLProjectSHCore.glsl"

      struct Attributes {
        float a_Dummy;
      };

      struct Varyings {
        vec4 v_SH0;
        vec4 v_SH1;
        vec4 v_SH2;
        vec4 v_SH3;
        vec4 v_SH4;
        vec4 v_SH5;
        vec4 v_SH6;
        vec4 v_SH7;
        vec4 v_SH8;
      };

      Varyings vert(Attributes attr) {
        Varyings varyings;
        vec4 packed[9];
        projectSHCoefficients(packed);
        varyings.v_SH0 = packed[0];
        varyings.v_SH1 = packed[1];
        varyings.v_SH2 = packed[2];
        varyings.v_SH3 = packed[3];
        varyings.v_SH4 = packed[4];
        varyings.v_SH5 = packed[5];
        varyings.v_SH6 = packed[6];
        varyings.v_SH7 = packed[7];
        varyings.v_SH8 = packed[8];
        gl_Position = vec4(0.0);
        return varyings;
      }

      void frag(Varyings varyings) {
        discard;
      }
    }
    Pass "Blend" {
      Tags { pipelineStage = "TransformFeedback" }
      VertexShader = vert;
      FragmentShader = frag;
      float renderer_SHBlend;
      struct Attributes {
        vec4 a_SourceSH;
        vec4 a_TargetSH;
      };
      struct Varyings { vec4 v_SH; };
      Varyings vert(Attributes attr) {
        Varyings result;
        result.v_SH = mix(attr.a_SourceSH, attr.a_TargetSH, renderer_SHBlend);
        gl_Position = vec4(0.0);
        return result;
      }
      void frag(Varyings varyings) { discard; }
    }
  }
}
