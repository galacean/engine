Shader "macro-leading-dot-float" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;

      // GLSL ES 3.00 §4.1.4 allows leading-dot float literals (the integer
      // part is optional). `#define HALF .5` is well-formed and must route
      // through the AST path like any other expression literal.
      #define HALF .5

      struct Attributes { vec3 POSITION; };
      void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(HALF); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}
