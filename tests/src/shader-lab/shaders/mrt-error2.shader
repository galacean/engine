Shader "Triangle" {
  SubShader "Default" {
    Pass "0" {
      mat4 renderer_MVPMat;
      vec3 u_color;

      struct a2v {
        vec4 POSITION;
      };

      struct v2f {
        vec3 v_color;
      };

      v2f vert(a2v v) {
        v2f o;

        gl_Position = renderer_MVPMat * v.POSITION;
        o.v_color = u_color;
        return o;
      }

      struct MRT {
        layout(location = 0) vec4 fragColor0;
        layout(location = 1) vec4 fragColor1;
      };

      vec4 frag(v2f i) {
        gl_FragColor = vec4(1.);
        gl_FragData[0] = vec4(0.3);
        return vec4(0., 0., 1.0, 1.);
      }

      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}