Shader "define-line-continuation-member-access" {
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes { vec4 POSITION; vec2 TEXCOORD_0; };
      struct Varyings { vec2 v_uv; };

      VertexShader = vert;
      FragmentShader = frag;

      // A continued replacement list is one logical expression even when member access starts on the next line.
      #define UV foo \
                  .v_uv

      Varyings vert(Attributes a) {
        Varyings o;
        gl_Position = a.POSITION;
        o.v_uv = a.TEXCOORD_0;
        return o;
      }

      void frag(Varyings foo) {
        gl_FragColor = vec4(UV, 0.0, 1.0);
      }
    }
  }
}
