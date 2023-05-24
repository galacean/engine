attribute vec3 POSITION;

#ifdef RENDERER_HAS_UV
    attribute vec2 TEXCOORD_0;
#endif

#ifdef RENDERER_HAS_UV1
    attribute vec2 TEXCOORD_1;
#endif

#ifdef RENDERER_HAS_SKIN
    attribute vec4 JOINTS_0;
    attribute vec4 WEIGHTS_0;

    #ifdef RENDERER_USE_JOINT_TEXTURE
        uniform sampler2D renderer_JointSampler;
        uniform float renderer_JointCount;

        mat4 getJointMatrix(sampler2D smp, float index)
        {
            float base = index / renderer_JointCount;
            float hf = 0.5 / renderer_JointCount;
            float v = base + hf;

            vec4 m0 = texture2D(smp, vec2(0.125, v ));
            vec4 m1 = texture2D(smp, vec2(0.375, v ));
            vec4 m2 = texture2D(smp, vec2(0.625, v ));
            vec4 m3 = texture2D(smp, vec2(0.875, v ));

            return mat4(m0, m1, m2, m3);

        }

    #else
        uniform mat4 renderer_JointMatrix[ RENDERER_JOINTS_NUM ];
    #endif
#endif

#ifdef RENDERER_ENABLE_VERTEXCOLOR
    attribute vec4 COLOR_0;
#endif


#include <transform_declare>
#include <camera_declare>

uniform vec4 material_TilingOffset;


#ifndef MATERIAL_OMIT_NORMAL
    #ifdef RENDERER_HAS_NORMAL
        attribute vec3 NORMAL;
    #endif

    #ifdef RENDERER_HAS_TANGENT
        attribute vec4 TANGENT;
    #endif
#endif