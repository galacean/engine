Shader "macro-token-fragment-unbalanced-bracket" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;

      // Delimiter fragments are legal in an unused preprocessing replacement list.
      #define BAD u_a[u_b

      float u_a;
      float u_b;

      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}
