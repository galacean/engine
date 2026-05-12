Shader "type-alias-sampler-only" {
  SubShader "Default" {
    Pass "0" {
      #define FxaaTex sampler2D

      VertexShader = vert;
      FragmentShader = frag;

      struct Attributes { vec4 POSITION; };
      struct Varyings { vec2 v_uv; };

      Varyings vert(Attributes a) {
        Varyings o;
        gl_Position = a.POSITION;
        o.v_uv = vec2(0.0);
        return o;
      }

      void frag(Varyings v) {
        gl_FragColor = vec4(0.0);
      }
    }
  }
}
