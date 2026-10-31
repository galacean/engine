Shader "macro-author-error-unbalanced-paren" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;

      // Authoring error: unbalanced `(` in a `#define` value. GLSL ES §3.4
      // allows arbitrary token sequences in the replacement list, but the
      // engine doesn't route this politely — there's no real-world use case
      // (X-macro pattern uses function-like macros, not paren fragments).
      // Same uniform diagnostic as other authoring-error shapes.
      #define BAD u_a(

      float u_a;

      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(0.0); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}
