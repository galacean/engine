Shader "macro-value-refs-with-comments" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;

      // Regression for the "comments-in-#define-value" bug: the raw directive
      // slice fed to `_registerMacroDefine` retains comment text, and the
      // identifier scanner runs on that raw slice. Without stripping comments
      // before the scan, words inside `/* */` and `//` get harvested as fake
      // references, and if a same-named global exists in this pass it gets
      // wrongly marked as live, defeating dead-code elimination.
      //
      // Each macro below names *only* `u_used_*` in its actual value. The
      // comments deliberately mention `u_in_comment_*` words to bait the
      // scanner. We then declare both `u_used_*` (real refs) and
      // `u_in_comment_*` (fake refs) globally, and the test asserts the fake
      // refs do NOT leak into the emitted uniform set.
      #define V_BLOCK /* u_in_comment_block */ u_used_block
      #define V_LINE u_used_line // u_in_comment_line
      #define V_MIXED /* u_in_comment_mid */ u_used_mid // u_in_comment_tail

      float u_used_block;
      float u_used_line;
      float u_used_mid;
      float u_in_comment_block;
      float u_in_comment_line;
      float u_in_comment_mid;
      float u_in_comment_tail;

      struct Attributes { vec3 POSITION; };

      void vert(Attributes attr) {
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
      }

      void frag() {
        float v = V_BLOCK + V_LINE + V_MIXED;
        gl_FragColor = vec4(v, 0.0, 0.0, 1.0);
      }

      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}
