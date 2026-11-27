    Pass "Outline" {
      Tags { pipelineStage = "Forward" }
      RasterState = { CullMode = CullMode.Front; }
      VertexShader = outlineVertex;
      FragmentShader = outlineFragment;
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Common/Attributes.glsl"
      #include "ShaderLibrary/Common/Fog.glsl"
      #include "ShaderLibrary/Skin/Skin.glsl"
      #include "ShaderLibrary/Skin/BlendShape.glsl"
      float animal_OutlineWidth;
      vec3 animal_OutlineColor;
      #ifdef ANIMAL_OUTLINE_FADE
        float animal_OutlineFadeStart;
        float animal_OutlineFadeEnd;
      #endif
      struct OutlineVaryings {
        #if SCENE_FOG_MODE != 0
          vec3 positionVS;
        #endif
      };
      OutlineVaryings outlineVertex(Attributes attributes) {
        OutlineVaryings v;
        vec4 position = vec4(attributes.POSITION, 1.0);
        #ifdef RENDERER_HAS_NORMAL
          vec3 normal = attributes.NORMAL;
          #ifdef RENDERER_HAS_TANGENT
            vec4 tangent = attributes.TANGENT;
          #endif
        #endif
        #ifdef RENDERER_HAS_BLENDSHAPE
          calculateBlendShape(attributes, position
            #ifdef RENDERER_HAS_NORMAL
              , normal
              #ifdef RENDERER_HAS_TANGENT
                , tangent
              #endif
            #endif
          );
        #endif
        #ifdef RENDERER_HAS_SKIN
          mat4 skinMatrix = getSkinMatrix(attributes);
          position = skinMatrix * position;
          #ifdef RENDERER_HAS_NORMAL
            mat3 skinMat3 = mat3(skinMatrix);
            float skinDet = determinant(skinMat3);
            normal = abs(skinDet) > 1e-6 ? normal * INVERSE_MAT(skinMat3) : skinMat3 * normal;
          #endif
        #endif
        vec4 world = renderer_ModelMat * position;
        #ifdef RENDERER_HAS_NORMAL
          float outlineWidth = animal_OutlineWidth;
          #ifdef ANIMAL_OUTLINE_FADE
            float cameraDistance = distance(camera_Position, world.xyz);
            outlineWidth *= 1.0 - smoothstep(animal_OutlineFadeStart, animal_OutlineFadeEnd, cameraDistance);
          #endif
          world.xyz += safeNormalize(mat3(renderer_NormalMat) * normal) * outlineWidth;
        #endif
        gl_Position = camera_VPMat * world;
        #if SCENE_FOG_MODE != 0
          v.positionVS = (camera_ViewMat * world).xyz;
        #endif
        return v;
      }
      void outlineFragment(OutlineVaryings v) {
        vec4 color = vec4(animal_OutlineColor, 1.0);
        #if SCENE_FOG_MODE != 0
          color = fog(color, v.positionVS);
        #endif
        gl_FragColor = color;
      }
    }
