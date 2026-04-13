Shader "Utility/DepthOnly" {
  SubShader "Default" {
    Pass "DepthOnly" {
      Tags { pipelineStage = "DepthOnly" }

      RenderQueueType = material_DepthOnlyRenderQueue;

      VertexShader = vert;
      FragmentShader = frag;

      #include "Common/Common.glsl"
      #include "Common/Transform.glsl"
      #include "Skin/Skin.glsl"
      #include "Skin/BlendShape.glsl"

      mat4 camera_VPMat;

      struct Attributes {
        vec3 POSITION;

        #ifdef RENDERER_HAS_BLENDSHAPE
          #ifndef RENDERER_BLENDSHAPE_USE_TEXTURE
            vec3 POSITION_BS0;
            vec3 POSITION_BS1;
            #if defined(RENDERER_BLENDSHAPE_HAS_NORMAL) && defined(RENDERER_BLENDSHAPE_HAS_TANGENT)
              vec3 NORMAL_BS0;
              vec3 NORMAL_BS1;
              vec3 TANGENT_BS0;
              vec3 TANGENT_BS1;
            #else
              #if defined(RENDERER_BLENDSHAPE_HAS_NORMAL) || defined(RENDERER_BLENDSHAPE_HAS_TANGENT)
                vec3 POSITION_BS2;
                vec3 POSITION_BS3;
                #ifdef RENDERER_BLENDSHAPE_HAS_NORMAL
                  vec3 NORMAL_BS0;
                  vec3 NORMAL_BS1;
                  vec3 NORMAL_BS2;
                  vec3 NORMAL_BS3;
                #endif
                #ifdef RENDERER_BLENDSHAPE_HAS_TANGENT
                  vec3 TANGENT_BS0;
                  vec3 TANGENT_BS1;
                  vec3 TANGENT_BS2;
                  vec3 TANGENT_BS3;
                #endif
              #else
                vec3 POSITION_BS2;
                vec3 POSITION_BS3;
                vec3 POSITION_BS4;
                vec3 POSITION_BS5;
                vec3 POSITION_BS6;
                vec3 POSITION_BS7;
              #endif
            #endif
          #endif
        #endif

        #ifdef RENDERER_HAS_SKIN
          vec4 JOINTS_0;
          vec4 WEIGHTS_0;
        #endif

        #ifdef RENDERER_HAS_NORMAL
          vec3 NORMAL;
        #endif

        #ifdef RENDERER_HAS_TANGENT
          vec4 TANGENT;
        #endif
      };

      struct Varyings {
        float _placeholder;
      };

      Varyings vert(Attributes attr) {
        Varyings v;

        vec4 position = vec4(attr.POSITION, 1.0);

        #ifdef RENDERER_HAS_NORMAL
          vec3 normal = vec3(attr.NORMAL);
          #ifdef RENDERER_HAS_TANGENT
            vec4 tangent = vec4(attr.TANGENT);
          #endif
        #endif

        #ifdef RENDERER_HAS_BLENDSHAPE
          calculateBlendShape(attr, position
            #ifdef RENDERER_HAS_NORMAL
              , normal
              #ifdef RENDERER_HAS_TANGENT
                , tangent
              #endif
            #endif
          );
        #endif

        #ifdef RENDERER_HAS_SKIN
          mat4 skinMatrix = getSkinMatrix(attr);
          position = skinMatrix * position;
        #endif

        gl_Position = camera_VPMat * renderer_ModelMat * position;

        return v;
      }

      void frag(Varyings v) {
      }
    }
  }
}
