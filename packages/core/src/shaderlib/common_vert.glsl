attribute vec3 POSITION;

#ifdef GALACEAN_HAS_UV
    attribute vec2 TEXCOORD_0;
#endif

#ifdef GALACEAN_HAS_UV1
    attribute vec2 TEXCOORD_1;
#endif

#ifdef O3_HAS_SKIN
    attribute vec4 JOINTS_0;
    attribute vec4 WEIGHTS_0;

    #ifdef O3_USE_JOINT_TEXTURE
        uniform sampler2D galacean_JointSampler;
        uniform float galacean_JointCount;

        mat4 getJointMatrix(sampler2D smp, float index)
        {
            float base = index / galacean_JointCount;
            float hf = 0.5 / galacean_JointCount;
            float v = base + hf;

            vec4 m0 = texture2D(smp, vec2(0.125, v ));
            vec4 m1 = texture2D(smp, vec2(0.375, v ));
            vec4 m2 = texture2D(smp, vec2(0.625, v ));
            vec4 m3 = texture2D(smp, vec2(0.875, v ));

            return mat4(m0, m1, m2, m3);

        }

    #else
        uniform mat4 galacean_JointMatrix[ O3_JOINTS_NUM ];
    #endif
#endif

#ifdef GALACEAN_HAS_VERTEXCOLOR
    attribute vec4 COLOR_0;
#endif


#include <transform_declare>
#include <camera_declare>

uniform vec4 u_tilingOffset;


#ifndef OMIT_NORMAL
    #ifdef GALACEAN_HAS_NORMAL
        attribute vec3 NORMAL;
    #endif

    #ifdef GALACEAN_HAS_TANGENT
        attribute vec4 TANGENT;
    #endif
#endif