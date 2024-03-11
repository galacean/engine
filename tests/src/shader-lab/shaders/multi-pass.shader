Shader "Triangle" {
  SubShader "Default" {
     mat4 renderer_MVPMat;
     
    Pass "0" {
      vec3 u_color;

      struct a2v {
        vec4 POSITION;
      }

      struct v2f {
        vec3 v_color;
      }

      VertexShader = vert;
      FragmentShader = frag;

      v2f vert(a2v v) {
        v2f o;

        gl_Position = renderer_MVPMat * v.POSITION;
        o.v_color = u_color;
        return o;
      }

      void frag(v2f i) {
        gl_FragColor = vec4(i.v_color, 1.0);
      }
    }

    Pass "1" {
      vec3 u_color;

      struct a2v {
        vec4 POSITION;
      }

      struct v2f {
        vec3 v_color;
      }

      VertexShader = vert;
      FragmentShader = frag;

      v2f vert(a2v v) {
        v2f o;

        gl_Position = renderer_MVPMat * v.POSITION;
        o.v_color = u_color;
        return o;
      }

      void frag(v2f i) {
        gl_FragColor = vec4(i.v_color, 1.0);
      }
    }
  }
}