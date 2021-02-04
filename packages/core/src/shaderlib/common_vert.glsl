attribute vec3 POSITION;

#ifdef O3_HAS_UV
    attribute vec2 TEXCOORD_0;
#endif

#ifdef O3_HAS_SKIN
    attribute vec4 JOINTS_0;
    attribute vec4 WEIGHTS_0;

    #ifdef O3_USE_JOINT_TEXTURE
        uniform sampler2D u_jointSampler;
        uniform float u_jointCount;

        mat4 getJointMatrix(sampler2D smp, float index)
        {
            float base = index / u_jointCount;
            float hf = 0.5 / u_jointCount;
            float v = base + hf;

            vec4 m0 = texture2D(smp, vec2(0.125, v ));
            vec4 m1 = texture2D(smp, vec2(0.375, v ));
            vec4 m2 = texture2D(smp, vec2(0.625, v ));
            vec4 m3 = texture2D(smp, vec2(0.875, v ));

            return mat4(m0, m1, m2, m3);

        }

    #else
        uniform mat4 u_jointMatrix[ O3_JOINTS_NUM ];
    #endif
#endif

#ifdef O3_HAS_VERTEXCOLOR
    attribute vec4 COLOR_0;
#endif

uniform mat4 u_localMat;
uniform mat4 u_modelMat;
uniform mat4 u_viewMat;
uniform mat4 u_projMat;
uniform mat4 u_MVMat;
uniform mat4 u_MVPMat;
uniform mat4 u_normalMat;
uniform vec3 u_cameraPos;

#ifndef OMIT_NORMAL
    #ifdef O3_HAS_NORMAL
        attribute vec3 NORMAL;
    #endif

    #ifdef O3_HAS_TANGENT
        attribute vec4 TANGENT;
    #endif
#endif