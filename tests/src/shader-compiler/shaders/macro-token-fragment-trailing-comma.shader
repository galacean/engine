Shader "macro-token-fragment-trailing-comma" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;

      // Replacement lists are preprocessing tokens and need not form standalone expressions.
      #define BAD u_a, u_b,

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
