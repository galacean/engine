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

      void frag(v2f i) {
        // just for test
        for(int i = 0; i < 3; i++) {
          if(i.v_color.x < 0.01 || i.v_color.x > 9.99) {
            break;
          } else {
            continue;
          }
        }

        gl_FragColor = vec4(i.v_color, 1.0);
      }

      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}