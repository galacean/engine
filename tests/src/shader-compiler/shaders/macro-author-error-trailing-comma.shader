Shader "macro-author-error-trailing-comma" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;

      // Authoring error: the value isn't a valid GLSL expression. Rule:
      // `#define` values must be either (a) a legal GLSL expression
      // (including comma-separated expression lists), or (b) one of the
      // three engine-supported legacy shapes — empty value, single
      // type/qualifier keyword (e.g. `#define FxaaFloat float`), or
      // type-qualifier list (e.g. `mediump sampler2D s`). Everything else
      // throws a single uniform diagnostic with the macro name + value text.
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
