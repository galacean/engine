Shader "define-struct-access-test" {
  SubShader "Default" {
    Pass "Forward" {
      mat4 renderer_MVPMat;

      struct Attributes { vec4 POSITION; vec2 TEXCOORD_0; };
      struct Varyings { vec2 v_uv; vec3 v_normal; };

      VertexShader = vert;
      FragmentShader = frag;

      sampler2D u_texture;
      vec3 u_lightDir;

      Varyings vert(Attributes attr) {
        Varyings o;
        #define ATTR_POS attr.POSITION
        #define VARYING_UV o.v_uv
        #define VARYING_NORMAL o.v_normal
        gl_Position = renderer_MVPMat * ATTR_POS;
        VARYING_UV = attr.TEXCOORD_0;
        VARYING_NORMAL = vec3(0.0, 1.0, 0.0);
        return o;
      }

      void frag(Varyings v) {
        #define FRAG_UV v.v_uv
        #define FRAG_NORMAL v.v_normal
        float NdotL = dot(FRAG_NORMAL, u_lightDir);
        gl_FragColor = texture2D(u_texture, FRAG_UV) * NdotL;
      }
    }
  }
}
