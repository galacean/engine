Shader "global-varying-var-test" {
  SubShader "Default" {
    Pass "Forward" {
      mat4 renderer_MVPMat;

      struct Attributes { vec3 POSITION; vec3 NORMAL; vec2 TEXCOORD_0; };
      struct Varyings { vec3 v_worldPos; vec4 v_normal; vec2 v_uv; vec4 v_shadowBiasAndProbeId; };

      VertexShader = vert;
      FragmentShader = frag;

      sampler2D u_texture;
      vec3 u_lightDir;

      #define VSOutput_worldPos o.v_worldPos
      #define VSOutput_worldNormal o.v_normal.xyz
      #define VSOutput_faceSideSign o.v_normal.w
      #define VSOutput_texcoord o.v_uv
      #define VSOutput_shadowBias o.v_shadowBiasAndProbeId.xy

      Varyings o;

      Varyings vert(Attributes input) {
        mat4 matWorld = renderer_MVPMat;
        vec4 pos = matWorld * vec4(input.POSITION, 1.0);
        VSOutput_worldPos = pos.xyz;
        VSOutput_worldNormal = input.NORMAL;
        VSOutput_faceSideSign = 1.0;
        VSOutput_texcoord = input.TEXCOORD_0;
        VSOutput_shadowBias = vec2(0.0, 0.0);
        gl_Position = pos;
        return o;
      }

      void frag(Varyings v) {
        vec3 N = normalize(v.v_normal.xyz);
        float NdotL = dot(N, u_lightDir);
        gl_FragColor = texture2D(u_texture, v.v_uv) * NdotL;
      }
    }
  }
}
