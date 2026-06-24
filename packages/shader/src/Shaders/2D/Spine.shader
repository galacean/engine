Shader "2D/Spine" {
  SubShader "Default" {
    Pass "Default" {
      Tags { pipelineStage = "Forward" }

      BlendFactor sourceColorBlendFactor;
      BlendFactor destinationColorBlendFactor;
      BlendFactor sourceAlphaBlendFactor;
      BlendFactor destinationAlphaBlendFactor;

      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = sourceColorBlendFactor;
        DestinationColorBlendFactor = destinationColorBlendFactor;
        SourceAlphaBlendFactor = sourceAlphaBlendFactor;
        DestinationAlphaBlendFactor = destinationAlphaBlendFactor;
      }
      DepthState = {
        WriteEnabled = false;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }
      RenderQueueType = Transparent;

      VertexShader = SpineVertex;
      FragmentShader = SpineFragment;

      #include "ShaderLibrary/Common/Common.glsl"

      struct a2v {
        vec3 POSITION;
        vec2 TEXCOORD_0;
        vec4 LIGHT_COLOR;
      #ifdef RENDERER_TINT_BLACK
        vec3 DARK_COLOR;
      #endif
      };

      struct v2f {
        vec2 v_uv;
        vec4 v_lightColor;
      #ifdef RENDERER_TINT_BLACK
        vec3 v_darkColor;
      #endif
      };

      mat4 renderer_MVPMat;
      sampler2D material_SpineTexture;
      float renderer_PremultipliedAlpha;

      v2f SpineVertex(a2v attr) {
        v2f v;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        v.v_uv = attr.TEXCOORD_0;
        v.v_lightColor = attr.LIGHT_COLOR;
      #ifdef RENDERER_TINT_BLACK
        v.v_darkColor = attr.DARK_COLOR;
      #endif
        return v;
      }

      void SpineFragment(v2f v) {
        vec4 texColor = texture2D(material_SpineTexture, v.v_uv);
        vec4 lightColor = sRGBToLinear(v.v_lightColor);
      #ifdef RENDERER_TINT_BLACK
        vec4 darkColor = sRGBToLinear(vec4(v.v_darkColor, 1.0));
        vec3 dark_premult = (texColor.a - texColor.rgb) * darkColor.rgb;
        vec3 dark_nonpremult = (1.0 - texColor.rgb) * darkColor.rgb;
        vec3 dark = mix(dark_nonpremult, dark_premult, renderer_PremultipliedAlpha);
        vec3 light = texColor.rgb * lightColor.rgb;
        gl_FragColor.rgb = dark + light;
        gl_FragColor.a = texColor.a * lightColor.a;
      #else
        gl_FragColor = texColor * lightColor;
      #endif
      }
    }
  }
}
