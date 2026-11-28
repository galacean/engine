
Shader "IntegratedWorld/WorldBubbleLoadingV1" {
  SubShader "Default" {
    Pass "Default" {
      Tags { pipelineStage = "Forward" }
      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.One;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      DepthState = { Enabled = false; WriteEnabled = false; }
      RasterState = { CullMode = CullMode.Off; }
      RenderQueueType = Transparent;

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Common.glsl"

      vec2 material_WorldBubbleResolution;
      float material_WorldBubbleTime;
      float material_WorldBubbleProgress;
      float material_WorldBubbleBurst;
      float material_WorldBubbleReducedMotion;
      float material_WorldBubbleTransfer0;
      float material_WorldBubbleTransferIndex0;
      float material_WorldBubbleHasTransfer0;
      float material_WorldBubbleTransfer1;
      float material_WorldBubbleTransferIndex1;
      float material_WorldBubbleHasTransfer1;
      float material_WorldBubbleTransfer2;
      float material_WorldBubbleTransferIndex2;
      float material_WorldBubbleHasTransfer2;
      float material_WorldBubbleTransfer3;
      float material_WorldBubbleTransferIndex3;
      float material_WorldBubbleHasTransfer3;

      struct Attributes {
        vec3 POSITION;
        vec2 TEXCOORD_0;
      };

      struct Varyings {
        vec2 uv;
      };

      Varyings vert(Attributes attributes) {
        Varyings output;
        // PrimitiveMesh planes are authored in XZ. Bypassing camera matrices makes this a full-screen pass.
        gl_Position = vec4(attributes.POSITION.x, attributes.POSITION.z, 0.0, 1.0);
        output.uv = attributes.TEXCOORD_0;
        return output;
      }

      const float WORLD_BUBBLE_PI = 3.141592653589793;

      float worldBubbleHash11(float value) {
        return fract(sin(value * 127.1 + 311.7) * 43758.5453123);
      }

      float worldBubbleHash21(vec2 value) {
        return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float worldBubbleSmoothMinimum(float a, float b, float smoothing) {
        float h = max(smoothing - abs(a - b), 0.0) / max(smoothing, 0.0001);
        return min(a, b) - h * h * smoothing * 0.25;
      }

      float worldBubbleRadius() {
        float progress = clamp(material_WorldBubbleProgress, 0.0, 1.0);
        float authoredRadius = mix(0.035, 0.125, pow(progress, 0.9));
        float idleMotion = mix(1.0, 0.0, material_WorldBubbleReducedMotion);
        float idleAmplitude = mix(0.00075, 0.0018, smoothstep(0.035, 0.125, authoredRadius));
        float idleBreath = sin(material_WorldBubbleTime * 1.65) * idleAmplitude * idleMotion;
        float charge = smoothstep(0.0, 0.22, material_WorldBubbleBurst) *
          (1.0 - smoothstep(0.22, 0.48, material_WorldBubbleBurst));
        return authoredRadius + idleBreath + charge * 0.055;
      }

      float worldBubbleWorldField(vec2 point) {
        return length(point) - worldBubbleRadius();
      }

      vec3 worldBubbleParticle(float index, float travel) {
        float seed = worldBubbleHash11(index + 1.0);
        float angle = index * 2.39996323 + seed * 0.7;
        vec2 direction = vec2(cos(angle), sin(angle));
        vec2 tangent = vec2(-direction.y, direction.x);
        // A short physical push accelerates from rest, then an easeOutBack-like drag
        // curve slows, slightly overshoots, and settles the bubble into the World.
        float pushDuration = 0.10;
        float pushDistance = 0.185;
        float easedTravel;
        if (travel < pushDuration) {
          float push = travel / pushDuration;
          easedTravel = pushDistance * push * push;
        } else {
          float settle = (travel - pushDuration) / (1.0 - pushDuration);
          float backOffset = settle - 1.0;
          float backStrength = 1.10;
          float easeOutBack = 1.0 +
            (backStrength + 1.0) * backOffset * backOffset * backOffset +
            backStrength * backOffset * backOffset;
          easedTravel = pushDistance + (1.0 - pushDistance) * easeOutBack;
        }
        float airEnvelope = sin(travel * WORLD_BUBBLE_PI);
        float airPhase = seed * WORLD_BUBBLE_PI * 2.0;
        float aspect = material_WorldBubbleResolution.x / max(material_WorldBubbleResolution.y, 1.0);
        float screenEdge = 0.54 / max(abs(direction.y), abs(direction.x) / max(aspect, 0.1));
        float outerRadius = screenEdge * mix(0.92, 1.18, worldBubbleHash11(index + 37.0));
        float innerRadius = worldBubbleRadius() * 0.58;
        float radialDistance = mix(outerRadius, innerRadius, easedTravel);
        float radialBob = sin(travel * WORLD_BUBBLE_PI * 2.6 + airPhase) * 0.010 * airEnvelope;
        float broadDrift = mix(-0.12, 0.12, worldBubbleHash11(index + 53.0)) * airEnvelope;
        float floatingDrift = (
          sin(travel * WORLD_BUBBLE_PI * 2.0 + airPhase) * 0.030 +
          sin(travel * WORLD_BUBBLE_PI * 4.4 + airPhase * 1.7) * 0.007
        ) * airEnvelope;
        vec2 position = direction * (radialDistance + radialBob) + tangent * (broadDrift + floatingDrift);
        float radius = mix(0.012, 0.032, worldBubbleHash11(index + 71.0));
        radius *= 1.0 + sin(material_WorldBubbleTime * 3.2 + airPhase) * 0.045 * airEnvelope;
        radius *= mix(1.0, 0.44, smoothstep(0.78, 1.0, travel));
        return vec3(position, radius);
      }

      vec3 worldBubbleBackdrop(vec2 point) {
        float vignette = clamp(1.0 - length(point * vec2(0.72, 1.0)) * 0.72, 0.0, 1.0);
        vec3 color = mix(vec3(0.00025, 0.00035, 0.0008), vec3(0.0015, 0.0020, 0.0045), vignette);

        vec2 dustGrid = (point + vec2(1.9, 0.9)) * 34.0;
        vec2 dustCell = floor(dustGrid);
        vec2 dustLocal = fract(dustGrid) - vec2(0.5);
        float dustSeed = worldBubbleHash21(dustCell);
        float dust = (1.0 - smoothstep(0.015, 0.075, length(dustLocal))) * step(0.982, dustSeed);
        float twinkle = 0.55 + 0.45 * sin(material_WorldBubbleTime * 0.8 + dustSeed * 18.0);
        color += mix(vec3(0.24, 0.62, 0.72), vec3(0.72, 0.35, 0.82), dustSeed) * dust * twinkle * 0.32;
        return color;
      }

      float worldBubbleLoadingOrbBrightness() {
        float motion = mix(1.0, 0.0, material_WorldBubbleReducedMotion);
        return sin(material_WorldBubbleTime) * 0.2 * motion;
      }

      float worldBubbleLoadingOrbCircleIntensity(float referenceRadius, float brightness) {
        float circleRadius = 0.24 + brightness * 0.1;
        float invCircleRadius = 1.0 / circleRadius;
        float circleFade = pow(max(referenceRadius * 2.0, 0.0), 0.5);
        float invCircleFade = 1.0 - circleFade;
        float circleIntensity = pow(
          invCircleFade * max(1.1 - circleFade, 0.0),
          2.0
        ) * 60.0;
        if (referenceRadius < circleRadius) {
          circleIntensity *= pow(referenceRadius * invCircleRadius, 24.0);
        }
        return circleIntensity;
      }

      vec3 worldBubbleLoadingOrbEmission(float signedDistance, float localRadius) {
        // Adapted from "LoadingOrb" by bjarnia:
        // https://www.shadertoy.com/view/ldX3D7
        // Only the breathing ring is authored here. Its unclamped HDR energy is
        // diffused once by the Loading Scene's native full-screen Bloom pass.
        float brightness = worldBubbleLoadingOrbBrightness();
        float safeRadius = max(localRadius, 0.0001);
        float radialDistance = max(safeRadius + signedDistance, 0.0);
        float referenceRadius = radialDistance * (0.24 / safeRadius);
        float circleIntensity = worldBubbleLoadingOrbCircleIntensity(referenceRadius, brightness);
        float fadeIn = min(material_WorldBubbleTime / 2.0, 1.0);
        float hdrRing = pow(circleIntensity, 2.6) * 3.0;
        return vec3(hdrRing * fadeIn);
      }

      void frag(Varyings input) {
        vec2 resolution = max(material_WorldBubbleResolution, vec2(1.0));
        float aspect = resolution.x / resolution.y;
        vec2 point = (input.uv - vec2(0.5)) * vec2(aspect, 1.0);
        float epsilon = max(1.6 / resolution.y, 0.0012);
        vec3 particle0 = worldBubbleParticle(
          material_WorldBubbleTransferIndex0,
          material_WorldBubbleTransfer0
        );
        vec3 particle1 = worldBubbleParticle(
          material_WorldBubbleTransferIndex1,
          material_WorldBubbleTransfer1
        );
        vec3 particle2 = worldBubbleParticle(
          material_WorldBubbleTransferIndex2,
          material_WorldBubbleTransfer2
        );
        vec3 particle3 = worldBubbleParticle(
          material_WorldBubbleTransferIndex3,
          material_WorldBubbleTransfer3
        );
        float worldRadius = worldBubbleRadius();
        float localRadius = worldRadius;
        float distanceToFusion = length(point) - worldRadius;

        float particleDistance0 = mix(
          4.0,
          length(point - particle0.xy) - particle0.z,
          material_WorldBubbleHasTransfer0
        );
        float mergeWidth0 = particle0.z * mix(
          0.78,
          0.96,
          worldBubbleHash11(material_WorldBubbleTransferIndex0 + 89.0)
        );
        float particleWeight0 = smoothstep(
          -mergeWidth0,
          mergeWidth0,
          distanceToFusion - particleDistance0
        ) * material_WorldBubbleHasTransfer0;
        localRadius = mix(localRadius, particle0.z, particleWeight0);
        distanceToFusion = worldBubbleSmoothMinimum(distanceToFusion, particleDistance0, mergeWidth0);

        float particleDistance1 = mix(
          4.0,
          length(point - particle1.xy) - particle1.z,
          material_WorldBubbleHasTransfer1
        );
        float mergeWidth1 = particle1.z * mix(
          0.78,
          0.96,
          worldBubbleHash11(material_WorldBubbleTransferIndex1 + 89.0)
        );
        float particleWeight1 = smoothstep(
          -mergeWidth1,
          mergeWidth1,
          distanceToFusion - particleDistance1
        ) * material_WorldBubbleHasTransfer1;
        localRadius = mix(localRadius, particle1.z, particleWeight1);
        distanceToFusion = worldBubbleSmoothMinimum(distanceToFusion, particleDistance1, mergeWidth1);

        float particleDistance2 = mix(
          4.0,
          length(point - particle2.xy) - particle2.z,
          material_WorldBubbleHasTransfer2
        );
        float mergeWidth2 = particle2.z * mix(
          0.78,
          0.96,
          worldBubbleHash11(material_WorldBubbleTransferIndex2 + 89.0)
        );
        float particleWeight2 = smoothstep(
          -mergeWidth2,
          mergeWidth2,
          distanceToFusion - particleDistance2
        ) * material_WorldBubbleHasTransfer2;
        localRadius = mix(localRadius, particle2.z, particleWeight2);
        distanceToFusion = worldBubbleSmoothMinimum(distanceToFusion, particleDistance2, mergeWidth2);

        float particleDistance3 = mix(
          4.0,
          length(point - particle3.xy) - particle3.z,
          material_WorldBubbleHasTransfer3
        );
        float mergeWidth3 = particle3.z * mix(
          0.78,
          0.96,
          worldBubbleHash11(material_WorldBubbleTransferIndex3 + 89.0)
        );
        float particleWeight3 = smoothstep(
          -mergeWidth3,
          mergeWidth3,
          distanceToFusion - particleDistance3
        ) * material_WorldBubbleHasTransfer3;
        localRadius = mix(localRadius, particle3.z, particleWeight3);
        distanceToFusion = worldBubbleSmoothMinimum(distanceToFusion, particleDistance3, mergeWidth3);

        float fusionMask = 1.0 - smoothstep(-epsilon, epsilon, distanceToFusion);
        vec3 backdrop = worldBubbleBackdrop(point);
        vec3 orbEmission = worldBubbleLoadingOrbEmission(distanceToFusion, localRadius);
        vec3 color = mix(backdrop, vec3(0.0), fusionMask) + orbEmission;

        // At completion, the LoadingOrb bloom expands until it washes the screen white.
        float burst = clamp(material_WorldBubbleBurst, 0.0, 1.0);
        float burstActive = step(0.001, burst);
        float burstCurve = smoothstep(0.0, 0.74, burst);
        float cornerRadius = length(vec2(aspect * 0.5, 0.5));
        float bloomRadius = mix(worldBubbleRadius() * 0.88, cornerRadius + 0.16, burstCurve);
        float bloomDistance = length(point) - bloomRadius;
        float bloomCore = 1.0 - smoothstep(-0.045, 0.045, bloomDistance);
        float bloomHalo = exp(-max(bloomDistance, 0.0) * 15.0);
        float burstEnergy = smoothstep(0.01, 0.18, burst);
        float whiteBloom = clamp(
          (bloomCore + bloomHalo * 0.82) * burstEnergy * burstActive,
          0.0,
          1.0
        );
        color = mix(color, vec3(1.0), whiteBloom);

        // Hold one full-white beat before the bloom recedes into the live World.
        float worldReveal = smoothstep(0.82, 1.0, burst);
        float alpha = 1.0 - worldReveal;

        vec4 finalColor = vec4(color, alpha);
        #ifdef ENGINE_SHOULD_SRGB_CORRECT
          finalColor = outputSRGBCorrection(finalColor);
        #endif
        finalColor.rgb *= finalColor.a;
        gl_FragColor = finalColor;
      }
    }
  }
}
