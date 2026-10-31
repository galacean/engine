Shader "macro-author-error-unbalanced-bracket" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;

      // Authoring error: the value isn't a valid GLSL expression. Same
      // uniform diagnostic as other authoring-error shapes (trailing
      // comma, trailing operator, leading punctuation). The user sees the
      // macro name + value text and fixes their GLSL.
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
