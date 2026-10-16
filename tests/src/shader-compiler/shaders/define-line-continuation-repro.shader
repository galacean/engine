Shader "define-line-continuation-repro" {
  SubShader "Default" {
    Pass "0" {
      // A continued replacement list retains references from every physical line.
      #define LONG_VAL  v.v_uv \
                      + v.v_uv

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
        gl_FragColor = vec4(LONG_VAL, 0.0, 1.0);
      }
    }
  }
}
