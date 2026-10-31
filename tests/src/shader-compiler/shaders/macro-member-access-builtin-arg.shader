Shader "macro-member-access-builtin-arg-test" {
  SubShader "Default" {
    Pass "Forward" {
      mat4 renderer_MVPMat;

      struct Attributes { vec4 POSITION; vec3 NORMAL; vec2 TEXCOORD_0; };
      struct Varyings { vec2 v_uv; vec4 v_normal; vec3 v_worldPos; };

      VertexShader = vert;
      FragmentShader = frag;

      sampler2D u_texture;
      vec3 u_lightDir;
      vec3 u_cameraPos;

      // Cocos-style FSInput macros: member access used as builtin function args
      #define FSInput_worldNormal v.v_normal.xyz
      #define FSInput_faceSideSign v.v_normal.w
      #define FSInput_worldPos v.v_worldPos
      #define FSInput_texcoord v.v_uv

      Varyings vert(Attributes attr) {
        Varyings o;
        gl_Position = renderer_MVPMat * attr.POSITION;
        o.v_uv = attr.TEXCOORD_0;
        o.v_normal = vec4(attr.NORMAL, 1.0);
        o.v_worldPos = attr.POSITION.xyz;
        return o;
      }

      void frag(Varyings v) {
        // normalize() with member access macro as arg
        vec3 N = normalize(FSInput_worldNormal);

        // dot() with member access macro as arg
        float NdotL = dot(N, u_lightDir);

        // texture2D() with member access macro as arg
        vec4 albedo = texture2D(u_texture, FSInput_texcoord);

        // mix() with member access macro and scalar macro
        vec3 viewDir = normalize(u_cameraPos - FSInput_worldPos);
        float rim = 1.0 - dot(N, viewDir);

        gl_FragColor = albedo * NdotL + vec4(vec3(rim), 0.0);
      }
    }
  }
}
