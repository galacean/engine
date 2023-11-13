Shader "Test-Default" {
  Tags { ReplaceTag = "transparent" }
  SubShader "Default" {
    Pass "test" {
      Tags { ReplaceTag = "opaque" }
      mat4 renderer_MVPMat;

      struct a2v {
        vec4 POSITION;
      }

      // struct v2f {
      //   vec2 uv;
      // }

      VertexShader = vert;
      FragmentShader = frag;

      void vert(a2v v) {
        gl_Position = renderer_MVPMat * v.POSITION;
      }

      void frag() {
        vec3 grayColor = vec3(0.299, 0.587, 0.114);
        float gray = dot(grayColor, gl_FragColor.rgb);
        gl_FragColor = vec4(gray, gray, gray, gl_FragColor.a);
      }
    }
  }
}