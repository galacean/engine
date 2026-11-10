// Vertex entry (`mainVert`) takes an attribute-struct `stageInput`; fragment entry (`mainFrag`)
// takes a varying-struct also named `stageInput`. The two `stageInput`s must be disambiguated per
// stage so `stageInput.POSITION` in vertex resolves to an attribute reference (emit `attribute
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

      v2f mainVert(a2v stageInput) {
        v2f stageOutput;
        gl_Position = renderer_MVPMat * stageInput.POSITION;
        stageOutput.worldNormal = stageInput.NORMAL;
        stageOutput.worldPos = stageInput.POSITION.xyz;
        return stageOutput;
      }

      void mainFrag(v2f stageInput) {
        vec3 normal = normalize(stageInput.worldNormal);
        gl_FragColor = vec4(normal, 1.0);
      }
    }
  }
}
