#ifndef SKIN_INCLUDED
#define SKIN_INCLUDED


#ifdef RENDERER_HAS_SKIN
    #ifdef RENDERER_USE_JOINT_TEXTURE
        sampler2D renderer_JointSampler;
        float renderer_JointCount;

        mat4 getJointMatrix(sampler2D smp, float index){
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
        mat4 renderer_JointMatrix[ RENDERER_JOINTS_NUM ];
    #endif

    mat4 getSkinMatrix(Attributes attributes){
        #ifdef RENDERER_USE_JOINT_TEXTURE
            mat4 skinMatrix =
                attributes.WEIGHTS_0.x * getJointMatrix(renderer_JointSampler, attributes.JOINTS_0.x ) +
                attributes.WEIGHTS_0.y * getJointMatrix(renderer_JointSampler, attributes.JOINTS_0.y ) +
                attributes.WEIGHTS_0.z * getJointMatrix(renderer_JointSampler, attributes.JOINTS_0.z ) +
                attributes.WEIGHTS_0.w * getJointMatrix(renderer_JointSampler, attributes.JOINTS_0.w );
        #else
            mat4 skinMatrix =
                attributes.WEIGHTS_0.x * renderer_JointMatrix[ int( attributes.JOINTS_0.x ) ] +
                attributes.WEIGHTS_0.y * renderer_JointMatrix[ int( attributes.JOINTS_0.y ) ] +
                attributes.WEIGHTS_0.z * renderer_JointMatrix[ int( attributes.JOINTS_0.z ) ] +
                attributes.WEIGHTS_0.w * renderer_JointMatrix[ int( attributes.JOINTS_0.w ) ];
        #endif

        return skinMatrix;
    }

#endif


#endif