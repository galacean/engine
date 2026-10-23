Shader "2D/Spine" {
  SubShader "Default" {
    Pass "Default" {
      Tags { pipelineStage = "Forward" }

      BlendFactor renderElement_SpineSourceColorBlendFactor;
      BlendFactor renderElement_SpineDestinationColorBlendFactor;
      BlendFactor renderElement_SpineSourceAlphaBlendFactor;
      BlendFactor renderElement_SpineDestinationAlphaBlendFactor;

      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = renderElement_SpineSourceColorBlendFactor;
        DestinationColorBlendFactor = renderElement_SpineDestinationColorBlendFactor;
        SourceAlphaBlendFactor = renderElement_SpineSourceAlphaBlendFactor;
        DestinationAlphaBlendFactor = renderElement_SpineDestinationAlphaBlendFactor;
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
      sampler2D renderElement_SpineTexture;

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
        vec4 texColor = texture2DSRGB(renderElement_SpineTexture, v.v_uv);
        vec4 lightColor = sRGBToLinear(v.v_lightColor);
      #ifdef RENDERER_TINT_BLACK
        vec4 darkColor = sRGBToLinear(vec4(v.v_darkColor, 1.0));
        vec3 dark = (1.0 - texColor.rgb) * darkColor.rgb;
        vec3 light = texColor.rgb * lightColor.rgb;
        gl_FragColor.rgb = dark + light;
        gl_FragColor.a = texColor.a * lightColor.a;
      #else
        gl_FragColor = texColor * lightColor;
      #endif
        // Premultiply only after decoding and tinting in linear space.
        gl_FragColor.rgb *= gl_FragColor.a;
      }
    }
  }
}
