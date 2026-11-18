
Shader "SeedWorld/LiquidGlassUiV6" {
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
      mediump sampler2D material_SeedWorldSceneTexture;
      vec2 material_SeedWorldSourceTexelSize;
      vec2 material_SeedWorldScreenSize;
      vec2 material_SeedWorldPanelPixelSize;
      float material_SeedWorldCornerRadiusPixels;
      float material_SeedWorldGlassOpacity;
      float material_SeedWorldGlassRoughness;
      float material_SeedWorldRimHighlight;
      float material_SeedWorldInteriorRefractionStrength;
      float material_SeedWorldWhiteTint;
      #ifdef SEED_WORLD_GLASS_MASK
        sampler2D material_SeedWorldGlassMask;
      #endif

      struct Attributes {
        vec3 POSITION;
        vec2 TEXCOORD_0;
        vec4 COLOR_0;
      };

      struct Varyings {
        vec2 v_localUv;
        vec2 v_sceneUv;
        vec4 v_color;
      };

      Varyings vert(Attributes attr) {
        Varyings v;
        vec4 clipPosition = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        gl_Position = clipPosition;
        // Intermediate camera targets flip projection; scene sampling stays screen-oriented.
        vec2 screenPosition = vec2(clipPosition.x, clipPosition.y * camera_ProjectionParams.x);
        vec2 bottomOriginUv = screenPosition / max(clipPosition.w, 0.0001) * 0.5 + 0.5;
        v.v_sceneUv = vec2(bottomOriginUv.x, 1.0 - bottomOriginUv.y);
        v.v_localUv = attr.TEXCOORD_0;
        v.v_color = attr.COLOR_0;
        return v;
      }

      const float SEED_WORLD_PI = 3.141592653589323;
      const float SEED_WORLD_REFR_DIM = 0.05;
      const float SEED_WORLD_REFR_MAG = 0.1;
      const float SEED_WORLD_REFR_ABERRATION = 5.0;
      const vec3 SEED_WORLD_REFR_IOR = vec3(1.51, 1.52, 1.53);
      const float SEED_WORLD_EDGE_DIM = 0.003;
      const float SEED_WORLD_REFL_OFFSET_MIN = 0.035;
      const float SEED_WORLD_REFL_OFFSET_MAG = 0.005;
      const float SEED_WORLD_EDGE_REFRACTION_FRACTION = 0.32;

      float seedWorldRemap01(float minimumValue, float maximumValue, float value) {
        return clamp((value - minimumValue) / (maximumValue - minimumValue), 0.0, 1.0);
      }

      vec3 seedWorldRoundedBoxField(vec2 point, vec2 halfSize, float radius) {
        vec2 w = abs(point) - (halfSize - radius);
        vec2 signValue = vec2(point.x < 0.0 ? -1.0 : 1.0, point.y < 0.0 ? -1.0 : 1.0);
        float maximum = max(w.x, w.y);
        vec2 q = max(w, vec2(0.0));
        float qLength = length(q);
        vec2 gradient = signValue * (
          maximum > 0.0
            ? q / max(qLength, 0.00001)
            : (w.x > w.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0))
        );
        return vec3(maximum > 0.0 ? qLength - radius : maximum - radius, gradient);
      }

      vec3 seedWorldBlendScreen(vec3 a, vec3 b) {
        return 1.0 - (1.0 - a) * (1.0 - b);
      }

      vec3 seedWorldSampleScene(vec2 uv) {
        return texture2DSRGB(material_SeedWorldSceneTexture, clamp(uv, vec2(0.002), vec2(0.998))).rgb;
      }

      vec3 seedWorldSampleRoughRow(vec2 uv, vec2 stepUv, float row) {
        return
          seedWorldSampleScene(uv + stepUv * vec2(-2.0, row)) +
          seedWorldSampleScene(uv + stepUv * vec2(-1.0, row)) * 4.0 +
          seedWorldSampleScene(uv + stepUv * vec2(0.0, row)) * 6.0 +
          seedWorldSampleScene(uv + stepUv * vec2(1.0, row)) * 4.0 +
          seedWorldSampleScene(uv + stepUv * vec2(2.0, row));
      }

      vec3 seedWorldSampleRoughScene(
        vec2 uv,
        vec2 texelSize,
        vec2 panelPixelSize,
        float roughness
      ) {
        float blurRadiusPixels =
          min(panelPixelSize.x, panelPixelSize.y) * roughness * roughness * 0.65;
        if (blurRadiusPixels <= 0.5) return seedWorldSampleScene(uv);
        vec2 stepUv = texelSize * blurRadiusPixels * 0.5;
        vec3 color = seedWorldSampleRoughRow(uv, stepUv, -2.0);
        color += seedWorldSampleRoughRow(uv, stepUv, -1.0) * 4.0;
        color += seedWorldSampleRoughRow(uv, stepUv, 0.0) * 6.0;
        color += seedWorldSampleRoughRow(uv, stepUv, 1.0) * 4.0;
        color += seedWorldSampleRoughRow(uv, stepUv, 2.0);
        return color / 256.0;
      }

      vec3 seedWorldBufferD(vec2 uv, vec2 texelSize) {
        vec2 bloomTexel = texelSize * 11.0;
        vec3 blurred = seedWorldSampleScene(uv);
        blurred += seedWorldSampleScene(uv + vec2(bloomTexel.x, 0.0));
        blurred += seedWorldSampleScene(uv - vec2(bloomTexel.x, 0.0));
        blurred += seedWorldSampleScene(uv + vec2(0.0, bloomTexel.y));
        blurred += seedWorldSampleScene(uv - vec2(0.0, bloomTexel.y));
        blurred += seedWorldSampleScene(uv + bloomTexel);
        blurred += seedWorldSampleScene(uv - bloomTexel);
        blurred += seedWorldSampleScene(uv + vec2(bloomTexel.x, -bloomTexel.y));
        blurred += seedWorldSampleScene(uv + vec2(-bloomTexel.x, bloomTexel.y));
        blurred /= 9.0;
        vec3 highlight = clamp(blurred - vec3(0.2), vec3(0.0), vec3(1.0)) / 0.8;
        return seedWorldBlendScreen(seedWorldSampleScene(uv), highlight);
      }

      void frag(Varyings v) {
        vec2 screenSize = max(material_SeedWorldScreenSize, vec2(1.0));
        vec2 panelPixelSize = max(material_SeedWorldPanelPixelSize, vec2(1.0));
        vec2 point = (v.v_localUv - vec2(0.5)) * panelPixelSize / screenSize.y;
        vec2 halfSize = panelPixelSize * 0.5 / screenSize.y;
        float radius = min(material_SeedWorldCornerRadiusPixels, panelPixelSize.y * 0.5) / screenSize.y;
        vec3 field = seedWorldRoundedBoxField(point, halfSize, radius);
        float distanceToGlass = field.x;
        vec2 normal = field.yz;
        float epsilon = max(2.0 / screenSize.y, 0.0025);
        float shape = 1.0 - smoothstep(-epsilon, epsilon, distanceToGlass);
        #ifdef SEED_WORLD_GLASS_MASK
          shape *= texture2D(material_SeedWorldGlassMask, v.v_localUv).a;
        #endif
        float glassAlpha = shape * material_SeedWorldGlassOpacity * v.v_color.a;
        if (glassAlpha <= 0.001) discard;

        vec2 screenUv = v.v_sceneUv;
        vec2 texelSize = material_SeedWorldSourceTexelSize;
        float boundary = seedWorldRemap01(-SEED_WORLD_REFR_DIM, epsilon, distanceToGlass);
        boundary = mix(boundary, 0.0, smoothstep(0.0, epsilon, distanceToGlass));
        float cosineBoundary = 1.0 - cos(boundary * SEED_WORLD_PI * 0.5);
        vec3 ior = mix(vec3(SEED_WORLD_REFR_IOR.g), SEED_WORLD_REFR_IOR, SEED_WORLD_REFR_ABERRATION);
        vec2 refractionOffset = -normal * SEED_WORLD_REFR_MAG;
        vec3 refractionRatio = pow(vec3(cosineBoundary), ior);
        vec2 offsetR = refractionOffset * refractionRatio.r;
        vec2 offsetG = refractionOffset * refractionRatio.g;
        vec2 offsetB = refractionOffset * refractionRatio.b;

        vec3 baseColor = seedWorldSampleScene(screenUv);
        float roughness = clamp(material_SeedWorldGlassRoughness, 0.0, 1.0);
        vec3 transmittedColor = roughness > 0.001
          ? seedWorldSampleRoughScene(screenUv, texelSize, panelPixelSize, roughness)
          : baseColor;
        vec3 displacedColor;
        if (roughness > 0.001) {
          displacedColor = seedWorldSampleRoughScene(screenUv + offsetG, texelSize, panelPixelSize, roughness);
        } else {
          displacedColor = vec3(
            seedWorldSampleScene(screenUv + offsetR).r,
            seedWorldSampleScene(screenUv + offsetG).g,
            seedWorldSampleScene(screenUv + offsetB).b
          );
        }

        float minimumHalfSize = min(halfSize.x, halfSize.y);
        float edgeRefractionWidth = min(
          SEED_WORLD_REFR_DIM,
          max(minimumHalfSize * SEED_WORLD_EDGE_REFRACTION_FRACTION, epsilon * 2.0)
        );
        float edgeRefractionWeight = smoothstep(-edgeRefractionWidth, 0.0, distanceToGlass);
        float interiorRefractionStrength = clamp(material_SeedWorldInteriorRefractionStrength, 0.0, 1.0);
        float refractionWeight = mix(edgeRefractionWeight, 1.0, interiorRefractionStrength);
        vec3 refractedColor = mix(transmittedColor, displacedColor, refractionWeight);
        float interior = smoothstep(epsilon, 0.0, distanceToGlass);
        vec3 color = mix(baseColor, refractedColor, interior);

        float edgeInterior = smoothstep(epsilon, 0.0, distanceToGlass);
        float edgePosition = seedWorldRemap01(-SEED_WORLD_EDGE_DIM, 0.0, distanceToGlass);
        float edge = min(edgeInterior, edgePosition);
        float cosineEdge = 1.0 - cos(edge * SEED_WORLD_PI * 0.5);
        float rimLightIntensity = abs(dot(normal, normalize(vec2(-1.0, 1.0))));
        vec3 rimLight = vec3(1.0) * 0.15 * rimLightIntensity;
        vec2 reflectionOffset =
          (SEED_WORLD_REFL_OFFSET_MIN + SEED_WORLD_REFL_OFFSET_MAG * cosineEdge) * normal;
        vec3 reflectionColor = seedWorldBufferD(screenUv + reflectionOffset, texelSize);
        color = mix(color, max(color, seedWorldBlendScreen(rimLight, reflectionColor)), cosineEdge);

        color = mix(color, max(color, vec3(1.0)),
          cosineEdge * clamp(material_SeedWorldRimHighlight, 0.0, 1.0));
        color = mix(color, vec3(1.0), clamp(material_SeedWorldWhiteTint, 0.0, 1.0));
        vec4 finalColor = vec4(color * v.v_color.rgb, glassAlpha);
        #ifdef ENGINE_SHOULD_SRGB_CORRECT
          finalColor = outputSRGBCorrection(finalColor);
        #endif
        gl_FragColor = finalColor;
      }
    }
  }
}
