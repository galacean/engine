Shader "Planning/TemplateVertexColorTree" {
  SubShader "Default" {
    UsePass "Pipeline/ShadowCaster/Default/ShadowCaster"
    UsePass "Pipeline/DepthOnly/Default/DepthOnlyVertexColor"
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      CullMode rasterStateCullMode;
      RasterState = { CullMode = rasterStateCullMode; }
      #include "ShaderLibrary/PBR/ForwardPassPBR.glsl"

      vec4 renderer_TemplateFoliagePigment;
      vec4 renderer_TemplateBarkPigment;
      VertexShader = templateTreeVertex;
      FragmentShader = PBRFragment;
      Varyings templateTreeVertex(Attributes attributes) {
        Varyings v = PBRVertex(attributes);
        #if defined(RENDERER_ENABLE_VERTEXCOLOR) && defined(RENDERER_HAS_UV)
          vec4 pigment = mix(renderer_TemplateBarkPigment, renderer_TemplateFoliagePigment, attributes.TEXCOORD_0.x);
          v.vertexColor.rgb = mix(v.vertexColor.rgb, pigment.rgb * attributes.TEXCOORD_0.y, pigment.a);
        #endif
        return v;
      }
    }
    UsePass "Pipeline/SSRReceiver/Default/SSRReceiver"
    UsePass "Pipeline/SSRContributionDepth/Default/SSRContributionDepth"
  }
}
