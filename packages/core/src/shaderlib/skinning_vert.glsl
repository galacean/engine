#ifdef O3_HAS_SKIN

        #ifdef O3_USE_JOINT_TEXTURE
            mat4 skinMatrix =
                WEIGHTS_0.x * getJointMatrix(galacean_JointSampler, JOINTS_0.x ) +
                WEIGHTS_0.y * getJointMatrix(galacean_JointSampler, JOINTS_0.y ) +
                WEIGHTS_0.z * getJointMatrix(galacean_JointSampler, JOINTS_0.z ) +
                WEIGHTS_0.w * getJointMatrix(galacean_JointSampler, JOINTS_0.w );

        #else
            mat4 skinMatrix =
                WEIGHTS_0.x * galacean_JointMatrix[ int( JOINTS_0.x ) ] +
                WEIGHTS_0.y * galacean_JointMatrix[ int( JOINTS_0.y ) ] +
                WEIGHTS_0.z * galacean_JointMatrix[ int( JOINTS_0.z ) ] +
                WEIGHTS_0.w * galacean_JointMatrix[ int( JOINTS_0.w ) ];
        #endif

        position = skinMatrix * position;

        #if defined(GALACEAN_HAS_NORMAL) && !defined(OMIT_NORMAL)
            mat3 skinNormalMatrix = INVERSE_MAT(mat3(skinMatrix));
            normal = normal * skinNormalMatrix;
            #if defined(GALACEAN_HAS_TANGENT) && ( defined(NORMALTEXTURE) || defined(HAS_CLEARCOATNORMALTEXTURE) )
                tangent.xyz = tangent.xyz * skinNormalMatrix;
            #endif

        #endif

#endif
