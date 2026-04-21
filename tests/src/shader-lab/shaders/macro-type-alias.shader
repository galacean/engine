Shader "macro-type-alias-test" {
  SubShader "Default" {
    Pass "Forward" {
      mat4 renderer_MVPMat;

      struct Attributes { vec3 POSITION; vec3 NORMAL; vec2 TEXCOORD_0; };
      struct Varyings { vec3 v_pos; vec2 v_uv; };

      VertexShader = vert;
      FragmentShader = frag;

      // Macro-defined type aliases used in various positions
      #define FLOAT_TYPE float
      #define VEC3_TYPE vec3
      #define VEC4_TYPE vec4
      #define MAT3_TYPE mat3

      // As variable declaration type
      FLOAT_TYPE u_intensity;
      VEC3_TYPE u_color;

      // In struct member declaration
      struct LightData {
        VEC3_TYPE direction;
        FLOAT_TYPE intensity;
      };

      // As function return type
      VEC3_TYPE computeLight(LightData light, VEC3_TYPE normal) {
        FLOAT_TYPE d = max(dot(normal, light.direction), 0.0);
        return u_color * d * light.intensity;
      }

      // As function parameter type
      VEC4_TYPE applyIntensity(VEC4_TYPE color, FLOAT_TYPE intensity) {
        return vec4(color.rgb * intensity, color.a);
      }

      // As local variable type
      Varyings vert(Attributes attr) {
        Varyings o;
        VEC4_TYPE pos = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        o.v_pos = pos.xyz;
        o.v_uv = attr.TEXCOORD_0;
        gl_Position = pos;
        return o;
      }

      void frag(Varyings v) {
        LightData light;
        light.direction = vec3(0.0, 1.0, 0.0);
        light.intensity = u_intensity;

        VEC3_TYPE lighting = computeLight(light, normalize(v.v_pos));
        VEC4_TYPE result = vec4(lighting, 1.0);
        gl_FragColor = applyIntensity(result, u_intensity);
      }
    }
  }
}
