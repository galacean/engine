Shader "Animal/Firefly" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.One;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState = { WriteEnabled = false; CompareFunction = CompareFunction.LessEqual; }
      RasterState = { CullMode = CullMode.Off; }
      RenderQueueType = Transparent;
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Fog.glsl"
      mat4 camera_ViewInvMat;
      float firefly_Intensity;
      #ifdef FIREFLY_GLOW
        sampler2D camera_DepthTexture;
      #endif
      struct Attributes { vec3 POSITION; vec4 FIREFLY_POSITION; vec3 FIREFLY_VELOCITY; };
      struct Varyings { vec2 corner; vec2 coreMotion; float instanceEnergy; vec3 positionVS; };
      #ifdef FIREFLY_GLOW
        float visibilityAt(vec2 uv, float eyeDepth) {
          float sceneDepth = remapDepthBufferEyeDepth(texture2D(camera_DepthTexture, uv).r);
          return smoothstep(-0.04, 0.04, sceneDepth - eyeDepth);
        }
      #endif
      Varyings vert(Attributes a) {
        Varyings v;
        vec3 center = a.FIREFLY_POSITION.xyz;
        vec4 centerVS = camera_ViewMat * vec4(center, 1.0);
        vec4 centerClip = camera_ProjMat * centerVS;
        // Cap apparent size against the shorter viewport side, including portrait
        // and orthographic cameras. World positions and depth remain unchanged.
        float shortSide = min(1.0, abs(camera_ProjMat[1][1] / camera_ProjMat[0][0]));
        float screenToWorld = max(centerClip.w, 0.0) * shortSide / abs(camera_ProjMat[1][1]);
        v.instanceEnergy = a.FIREFLY_POSITION.w;
        v.corner = a.POSITION.xy;
        v.coreMotion = vec2(0.0);
        #ifdef FIREFLY_GLOW
          vec4 projected = camera_ProjMat * centerVS;
          vec2 uv = projected.xy / max(projected.w, 0.0001) * 0.5 + 0.5;
          vec2 texel = 2.0 / vec2(textureSize(camera_DepthTexture, 0));
          float depth = -centerVS.z;
          float visible = visibilityAt(uv, depth);
          visible += visibilityAt(uv + texel, depth);
          visible += visibilityAt(uv - texel, depth);
          visible += visibilityAt(uv + vec2(texel.x, -texel.y), depth);
          visible += visibilityAt(uv + vec2(-texel.x, texel.y), depth);
          v.instanceEnergy *= visible * 0.2 * step(0.0, depth);
          float haloRadius = min(0.5, screenToWorld * 0.13);
          center += (camera_ViewInvMat[0].xyz * a.POSITION.x + camera_ViewInvMat[1].xyz * a.POSITION.y) * haloRadius;
        #else
          // Local approximation of the core's temporal softness. This is not TGSR2:
          // only current world velocity is consumed, with no screen history or glow trail.
          vec2 motion = -(camera_ViewMat * vec4(a.FIREFLY_VELOCITY, 0.0)).xy * (0.06 / 0.045);
          motion /= max(1.0, length(motion));
          v.coreMotion = motion;
          v.corner = a.POSITION.xy * (vec2(1.0) + abs(motion) * 0.5) + motion * 0.5;
          float coreRadius = min(0.045, screenToWorld * 0.032);
          center += (camera_ViewInvMat[0].xyz * v.corner.x + camera_ViewInvMat[1].xyz * v.corner.y) * coreRadius;
        #endif
        vec4 view = camera_ViewMat * vec4(center, 1.0);
        v.positionVS = view.xyz;
        gl_Position = camera_ProjMat * view;
        return v;
      }
      float coreCoverage(vec2 point) {
        // Compact smooth falloff: no flat disc, texture noise or blur pass.
        // Cubic coverage reaches the carrier boundary with zero slope.
        float radial = max(0.0, 1.0 - dot(point, point));
        return radial * radial * radial;
      }
      void frag(Varyings v) {
        float energy = v.instanceEnergy * firefly_Intensity;
        #ifdef FIREFLY_GLOW
          float radial = 1.0 - smoothstep(0.0, 1.0, length(v.corner));
          energy *= radial * radial * 0.12;
        #else
          // Smooth circular coverage also removes the carrier quad at close range.
          // Normalized weights preserve emission when moving; the extent is capped
          // to one core radius so the light cannot turn into a long comet ribbon.
          float coverage = 0.64 * coreCoverage(v.corner);
          coverage += 0.24 * coreCoverage(v.corner - v.coreMotion / 3.0);
          coverage += 0.09 * coreCoverage(v.corner - v.coreMotion * (2.0 / 3.0));
          coverage += 0.03 * coreCoverage(v.corner - v.coreMotion);
          energy *= 1.15 * coverage;
        #endif
        // Additive emission attenuates in fog without adding the fog colour a second time.
        #if SCENE_FOG_MODE != 0
          energy *= getSceneFogVisibility(v.positionVS);
        #endif
        gl_FragColor = outputSRGBCorrection(vec4(vec3(1.0, 0.95, 0.08) * energy, 0.0));
      }
    }
  }
}
