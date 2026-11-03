Shader "S_VFX_TransparentAlpha_8541b131eb" {
  Editor {
    Properties {
      material_OpacityIntensity("Opacity Intensity", Float) = 1;
      material_EmissiveColor("Emissive Color", Color) = (0.5028866, 0.5028866, 0.5028866);
      material_EmissiveIntensity("Emissive Intensity", Float) = 1;
      material_GeometryDepthFadeDistance("Geometry Depth Fade Distance", Float) = 0.65;
      material_CameraDepthFadeDistance("Camera Depth Fade Distance", Float) = 1.5;
      material_CameraDepthFadeOffset("Camera Depth Fade Offset", Float) = 0.6;
      material_StreakMaxPixels("Streak Max Pixels", Float) = 12;
      material_StreakStartSpeed("Streak Start Speed", Float) = 25;
      material_StreakFullSpeed("Streak Full Speed", Float) = 260;
      material_StreakExposureTime("Streak Exposure Time", Float) = 0.00065;
      material_StreakWidthScale("Streak Width Scale", Float) = 0.72;
      material_StreakPopulation("Streak Population", Float) = 0.9;
      material_FlakeMinDiameterPixels("Flake Min Diameter Pixels", Float) = 0.9;
      material_FlakeMaxRadiusPixels("Flake Max Radius Pixels", Float) = 2.5;
      material_ParticleMinPixels("Particle Min Pixels", Float) = 0.05;
      material_ParticleFadeRangePixels("Particle Fade Range Pixels", Float) = 0.3;
      material_Opacity("Opacity", Texture2D);
      Header("Render State") {
        renderQueueType("Render Queue", Enum(Opaque:0, AlphaTest:1, Transparent:2)) = 2;
        rasterStateCullMode("Cull Mode", Enum(Off:0, Front:1, Back:2)) = 0;
        depthWriteEnabled("Depth Write", Boolean) = false;
      }
    }
  }

  SubShader "Default" {
    Pass "Forward Pass" {
      Tags { pipelineStage = "Forward" }

      RenderQueueType renderQueueType;
      CullMode rasterStateCullMode;
      Bool depthWriteEnabled;

      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.One;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
        ColorWriteMask[0] = ColorWriteMask.All;
      }
      DepthState = {
        CompareFunction = CompareFunction.LessEqual;
        WriteEnabled = depthWriteEnabled;
      }
      RasterState = {
        CullMode = rasterStateCullMode;
      }
      RenderQueueType = renderQueueType;

      VertexShader = vert;
      FragmentShader = frag;

      #define MATERIAL_HAS_BASETEXTURE
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      precision highp int;
      float material_OpacityIntensity;
      vec4 material_EmissiveColor;
      float material_EmissiveIntensity;
      float material_GeometryDepthFadeDistance;
      float material_CameraDepthFadeDistance;
      float material_CameraDepthFadeOffset;
      float material_StreakMaxPixels;
      float material_StreakStartSpeed;
      float material_StreakFullSpeed;
      float material_StreakExposureTime;
      float material_StreakWidthScale;
      float material_StreakPopulation;
      float material_FlakeMinDiameterPixels;
      float material_FlakeMaxRadiusPixels;
      float material_ParticleMinPixels;
      float material_ParticleFadeRangePixels;
      vec2 camera_ViewportSize;
      mat4 camera_VPMat;
      #ifdef MATERIAL_SNOW_SOFT_DEPTH
          sampler2D camera_DepthTexture;
      #endif
      sampler2D material_Opacity;

      struct ParticleVaryings {
          vec4 v_Color;
          #ifdef MATERIAL_HAS_BASETEXTURE
              vec2 v_TextureCoordinate;
          #endif
          #ifdef RENDERER_MODE_MESH
              vec4 v_MeshColor;
          #endif
          float v_ParticleEyeDepth;
          #ifdef MATERIAL_SNOW_SOFT_DEPTH
              vec4 v_ScreenPosition;
          #endif
          float v_VisualAlphaScale;
          float v_ScreenSizeFade;
      };

      #include "ShaderLibrary/Particle/ParticleVert.glsl"

      void computeSnowParticleStateWS(
          Attributes attr,
          float age,
          float normalizedAge,
          out vec3 particleCenterWS,
          out vec3 visualVelocityWS
      ) {
          vec4 worldRotation = renderer_SimulationSpace == 0
              ? renderer_WorldRotation
              : attr.a_SimulationWorldRotation;
          vec3 localVelocity;
          vec3 worldVelocity;
          #ifdef RENDERER_TRANSFORM_FEEDBACK
              if (renderer_SimulationSpace == 0) {
                  particleCenterWS = rotationByQuaternions(attr.a_FeedbackPosition, worldRotation)
                      + renderer_WorldPosition;
              } else {
                  particleCenterWS = attr.a_FeedbackPosition;
              }
              localVelocity = attr.a_FeedbackVelocity;
              worldVelocity = vec3(0.0);
              #ifdef _VOL_LINEAR_MODULE_ENABLED
                  vec3 instantVelocity = evaluateVOLVelocity(attr, normalizedAge);
                  if (renderer_VOLSpace == 0) {
                      localVelocity += instantVelocity;
                  } else {
                      worldVelocity += instantVelocity;
                  }
              #endif
          #else
              vec3 startVelocity = attr.a_DirectionTime.xyz * attr.a_StartSpeed;
              vec3 gravityVelocity = renderer_Gravity * attr.a_Random0.x * age;
              localVelocity = startVelocity;
              worldVelocity = gravityVelocity;
              particleCenterWS = computeParticlePosition(
                  attr,
                  startVelocity,
                  age,
                  normalizedAge,
                  gravityVelocity,
                  worldRotation,
                  localVelocity,
                  worldVelocity
              );
          #endif
          visualVelocityWS = rotationByQuaternions(renderer_SizeScale * localVelocity, worldRotation)
              + worldVelocity;
      }

      vec3 computeSnowAuthoredVertexWS(
          Attributes attr,
          float age,
          float normalizedAge,
          vec3 particleCenterWS,
          out vec2 particleSize
      ) {
          vec2 corner = attr.a_CornerTextureCoordinate.xy + renderer_PivotOffset.xy;
          vec3 sideVector = normalize(cross(camera_Forward, camera_Up));
          vec3 upVector = normalize(cross(sideVector, camera_Forward));
          particleSize = computeParticleSizeBillboard(attr, attr.a_StartSize.xy, normalizedAge);
          corner *= particleSize;
          if (renderer_ThreeDStartRotation) {
              vec3 rotation = radians(attr.a_StartRotation0);
              #if defined(RENDERER_ROL_CONSTANT_MODE) || defined(RENDERER_ROL_CURVE_MODE)
                  rotation.z = radians(computeParticleRotationFloat(attr, attr.a_StartRotation0.z, age, normalizedAge));
              #endif
              return particleCenterWS
                  + renderer_SizeScale.xzy * rotationByEuler(corner.x * sideVector + corner.y * upVector, rotation);
          }

          float rotationRadians;
          #if defined(RENDERER_ROL_CONSTANT_MODE) || defined(RENDERER_ROL_CURVE_MODE)
              rotationRadians = radians(computeParticleRotationFloat(attr, attr.a_StartRotation0.x, age, normalizedAge));
          #else
              rotationRadians = radians(attr.a_StartRotation0.x);
          #endif
          float c = cos(rotationRadians);
          float s = sin(rotationRadians);
          corner = mat2(c, -s, s, c) * corner;
          return particleCenterWS + renderer_SizeScale.xzy * (corner.x * sideVector + corner.y * upVector);
      }

      float computeSnowParticleVisualRandom(Attributes attr) {
          // Derive a stable visual-only random from immutable birth attributes that are populated for
          // every particle. This keeps streak population independent from Noise/Size module random slots.
          vec3 birthState = attr.a_ShapePositionStartLifeTime.xyz
              + attr.a_DirectionTime.xyz * vec3(0.73, 1.37, 1.91)
              + vec3(attr.a_StartSize.x, attr.a_StartSpeed, attr.a_DirectionTime.w) * vec3(2.17, 0.61, 0.13);
          birthState = fract(birthState * vec3(0.1031, 0.1030, 0.0973));
          birthState += dot(birthState, birthState.yzx + 33.33);
          return fract((birthState.x + birthState.y) * birthState.z);
      }


      ParticleVaryings vert(Attributes attr) {
          ParticleVaryings v;
          float age = renderer_CurrentTime - attr.a_DirectionTime.w;
          float normalizedAge = age / attr.a_ShapePositionStartLifeTime.w;
          vec4 clipPosition;
          if (normalizedAge >= 0.0 && normalizedAge < 1.0) {
              vec3 particleCenter;
              vec3 visualVelocityWS;
              computeSnowParticleStateWS(attr, age, normalizedAge, particleCenter, visualVelocityWS);
              vec2 particleSize;
              vec3 authoredVertexPosition = computeSnowAuthoredVertexWS(
                  attr,
                  age,
                  normalizedAge,
                  particleCenter,
                  particleSize
              );
              vec4 authoredClipPosition = camera_VPMat * vec4(authoredVertexPosition, 1.0);
              vec4 centerClipPosition = camera_VPMat * vec4(particleCenter, 1.0);
              clipPosition = centerClipPosition;

              vec2 viewportSize = max(camera_ViewportSize, vec2(1.0));
              float safeCenterW = max(abs(centerClipPosition.w), 1e-5);
              vec2 centerNdc = centerClipPosition.xy / safeCenterW;
              vec2 authoredNdc = authoredClipPosition.xy / max(abs(authoredClipPosition.w), 1e-5);
              vec2 authoredDeltaPixels = (authoredNdc - centerNdc) * 0.5 * viewportSize;

              float visualSpeed = length(visualVelocityWS);
              vec2 velocityAxisPixels = vec2(0.0, 1.0);
              float projectedSpeedPixelsPerSecond = 0.0;
              if (visualSpeed > 1e-5) {
                  // Differentiate the homogeneous projection once instead of projecting a second endpoint.
                  vec4 clipVelocityPerSecond = camera_VPMat * vec4(visualVelocityWS, 0.0);
                  vec2 velocityNdcPerSecond = (
                      clipVelocityPerSecond.xy * centerClipPosition.w
                      - centerClipPosition.xy * clipVelocityPerSecond.w
                  ) / (safeCenterW * safeCenterW);
                  vec2 velocityPixelsPerSecond = velocityNdcPerSecond * 0.5 * viewportSize;
                  projectedSpeedPixelsPerSecond = length(velocityPixelsPerSecond);
                  if (projectedSpeedPixelsPerSecond > 1e-4) {
                      velocityAxisPixels = velocityPixelsPerSecond / projectedSpeedPixelsPerSecond;
                  }
              }
              float pixelsPerWorld = abs(camera_ProjMat[1][1]) * viewportSize.y
                  / (2.0 * safeCenterW);
              float projectedFlakeDiameterPixels = max(particleSize.x, particleSize.y) * pixelsPerWorld;
              float visibleFlakeDiameterPixels = clamp(
                  projectedFlakeDiameterPixels,
                  material_FlakeMinDiameterPixels,
                  material_FlakeMaxRadiusPixels * 2.0
              );
              float speedResponse = smoothstep(
                  material_StreakStartSpeed,
                  material_StreakFullSpeed,
                  visualSpeed
              );
              float visualRandom = computeSnowParticleVisualRandom(attr);
              float roundPopulation = 1.0 - clamp(material_StreakPopulation, 0.0, 1.0);
              float populationResponse = smoothstep(
                  roundPopulation,
                  min(roundPopulation + 0.2, 1.0),
                  visualRandom
              );
              float particleResponse = speedResponse * populationResponse;
              float morphResponse = smoothstep(0.0, 0.25, particleResponse);
              float lengthRandom = fract(visualRandom * 3.17 + 0.41);
              float lengthVariation = mix(0.72, 1.18, lengthRandom);
              float motionTrailPixels = projectedSpeedPixelsPerSecond
                  * material_StreakExposureTime
                  * lengthVariation;
              float visibleLengthPixels = min(
                  visibleFlakeDiameterPixels + motionTrailPixels * particleResponse,
                  material_StreakMaxPixels
              );
              float visibleWidthPixels = mix(
                  visibleFlakeDiameterPixels,
                  max(material_FlakeMinDiameterPixels, visibleFlakeDiameterPixels * material_StreakWidthScale),
                  particleResponse
              );

              vec2 quadCorner = attr.a_CornerTextureCoordinate.xy + renderer_PivotOffset.xy;
              float authoredCornerLength = max(length(quadCorner), 1e-5);
              float authoredDeltaLength = length(authoredDeltaPixels);
              float authoredDiameterPixels = max(authoredDeltaLength / authoredCornerLength, 1e-4);
              vec2 authoredCornerDirection = quadCorner / authoredCornerLength;
              vec2 authoredDeltaDirection = authoredDeltaLength > 1e-5
                  ? authoredDeltaPixels / authoredDeltaLength
                  : authoredCornerDirection;
              float authoredAxisCos = dot(authoredCornerDirection, authoredDeltaDirection);
              float authoredAxisSin = authoredCornerDirection.x * authoredDeltaDirection.y
                  - authoredCornerDirection.y * authoredDeltaDirection.x;
              vec2 authoredWidthAxisPixels = vec2(authoredAxisCos, authoredAxisSin);

              // A streak is an unoriented strip, so choose the equivalent target basis that is at most
              // 90 degrees from the authored billboard. Keeping both bases right-handed prevents the
              // round-to-streak morph from crossing a zero-area (and then mirrored) quad.
              vec2 streakWidthAxisPixels = vec2(velocityAxisPixels.y, -velocityAxisPixels.x);
              float axisSign = dot(authoredWidthAxisPixels, streakWidthAxisPixels) < 0.0 ? -1.0 : 1.0;
              streakWidthAxisPixels *= axisSign;
              vec2 morphedWidthAxisPixels = normalize(
                  mix(authoredWidthAxisPixels, streakWidthAxisPixels, morphResponse)
              );
              vec2 morphedLengthAxisPixels = vec2(-morphedWidthAxisPixels.y, morphedWidthAxisPixels.x);
              float morphedWidthPixels = mix(authoredDiameterPixels, visibleWidthPixels, morphResponse);
              float morphedLengthPixels = mix(authoredDiameterPixels, visibleLengthPixels, morphResponse);
              vec2 vertexDeltaPixels = morphedWidthAxisPixels * (quadCorner.x * morphedWidthPixels)
                  + morphedLengthAxisPixels * (quadCorner.y * morphedLengthPixels);
              vec2 vertexNdc = centerNdc + vertexDeltaPixels * 2.0 / viewportSize;
              clipPosition.xy = vertexNdc * clipPosition.w;

              // The UV integral scales by the determinant of the actual screen-space basis. Compensate
              // that area directly; screen-size clamping may intentionally reduce brightness, but can
              // never make a transitioning particle brighter than its authored billboard.
              float morphedAreaPixels = morphedWidthPixels * morphedLengthPixels;
              v.v_VisualAlphaScale = min(
                  1.0,
                  (authoredDiameterPixels * authoredDiameterPixels) / max(morphedAreaPixels, 1e-4)
              );
              float distantSizeFade = smoothstep(
                  material_ParticleMinPixels,
                  material_ParticleMinPixels + material_ParticleFadeRangePixels,
                  projectedFlakeDiameterPixels
              );
              v.v_ScreenSizeFade = mix(1.0, distantSizeFade, speedResponse);
              gl_Position = clipPosition;
              v.v_Color = computeParticleColor(attr, attr.a_StartColor, normalizedAge);
              #ifdef MATERIAL_HAS_BASETEXTURE
                  v.v_TextureCoordinate = computeParticleVaryingUV(attr, normalizedAge);
              #endif
              #ifdef RENDERER_MODE_MESH
                  #ifdef RENDERER_ENABLE_VERTEXCOLOR
                      v.v_MeshColor = attr.COLOR_0;
                  #else
                      v.v_MeshColor = vec4(1.0);
                  #endif
              #endif
          } else {
              gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
              clipPosition = gl_Position;
              v.v_Color = vec4(0.0);
              v.v_VisualAlphaScale = 0.0;
              v.v_ScreenSizeFade = 0.0;
              #ifdef MATERIAL_HAS_BASETEXTURE
                  v.v_TextureCoordinate = vec2(0.0);
              #endif
              #ifdef RENDERER_MODE_MESH
                  v.v_MeshColor = vec4(0.0);
              #endif
          }
          v.v_ParticleEyeDepth = clipPosition.w;
          #ifdef MATERIAL_SNOW_SOFT_DEPTH
              v.v_ScreenPosition = vec4(
                  clipPosition.x * 0.5 + clipPosition.w * 0.5,
                  clipPosition.y * camera_ProjectionParams.x * 0.5 + clipPosition.w * 0.5,
                  clipPosition.z,
                  clipPosition.w
              );
          #endif
          return v;
      }

      void frag(ParticleVaryings v) {
          float opacity = texture2D(material_Opacity, v.v_TextureCoordinate).r * material_OpacityIntensity;
          opacity *= v.v_Color.a * v.v_VisualAlphaScale * v.v_ScreenSizeFade;
          if (opacity <= 0.00392156863) discard;
          float particleEyeDepth = max(v.v_ParticleEyeDepth, 0.0);
          float cameraFade = material_CameraDepthFadeDistance > 0.0
              ? smoothstep(
                  material_CameraDepthFadeOffset,
                  material_CameraDepthFadeOffset + material_CameraDepthFadeDistance,
                  particleEyeDepth
              )
              : 1.0;
          opacity *= cameraFade;
          if (opacity <= 0.00392156863) discard;
          #ifdef MATERIAL_SNOW_SOFT_DEPTH
              if (material_GeometryDepthFadeDistance > 0.0) {
                  vec2 screenUV = v.v_ScreenPosition.xy / max(v.v_ScreenPosition.w, 1e-5);
                  float sceneEyeDepth = remapDepthBufferEyeDepth(texture2D(camera_DepthTexture, screenUV).r);
                  opacity *= smoothstep(
                      0.0,
                      material_GeometryDepthFadeDistance,
                      sceneEyeDepth - particleEyeDepth
                  );
              }
          #endif
          vec3 emissive = material_EmissiveColor.rgb * v.v_Color.rgb * (material_EmissiveIntensity * material_EmissiveIntensity);
          vec4 galacean_FragOutput = vec4(emissive * opacity, opacity);
          gl_FragColor = galacean_FragOutput;
      }
    }
  }
}
