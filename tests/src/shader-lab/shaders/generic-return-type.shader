Shader "generic-return-type-test" {
  SubShader "Default" {
    Pass "Forward" {
      mat4 renderer_MVPMat;

      struct Attributes { vec4 POSITION; };
      struct Varyings { vec2 uv; vec3 worldNormal; vec3 worldTangent; };

      VertexShader = vert;
      FragmentShader = frag;

      // Test: user-defined function with concrete parameter types
      vec3 CalculateNormalFromTangentSpace(vec3 normalFromTangentSpace, float normalStrength, vec3 normal, vec3 tangent, float mirrorNormal) {
        vec3 binormal = cross(normal, tangent) * mirrorNormal;
        return (normalFromTangentSpace.x * normalStrength) * normalize(tangent) +
               (normalFromTangentSpace.y * normalStrength) * normalize(binormal) +
                normalFromTangentSpace.z * normalize(normal);
      }

      sampler2D u_normalMap;
      vec4 u_scaleAndStrength;

      Varyings vert(Attributes attr) {
        Varyings o;
        gl_Position = renderer_MVPMat * attr.POSITION;
        o.uv = attr.POSITION.xy;
        o.worldNormal = attr.POSITION.xyz;
        o.worldTangent = attr.POSITION.xyz;
        return o;
      }

      void frag(Varyings v) {
        vec3 normal = v.worldNormal;

        // Test: builtin generic functions (normalize) on swizzled values,
        // passed as arguments to a user-defined function.
        // normalize(vec3) should not produce EGenType.GenType (200) as return type,
        // it should produce TypeAny so overload matching succeeds.
        vec3 nmmp = texture(u_normalMap, v.uv).xyz - vec3(0.5);
        normal = CalculateNormalFromTangentSpace(
          nmmp,
          u_scaleAndStrength.w,
          normalize(normal.xyz),
          normalize(v.worldTangent),
          1.0
        );

        gl_FragColor = vec4(normalize(normal), 1.0);
      }
    }
  }
}
