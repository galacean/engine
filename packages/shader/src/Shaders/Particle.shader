Shader "Particle" {
  Editor {
    Properties {
      Header("Base") {
        material_BaseColor("BaseColor", Color) = (1, 1, 1, 1);
        material_BaseTexture("BaseTexture", Texture2D);
      }
      Header("Emissive") {
        material_EmissiveColor("EmissiveColor", HDRColor) = (0, 0, 0, 1);
        material_EmissiveTexture("EmissiveTexture", Texture2D);
      }
      Header("Common") {
        isTransparent("Transparent", Boolean) = false;
        renderFace("Render Face", Enum(Front:0, Back:1, Double:2)) = 0;
        blendMode("Blend Mode", Enum(Normal:0, Additive:1)) = 0;
        material_AlphaCutoff("AlphaCutoff", Range(0, 1, 0.01)) = 0;
      }
    }
  }

  SubShader "Default" {
    Pass "Forward Pass" {
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

      VertexShader = vert;
      FragmentShader = frag;

      // Function-based includes
      #include "Common/Common.glsl"
      #include "Particle/ParticleCommon.glsl"
      #include "Particle/Module/VelocityOverLifetime.glsl"
      #include "Particle/Module/ForceOverLifetime.glsl"
      #include "Particle/Module/ColorOverLifetime.glsl"
      #include "Particle/Module/SizeOverLifetime.glsl"
      #include "Particle/Module/RotationOverLifetime.glsl"
      #include "Particle/Module/TextureSheetAnimation.glsl"
      #include "Particle/Module/LimitVelocityOverLifetime.glsl"

      // Uniforms
      float renderer_CurrentTime;
      vec3 renderer_Gravity;
      vec3 renderer_WorldPosition;
      vec4 renderer_WorldRotation;
      bool renderer_ThreeDStartRotation;
      int renderer_ScalingMode;
      vec3 renderer_PositionScale;
      vec3 renderer_SizeScale;
      vec3 renderer_PivotOffset;

      mat4 camera_ViewMat;
      mat4 camera_ProjMat;

      #ifdef RENDERER_MODE_STRETCHED_BILLBOARD
          vec3 camera_Position;
      #endif
      vec3 camera_Forward;
      vec3 camera_Up;

      float renderer_StretchedBillboardLengthScale;
      float renderer_StretchedBillboardSpeedScale;
      int renderer_SimulationSpace;

      vec4 material_BaseColor;
      mediump vec3 material_EmissiveColor;

      #ifdef MATERIAL_HAS_BASETEXTURE
          sampler2D material_BaseTexture;
      #endif
      #ifdef MATERIAL_HAS_EMISSIVETEXTURE
          sampler2D material_EmissiveTexture;
      #endif

      struct Attributes {
          #if defined(RENDERER_MODE_SPHERE_BILLBOARD) || defined(RENDERER_MODE_STRETCHED_BILLBOARD) || defined(RENDERER_MODE_HORIZONTAL_BILLBOARD) || defined(RENDERER_MODE_VERTICAL_BILLBOARD)
              vec4 a_CornerTextureCoordinate;
          #endif

          #ifdef RENDERER_MODE_MESH
              vec3 POSITION;
              #ifdef RENDERER_ENABLE_VERTEXCOLOR
                  vec4 COLOR_0;
              #endif
              vec2 TEXCOORD_0;
          #endif

          vec4 a_ShapePositionStartLifeTime;
          vec4 a_DirectionTime;
          vec4 a_StartColor;
          vec3 a_StartSize;
          vec3 a_StartRotation0;
          float a_StartSpeed;
          vec4 a_Random0;

          #if defined(RENDERER_TSA_FRAME_RANDOM_CURVES) || defined(RENDERER_VOL_IS_RANDOM_TWO)
              vec4 a_Random1;
          #endif

          #if defined(RENDERER_FOL_CONSTANT_MODE) || defined(RENDERER_FOL_CURVE_MODE) || defined(RENDERER_LVL_MODULE_ENABLED)
              vec4 a_Random2;
          #endif

          vec3 a_SimulationWorldPosition;
          vec4 a_SimulationWorldRotation;

          #ifdef RENDERER_TRANSFORM_FEEDBACK
              vec3 a_FeedbackPosition;
              vec3 a_FeedbackVelocity;
          #endif

          #ifdef MATERIAL_HAS_BASETEXTURE
              vec4 a_SimulationUV;
          #endif
      };

      struct Varyings {
          vec4 v_Color;
          #ifdef MATERIAL_HAS_BASETEXTURE
              vec2 v_TextureCoordinate;
          #endif
          #ifdef RENDERER_MODE_MESH
              vec4 v_MeshColor;
          #endif
      };


      vec3 computeParticlePosition(in vec3 startVelocity, in float age, in float normalizedAge, vec3 gravityVelocity, vec4 worldRotation, inout vec3 localVelocity, inout vec3 worldVelocity) {
          vec3 startPosition = startVelocity * age;
          vec3 finalPosition;
          vec3 localPositionOffset = startPosition;
          vec3 worldPositionOffset;

          #ifdef _VOL_MODULE_ENABLED
              vec3 lifeVelocity;
              vec3 velocityPositionOffset = computeVelocityPositionOffset(normalizedAge, age, lifeVelocity);
              if (renderer_VOLSpace == 0) {
                  localVelocity += lifeVelocity;
                  localPositionOffset += velocityPositionOffset;
              } else {
                  worldVelocity += lifeVelocity;
                  worldPositionOffset += velocityPositionOffset;
              }
          #endif

          #ifdef _FOL_MODULE_ENABLED
              vec3 forceVelocity;
              vec3 forcePositionOffset = computeForcePositionOffset(normalizedAge, age, forceVelocity);
              if (renderer_FOLSpace == 0) {
                  localVelocity += forceVelocity;
                  localPositionOffset += forcePositionOffset;
              } else {
                  worldVelocity += forceVelocity;
                  worldPositionOffset += forcePositionOffset;
              }
          #endif

          finalPosition = rotationByQuaternions(a_ShapePositionStartLifeTime.xyz + localPositionOffset, worldRotation) + worldPositionOffset;

          if (renderer_SimulationSpace == 0) {
              finalPosition = finalPosition + renderer_WorldPosition;
          } else if (renderer_SimulationSpace == 1) {
              finalPosition = finalPosition + a_SimulationWorldPosition;
          }

          finalPosition += 0.5 * gravityVelocity * age;

          return finalPosition;
      }


      Varyings vert(Attributes attr) {
          Varyings v;

          float age = renderer_CurrentTime - a_DirectionTime.w;
          float normalizedAge = age / a_ShapePositionStartLifeTime.w;

          if (normalizedAge >= 0.0 && normalizedAge < 1.0) {
              vec4 worldRotation;
              if (renderer_SimulationSpace == 0) {
                  worldRotation = renderer_WorldRotation;
              } else {
                  worldRotation = a_SimulationWorldRotation;
              }

              vec3 localVelocity;
              vec3 worldVelocity;

              #ifdef RENDERER_TRANSFORM_FEEDBACK
                  vec3 center;
                  if (renderer_SimulationSpace == 0) {
                      center = rotationByQuaternions(a_FeedbackPosition, worldRotation) + renderer_WorldPosition;
                  } else if (renderer_SimulationSpace == 1) {
                      center = a_FeedbackPosition;
                  }
                  localVelocity = a_FeedbackVelocity;
                  worldVelocity = vec3(0.0);

                  #ifdef _VOL_MODULE_ENABLED
                      vec3 instantVOLVelocity;
                      computeVelocityPositionOffset(normalizedAge, age, instantVOLVelocity);
                      if (renderer_VOLSpace == 0) {
                          localVelocity += instantVOLVelocity;
                      } else {
                          worldVelocity += instantVOLVelocity;
                      }
                  #endif
              #else
                  vec3 startVelocity = a_DirectionTime.xyz * a_StartSpeed;
                  vec3 gravityVelocity = renderer_Gravity * a_Random0.x * age;
                  localVelocity = startVelocity;
                  worldVelocity = gravityVelocity;
                  vec3 center = computeParticlePosition(startVelocity, age, normalizedAge, gravityVelocity, worldRotation, localVelocity, worldVelocity);
              #endif

              // Billboard / Mesh mode positioning
              #ifdef RENDERER_MODE_SPHERE_BILLBOARD
                  vec2 corner = a_CornerTextureCoordinate.xy + renderer_PivotOffset.xy;
                  vec3 sideVector = normalize(cross(camera_Forward, camera_Up));
                  vec3 upVector = normalize(cross(sideVector, camera_Forward));
                  corner *= computeParticleSizeBillboard(a_StartSize.xy, normalizedAge);
                  #if defined(RENDERER_ROL_CONSTANT_MODE) || defined(RENDERER_ROL_CURVE_MODE)
                      if (renderer_ThreeDStartRotation) {
                          vec3 rotation = radians(vec3(a_StartRotation0.xy, computeParticleRotationFloat(a_StartRotation0.z, age, normalizedAge)));
                          center += renderer_SizeScale.xzy * rotationByEuler(corner.x * sideVector + corner.y * upVector, rotation);
                      } else {
                          float rot = radians(computeParticleRotationFloat(a_StartRotation0.x, age, normalizedAge));
                          float c = cos(rot);
                          float s = sin(rot);
                          mat2 rotation = mat2(c, -s, s, c);
                          corner = rotation * corner;
                          center += renderer_SizeScale.xzy * (corner.x * sideVector + corner.y * upVector);
                      }
                  #else
                      if (renderer_ThreeDStartRotation) {
                          center += renderer_SizeScale.xzy * rotationByEuler(corner.x * sideVector + corner.y * upVector, radians(a_StartRotation0));
                      } else {
                          float c = cos(radians(a_StartRotation0.x));
                          float s = sin(radians(a_StartRotation0.x));
                          mat2 rotation = mat2(c, -s, s, c);
                          corner = rotation * corner;
                          center += renderer_SizeScale.xzy * (corner.x * sideVector + corner.y * upVector);
                      }
                  #endif
              #endif

              #ifdef RENDERER_MODE_STRETCHED_BILLBOARD
                  vec2 corner = a_CornerTextureCoordinate.xy + renderer_PivotOffset.xy;
                  vec3 velocity = rotationByQuaternions(renderer_SizeScale * localVelocity, worldRotation) + worldVelocity;
                  vec3 cameraUpVector = normalize(velocity);
                  vec3 direction = normalize(center - camera_Position);
                  vec3 sideVector = normalize(cross(direction, normalize(velocity)));

                  sideVector = renderer_SizeScale.xzy * sideVector;
                  cameraUpVector = length(vec3(renderer_SizeScale.x, 0.0, 0.0)) * cameraUpVector;

                  vec2 size = computeParticleSizeBillboard(a_StartSize.xy, normalizedAge);

                  const mat2 rotationZHalfPI = mat2(0.0, -1.0, 1.0, 0.0);
                  corner = rotationZHalfPI * corner;
                  corner.y = corner.y - abs(corner.y);

                  float speed = length(velocity);
                  center += sign(renderer_SizeScale.x) * (sign(renderer_StretchedBillboardLengthScale) * size.x * corner.x * sideVector
                          + (speed * renderer_StretchedBillboardSpeedScale + size.y * renderer_StretchedBillboardLengthScale) * corner.y * cameraUpVector);
              #endif

              #ifdef RENDERER_MODE_HORIZONTAL_BILLBOARD
                  vec2 corner = a_CornerTextureCoordinate.xy + renderer_PivotOffset.xy;
                  const vec3 sideVector = vec3(1.0, 0.0, 0.0);
                  const vec3 upVector = vec3(0.0, 0.0, -1.0);
                  corner *= computeParticleSizeBillboard(a_StartSize.xy, normalizedAge);

                  float rot;
                  if (renderer_ThreeDStartRotation) {
                      rot = radians(computeParticleRotationFloat(a_StartRotation0.z, age, normalizedAge));
                  } else {
                      rot = radians(computeParticleRotationFloat(a_StartRotation0.x, age, normalizedAge));
                  }

                  float c = cos(rot);
                  float s = sin(rot);
                  mat2 rotation = mat2(c, -s, s, c);
                  corner = rotation * corner;
                  center += renderer_SizeScale.xzy * (corner.x * sideVector + corner.y * upVector);
              #endif

              #ifdef RENDERER_MODE_VERTICAL_BILLBOARD
                  vec2 corner = a_CornerTextureCoordinate.xy + renderer_PivotOffset.xy;
                  const vec3 cameraUpVector = vec3(0.0, 1.0, 0.0);
                  vec3 sideVector = normalize(cross(camera_Forward, cameraUpVector));

                  float rot = radians(computeParticleRotationFloat(a_StartRotation0.x, age, normalizedAge));
                  float c = cos(rot);
                  float s = sin(rot);
                  mat2 rotation = mat2(c, -s, s, c);
                  corner = rotation * corner * cos(0.78539816339744830961566084581988);
                  corner *= computeParticleSizeBillboard(a_StartSize.xy, normalizedAge);
                  center += renderer_SizeScale.xzy * (corner.x * sideVector + corner.y * cameraUpVector);
              #endif

              #ifdef RENDERER_MODE_MESH
                  #if defined(RENDERER_ROL_CONSTANT_MODE) || defined(RENDERER_ROL_CURVE_MODE)
                      #define RENDERER_ROL_ENABLED
                  #endif

                  vec3 size = computeParticleSizeMesh(a_StartSize, normalizedAge);

                  bool is3DRotation = renderer_ThreeDStartRotation;
                  #if defined(RENDERER_ROL_ENABLED) && defined(RENDERER_ROL_IS_SEPARATE)
                      is3DRotation = true;
                  #endif

                  if (is3DRotation) {
                      #ifdef RENDERER_ROL_ENABLED
                          vec3 startRotation = renderer_ThreeDStartRotation ? a_StartRotation0 : vec3(0.0, 0.0, a_StartRotation0.x);
                          vec3 rotation = radians(computeParticleRotationVec3(startRotation, age, normalizedAge));
                      #else
                          vec3 rotation = radians(a_StartRotation0);
                      #endif
                      center += rotationByQuaternions(renderer_SizeScale * rotationByEuler(POSITION * size, rotation), worldRotation);
                  } else {
                      #ifdef RENDERER_ROL_ENABLED
                          float angle = radians(computeParticleRotationFloat(a_StartRotation0.x, age, normalizedAge));
                      #else
                          float angle = radians(a_StartRotation0.x);
                      #endif
                      #ifdef RENDERER_EMISSION_SHAPE
                          vec3 axis = vec3(a_ShapePositionStartLifeTime.xy, 0.0);
                          if (renderer_SimulationSpace == 1) {
                              axis = rotationByQuaternions(axis, worldRotation);
                          }
                          vec3 crossResult = cross(axis, vec3(0.0, 0.0, -1.0));
                          float crossLen = length(crossResult);
                          vec3 rotateAxis = crossLen > 0.0001 ? crossResult / crossLen : vec3(0.0, 1.0, 0.0);
                      #else
                          vec3 rotateAxis = vec3(0.0, 0.0, -1.0);
                      #endif
                      center += rotationByQuaternions(renderer_SizeScale * rotationByAxis(POSITION * size, rotateAxis, angle), worldRotation);
                  }
                  #ifdef RENDERER_ENABLE_VERTEXCOLOR
                      v.v_MeshColor = COLOR_0;
                  #endif
              #endif

              gl_Position = camera_ProjMat * camera_ViewMat * vec4(center, 1.0);
              v.v_Color = computeParticleColor(a_StartColor, normalizedAge);

              #ifdef MATERIAL_HAS_BASETEXTURE
                  vec2 simulateUV;
                  #if defined(RENDERER_MODE_SPHERE_BILLBOARD) || defined(RENDERER_MODE_STRETCHED_BILLBOARD) || defined(RENDERER_MODE_HORIZONTAL_BILLBOARD) || defined(RENDERER_MODE_VERTICAL_BILLBOARD)
                      simulateUV = a_CornerTextureCoordinate.zw * a_SimulationUV.xy + a_SimulationUV.zw;
                      v.v_TextureCoordinate = computeParticleUV(simulateUV, normalizedAge);
                  #endif
                  #ifdef RENDERER_MODE_MESH
                      simulateUV = a_SimulationUV.zw + TEXCOORD_0 * a_SimulationUV.xy;
                      v.v_TextureCoordinate = computeParticleUV(simulateUV, normalizedAge);
                  #endif
              #endif
          } else {
              gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          }

          return v;
      }


      void frag(Varyings v) {
          vec4 color = material_BaseColor * v.v_Color;

          #if defined(RENDERER_MODE_MESH) && defined(RENDERER_ENABLE_VERTEXCOLOR)
              color *= v.v_MeshColor;
          #endif

          #ifdef MATERIAL_HAS_BASETEXTURE
              color *= texture2DSRGB(material_BaseTexture, v.v_TextureCoordinate);
          #endif

          // Emissive
          vec3 emissiveRadiance = material_EmissiveColor;
          #ifdef MATERIAL_HAS_EMISSIVETEXTURE
              emissiveRadiance *= texture2DSRGB(material_EmissiveTexture, v.v_TextureCoordinate).rgb;
          #endif

          color.rgb += emissiveRadiance;

          gl_FragColor = color;
      }
    }
  }
}
