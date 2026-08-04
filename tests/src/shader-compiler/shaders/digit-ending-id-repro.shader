Shader "digit-ending-id-repro" {
  SubShader "Default" {
    Pass "0" {
      // Macro member access must distinguish digit-ending identifiers from decimal points.
      #define UV0  v.uv0.xy
      #define UV1  v.uv1.xy
      #define POS  v.pos2D

      VertexShader = vert;
      FragmentShader = frag;

      struct Attributes { vec4 POSITION; };
      struct Varyings { vec2 uv0; vec2 uv1; vec2 pos2D; };

      Varyings vert(Attributes a) {
        Varyings o;
        gl_Position = a.POSITION;
        o.uv0 = vec2(0.0);
        o.uv1 = vec2(0.0);
        o.pos2D = vec2(0.0);
        return o;
      }

      void frag(Varyings v) {
        gl_FragColor = vec4(UV0 + UV1, POS.x, 1.0);
      }
    }
  }
}
