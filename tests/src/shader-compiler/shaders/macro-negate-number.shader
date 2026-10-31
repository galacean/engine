Shader "macro-negate-number-test" {
  SubShader "default" {
    Pass "default" {
      struct a2v {
        vec4 POSITION;
      };

      mat4 renderer_MVPMat;

      #define SCENE_FOG_MODE 1

      VertexShader = vert;
      FragmentShader = frag;

      void vert(a2v v) {
        gl_Position = renderer_MVPMat * v.POSITION;
      }

      void frag() {
        vec4 color = vec4(1.0);

        // Test: !0 should evaluate to true (like C preprocessor)
        #if SCENE_FOG_MODE != 4 && (!0 || SCENE_FOG_MODE)
          color = vec4(0.0, 1.0, 0.0, 1.0);
        #endif

        // Test: !1 should evaluate to false
        #if !1
          color = vec4(1.0, 0.0, 0.0, 1.0);
        #endif

        // Test: !0 alone
        #if !0
          color = vec4(0.0, 0.0, 1.0, 1.0);
        #endif

        gl_FragColor = color;
      }
    }
  }
}
