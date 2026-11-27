
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
      mediump sampler2D material_SeedWorldFrostTexture;
      vec2 material_SeedWorldSourceTexelSize;
      vec2 material_SeedWorldScreenSize;
      vec2 material_SeedWorldPanelPixelSize;
      float material_SeedWorldCornerRadiusPixels;
      float material_SeedWorldGlassOpacity;
      float material_SeedWorldGlassRoughness;
      float material_SeedWorldBackdropBlurPixels;
      float material_SeedWorldRimHighlight;
      float material_SeedWorldInteriorRefractionStrength;
      float material_SeedWorldWhiteTint;
      float material_SeedWorldFullLensRefraction;
      float material_SeedWorldChromaticAberration;
      float material_SeedWorldFrostMaxMip;
      float material_SeedWorldLensIor;
      float material_SeedWorldLensThickness;
      float material_SeedWorldFrostScale;
      float material_SeedWorldLensFresnel;
      vec2 material_SeedWorldQuadExpandPixels;
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
        vec3 pos = attr.POSITION;
        pos.xy += vec2(attr.TEXCOORD_0.x - 0.5, 0.5 - attr.TEXCOORD_0.y) * material_SeedWorldQuadExpandPixels;
        vec4 clipPosition = renderer_MVPMat * vec4(pos, 1.0);
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

      vec3 seedWorldSampleTransmission(vec2 uv, float footprintPx) {
        if (footprintPx <= 0.0 || material_SeedWorldFrostMaxMip <= 0.0) return seedWorldSampleScene(uv);
        // The first level is a quarter-sized copy of the scene. Each mip doubles its footprint.
        float lod = clamp(log2(max(footprintPx * 0.25, 1.0)), 0.0, material_SeedWorldFrostMaxMip);
        vec3 frost = texture2DLodEXT(material_SeedWorldFrostTexture, clamp(uv, 0.0, 1.0), lod).rgb;
        if (footprintPx < 4.0) return mix(seedWorldSampleScene(uv), frost, smoothstep(0.0, 4.0, footprintPx));
        return frost;
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
        float roughness = clamp(material_SeedWorldGlassRoughness, 0.0, 1.0);
        float footprintPx = min(panelPixelSize.x, panelPixelSize.y) * roughness * material_SeedWorldFrostScale;
        float fullLens = clamp(material_SeedWorldFullLensRefraction, 0.0, 1.0);

        // Dedicated fast path for full-sphere PBR refraction + hardware mipmap frosted glass (3 texture taps total).
        if (fullLens >= 0.999) {
          vec2 localCentered = (v.v_localUv - vec2(0.5)) * 2.0;
          float r2 = min(dot(localCentered, localCentered), 0.999);
          float sphereZ = sqrt(max(0.001, 1.0 - r2));
          vec3 N = normalize(vec3(localCentered, sphereZ));
          vec3 V = vec3(0.0, 0.0, -1.0);
          vec2 orbUvRadius = (panelPixelSize * 0.5) / screenSize;

          // Physical sphere refraction (adapted from Galacean PBR Refraction.glsl refractionModelSphere)
          // with Cauchy RGB dispersion across the entire convex glass sphere.
          float caStrength = max(material_SeedWorldChromaticAberration, 0.0);
          float iorSpread = 0.18 * caStrength;
          float iorG = max(material_SeedWorldLensIor, 1.0);
          float iorR = max(1.01, iorG - iorSpread);
          float iorB = iorG + iorSpread;
          float thickness = max(material_SeedWorldLensThickness, 0.0);

          vec3 rayR = refract(V, N, 1.0 / iorR);
          vec3 rayG = refract(V, N, 1.0 / iorG);
          vec3 rayB = refract(V, N, 1.0 / iorB);
          float distR = dot(-N, rayR) * thickness;
          float distG = dot(-N, rayG) * thickness;
          float distB = dot(-N, rayB) * thickness;

          // Map exit ray offset to screen UV (matching existing -normal refraction axis convention)
          vec2 uvR = clamp(screenUv + rayR.xy * distR * orbUvRadius, vec2(0.002), vec2(0.998));
          vec2 uvG = clamp(screenUv + rayG.xy * distG * orbUvRadius, vec2(0.002), vec2(0.998));
          vec2 uvB = clamp(screenUv + rayB.xy * distB * orbUvRadius, vec2(0.002), vec2(0.998));

          vec3 lensColor = seedWorldSampleTransmission(uvG, footprintPx);
          if (caStrength > 0.0) {
            lensColor.r = seedWorldSampleTransmission(uvR, footprintPx).r;
            lensColor.b = seedWorldSampleTransmission(uvB, footprintPx).b;
          }

          // Physically balanced linear-space Schlick Fresnel (no milky white fog lift).
          float oneMinusCos = clamp(1.0 - sphereZ, 0.0, 1.0);
          float fresnel = 0.04 + 0.96 * pow(oneMinusCos, 4.2);
          vec3 color = lensColor * (1.0 - fresnel * 0.18);
          color += vec3(0.05, 0.075, 0.12) * fresnel * material_SeedWorldLensFresnel;
          // Crisp rim boost only during interactive press/listening highlight
          float highlight = clamp(material_SeedWorldRimHighlight, 0.0, 1.0);
          color += vec3(0.28, 0.52, 0.72) * fresnel * highlight;
          if (material_SeedWorldWhiteTint > 0.001) {
            color = mix(color, vec3(1.0), clamp(material_SeedWorldWhiteTint, 0.0, 1.0));
          }
          vec4 finalColor = vec4(color * v.v_color.rgb, glassAlpha);
          #ifdef ENGINE_SHOULD_SRGB_CORRECT
            finalColor = outputSRGBCorrection(finalColor);
          #endif
          gl_FragColor = finalColor;
          return;
        }

        float boundary = seedWorldRemap01(-SEED_WORLD_REFR_DIM, epsilon, distanceToGlass);
        boundary = mix(boundary, 0.0, smoothstep(0.0, epsilon, distanceToGlass));
        float cosineBoundary = 1.0 - cos(boundary * SEED_WORLD_PI * 0.5);
        vec3 ior = mix(vec3(SEED_WORLD_REFR_IOR.g), SEED_WORLD_REFR_IOR, SEED_WORLD_REFR_ABERRATION);
        vec2 refractionOffset = -normal * SEED_WORLD_REFR_MAG;
        vec3 refractionRatio = pow(vec3(cosineBoundary), ior);
        vec2 offsetR = refractionOffset * refractionRatio.r;
        vec2 offsetG = refractionOffset * refractionRatio.g;
        vec2 offsetB = refractionOffset * refractionRatio.b;

        float minimumHalfSize = min(halfSize.x, halfSize.y);
        float edgeRefractionWidth = min(
          SEED_WORLD_REFR_DIM,
          max(minimumHalfSize * SEED_WORLD_EDGE_REFRACTION_FRACTION, epsilon * 2.0)
        );
        float edgeRefractionWeight = smoothstep(-edgeRefractionWidth, 0.0, distanceToGlass);
        float interiorRefractionStrength = clamp(material_SeedWorldInteriorRefractionStrength, 0.0, 1.0);
        float refractionWeight = mix(edgeRefractionWeight, 1.0, interiorRefractionStrength);
        float interior = 1.0 - smoothstep(0.0, epsilon, distanceToGlass);
        vec3 color;
        if (material_SeedWorldBackdropBlurPixels > 0.0) {
          color = seedWorldSampleTransmission(screenUv + offsetG * refractionWeight * interior, material_SeedWorldBackdropBlurPixels);
        } else {
          vec3 baseColor = seedWorldSampleScene(screenUv);
          vec3 transmittedColor = baseColor;
          vec3 displacedColor;
          if (roughness > 0.001) {
            transmittedColor = seedWorldSampleRoughScene(screenUv, texelSize, panelPixelSize, roughness);
            displacedColor = seedWorldSampleRoughScene(screenUv + offsetG, texelSize, panelPixelSize, roughness);
          } else {
            displacedColor = vec3(
              seedWorldSampleScene(screenUv + offsetR).r,
              seedWorldSampleScene(screenUv + offsetG).g,
              seedWorldSampleScene(screenUv + offsetB).b
            );
          }
          color = mix(baseColor, mix(transmittedColor, displacedColor, refractionWeight), interior);
        }

        float edgePosition = seedWorldRemap01(-SEED_WORLD_EDGE_DIM, 0.0, distanceToGlass);
        float edge = min(interior, edgePosition);
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
