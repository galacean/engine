// Vertex entry (`mainVert`) takes an attribute-struct `input`; fragment entry (`mainFrag`)
// takes a varying-struct also named `input`. The two `input`s must be disambiguated per
// stage so `input.POSITION` in vertex resolves to an attribute reference (emit `attribute
// vec4 POSITION;`) rather than being routed to varying by the fragment binding.
Shader "Tutorial/04-Outline" {
  SubShader "Default" {
    Pass "Main" {
      mat4 renderer_MVPMat;
      vec4 material_BaseColor;

      struct a2v {
        vec4 POSITION;
        vec3 NORMAL;
      };

      struct v2f {
        vec3 worldNormal;
        vec3 worldPos;
      };

      VertexShader = mainVert;
      FragmentShader = mainFrag;

      v2f mainVert(a2v input) {
        v2f output;
        gl_Position = renderer_MVPMat * input.POSITION;
        output.worldNormal = input.NORMAL;
        output.worldPos = input.POSITION.xyz;
        return output;
      }

      void mainFrag(v2f input) {
        vec3 normal = normalize(input.worldNormal);
        gl_FragColor = vec4(normal, 1.0);
      }
    }
  }
}
