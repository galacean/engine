
Shader "SeedWorld/VoiceOrbV5" {
  SubShader "Default" {
    Pass "Default" {
      Tags { pipelineStage = "Forward" }
      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
        ColorBlendOperation = BlendOperation.Add;
        AlphaBlendOperation = BlendOperation.Add;
      }
      DepthState = { Enabled = false; WriteEnabled = false; }
      RasterState = { CullMode = CullMode.Off; }
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Common.glsl"

      mat4 renderer_MVPMat;
      sampler2D renderer_UITexture;
      float material_Time;
      float material_Listening;

      struct Attributes {
        vec3 POSITION;
        vec2 TEXCOORD_0;
        vec4 COLOR_0;
      };

      struct Varyings {
        vec2 v_uv;
        vec4 v_color;
      };

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        v.v_uv = attr.TEXCOORD_0;
        v.v_color = attr.COLOR_0;
        return v;
      }

      void frag(Varyings v) {
        const float TAU = 6.28318530718;
        vec2 point = v.v_uv * 2.0 - 1.0;
        float radius = length(point);
        float alpha = 1.0 - smoothstep(0.84, 1.0, radius);
        if (alpha <= 0.001) discard;

        float speed = mix(0.38, 0.9, material_Listening);
        float angle = atan(point.y, point.x) / TAU;
        float waveA = sin(angle * TAU * 3.0 - material_Time * speed * 2.1 + radius * 8.0);
        float waveB = sin(point.x * 7.0 + point.y * 5.0 + material_Time * speed * 1.7);
        float field = 0.5 + 0.25 * waveA + 0.25 * waveB;
        float hue = angle + field * 0.24 + material_Time * mix(0.045, 0.11, material_Listening);
        vec3 palette = vec3(0.54) + vec3(0.46) * cos(TAU * (vec3(hue) + vec3(0.0, 0.33, 0.67)));

        float sphereZ = sqrt(max(0.0, 1.0 - radius * radius));
        vec3 normal = normalize(vec3(point, sphereZ));
        float highlight = pow(max(dot(normal, normalize(vec3(-0.35, 0.55, 0.76))), 0.0), 7.0);
        float rim = smoothstep(0.38, 0.98, radius);
        float pulse = 0.92 + 0.08 * sin(material_Time * mix(2.1, 4.8, material_Listening) + field * TAU);
        vec3 color = palette * (0.82 + field * 0.54) * pulse;
        color += vec3(0.55, 0.86, 1.0) * highlight * 0.85;
        color += mix(vec3(0.18, 0.35, 0.72), vec3(0.2, 1.0, 0.82), material_Listening) * rim * 0.48;
        color += vec3(0.24, 0.9, 1.0) * material_Listening * (1.0 - smoothstep(0.65, 1.0, radius)) * 0.34;

        vec4 finalColor = vec4(color, alpha) * v.v_color;
        #ifdef ENGINE_SHOULD_SRGB_CORRECT
          finalColor = outputSRGBCorrection(finalColor);
        #endif
        gl_FragColor = finalColor;
      }
    }
  }
}
