#ifdef RENDERER_HAS_SKIN

        #ifdef RENDERER_USE_JOINT_TEXTURE
            mat4 skinMatrix =
                attr.WEIGHTS_0.x * getJointMatrix(renderer_JointSampler, attr.JOINTS_0.x ) +
                attr.WEIGHTS_0.y * getJointMatrix(renderer_JointSampler, attr.JOINTS_0.y ) +
                attr.WEIGHTS_0.z * getJointMatrix(renderer_JointSampler, attr.JOINTS_0.z ) +
                attr.WEIGHTS_0.w * getJointMatrix(renderer_JointSampler, attr.JOINTS_0.w );

        #else
            mat4 skinMatrix =
                attr.WEIGHTS_0.x * renderer_JointMatrix[ int( attr.JOINTS_0.x ) ] +
                attr.WEIGHTS_0.y * renderer_JointMatrix[ int( attr.JOINTS_0.y ) ] +
                attr.WEIGHTS_0.z * renderer_JointMatrix[ int( attr.JOINTS_0.z ) ] +
                attr.WEIGHTS_0.w * renderer_JointMatrix[ int( attr.JOINTS_0.w ) ];
        #endif

        position = skinMatrix * position;

        #if defined(RENDERER_HAS_NORMAL) && !defined(MATERIAL_OMIT_NORMAL)
            mat3 skinNormalMatrix = INVERSE_MAT(mat3(skinMatrix));
            normal = normal * skinNormalMatrix;
            #if defined(RENDERER_HAS_TANGENT) && ( defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE) )
                tangent.xyz = tangent.xyz * skinNormalMatrix;
            #endif

        #endif

#endif
