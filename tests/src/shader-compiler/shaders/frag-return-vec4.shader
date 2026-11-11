Shader "frag-return-vec4-test" {
  SubShader "Default" {
    Pass "Forward" {
      mat4 renderer_MVPMat;

      struct Attributes { vec3 POSITION; vec3 NORMAL; vec2 TEXCOORD_0; };
      struct Varyings { vec3 v_worldPos; vec4 v_normal; vec2 v_uv; };

      VertexShader = vert;
      FragmentShader = frag;

      sampler2D u_texture;
      vec3 u_lightDir;

      vec3 SRGBToLinear(vec3 gamma) { return gamma * gamma; }
      vec3 LinearToSRGB(vec3 linear) { return sqrt(linear); }

      vec4 SurfacesFragmentModifyBaseColorAndTransparency(Varyings input) {
        vec4 color = texture2D(u_texture, input.v_uv);
        color.rgb = SRGBToLinear(color.rgb);
        return color;
      }

      Varyings vert(Attributes attr) {
        Varyings o;
        vec4 pos = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        o.v_worldPos = pos.xyz;
        o.v_normal = vec4(attr.NORMAL, 1.0);
        o.v_uv = attr.TEXCOORD_0;
        gl_Position = pos;
        return o;
      }

      vec4 frag(Varyings input) {
        vec4 color = SurfacesFragmentModifyBaseColorAndTransparency(input);
        color.rgb = LinearToSRGB(color.rgb);
        return color;
      }
    }
  }
}
