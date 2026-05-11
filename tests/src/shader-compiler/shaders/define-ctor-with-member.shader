Shader "define-ctor-with-member-test" {
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes { vec4 POSITION; };
      struct Varyings { vec3 v_normal; vec3 v_tangent; };

      VertexShader = vert;
      FragmentShader = frag;

      // Constructor-style expression macro with struct member access.
      // The value starts with `mat3` (a type keyword) but is an expression
      // (constructor call), not a declaration.
      #define TBN_BLEND mat3(v.v_tangent, v.v_normal, cross(v.v_tangent, v.v_normal))

      Varyings vert(Attributes a) {
        Varyings o;
        gl_Position = a.POSITION;
        o.v_normal = vec3(0.0, 0.0, 1.0);
        o.v_tangent = vec3(1.0, 0.0, 0.0);
        return o;
      }

      void frag(Varyings v) {
        mat3 m = TBN_BLEND;
        gl_FragColor = vec4(m[0], 1.0);
      }
    }
  }
}
