Shader "define-multiline-params" {
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes { vec4 POSITION; };
      struct Varyings { vec4 pos; };

      VertexShader = vert;
      FragmentShader = frag;

      // A continued function-like macro header is one logical directive.
      #define MAX3( \
                a, b, c \
              ) max(max(a, b), c)

      Varyings vert(Attributes a) {
        Varyings o;
        o.pos = a.POSITION;
        return o;
      }

      void frag(Varyings v) {
        float x = MAX3(v.pos.x, v.pos.y, v.pos.z);
        gl_FragColor = vec4(x);
      }
    }
  }
}
