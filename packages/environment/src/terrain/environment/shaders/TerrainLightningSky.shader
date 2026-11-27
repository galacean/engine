
Shader "Terrain/LightningSky" {
  SubShader "Default" {
    Pass "Forward" {
      BlendState lightningBlendState {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.One;
        SourceAlphaBlendFactor = BlendFactor.Zero;
        DestinationAlphaBlendFactor = BlendFactor.One;
      }
      DepthState lightningDepthState {
        Enabled = true;
        WriteEnabled = false;
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState lightningRasterState { CullMode = CullMode.Off; }
      BlendState = lightningBlendState;
      DepthState = lightningDepthState;
      RasterState = lightningRasterState;
      RenderQueueType = Transparent;

      mat4 renderer_MVPMat;
      sampler2D material_BaseTexture;
      vec4 material_BaseColor;
      struct Attributes { vec4 POSITION; vec2 TEXCOORD_0; };
      struct Varyings { vec2 uv; };
      VertexShader = vert;
      FragmentShader = frag;
      Varyings vert(Attributes attributes) {
        Varyings output;
        vec4 clipPosition = renderer_MVPMat * attributes.POSITION;
        // Keep the bolt infinitesimally in front of the depth-writing sky background, but behind scene geometry.
        clipPosition.z = clipPosition.w * 0.99999;
        gl_Position = clipPosition;
        output.uv = attributes.TEXCOORD_0;
        return output;
      }
      void frag(Varyings input) {
        vec4 carrier = texture2D(material_BaseTexture, input.uv);
        gl_FragColor = vec4(material_BaseColor.rgb * carrier.rgb, material_BaseColor.a * carrier.a);
      }
    }
  }
}
