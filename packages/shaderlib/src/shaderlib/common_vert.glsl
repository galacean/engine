attribute vec3 a_position;

#ifdef O3_HAS_UV

attribute vec2 a_uv;

#endif

#ifdef O3_HAS_NORMAL

attribute vec3 a_normal;

#endif

#ifdef O3_HAS_TANGENT

attribute vec4 a_tangent;

#endif

#ifdef O3_HAS_VERTEXCOLOR

attribute vec4 a_color;

#endif

#if defined( O3_HAS_SKIN ) && ( defined( O3_JOINTS_NUM ) || defined( O3_USE_JOINT_TEXTURE ) )
    attribute vec4 a_joint;
    attribute vec4 a_weight;

    #ifdef O3_USE_JOINT_TEXTURE
        uniform sampler2D u_jointSampler;
        uniform float u_jointCount;

        mat4 getJointMatrix(sampler2D smp, float index)
        {
            float offset = index  * 4.0;
            float dx = 1.0 / (u_jointCount * 4.0 ) ;

            vec4 m0 = texture2D(smp, vec2(dx * (offset + 0.5), 0.0));
            vec4 m1 = texture2D(smp, vec2(dx * (offset + 1.5), 0.0));
            vec4 m2 = texture2D(smp, vec2(dx * (offset + 2.5), 0.0));
            vec4 m3 = texture2D(smp, vec2(dx * (offset + 3.5), 0.0));

            return mat4(m0, m1, m2, m3);
        }

    #elif defined( O3_JOINTS_NUM )
        uniform mat4 u_jointMatrix[ O3_JOINTS_NUM ];
    #endif
#endif

uniform mat4 u_localMat;
uniform mat4 u_modelMat;
uniform mat4 u_viewMat;
uniform mat4 u_projMat;
uniform mat4 u_MVMat;
uniform mat4 u_MVPMat;
uniform mat3 u_normalMat;
uniform vec3 u_cameraPos;
uniform float u_time;
