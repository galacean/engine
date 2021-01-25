#ifdef O3_HAS_SKIN

        #ifdef O3_USE_JOINT_TEXTURE
            mat4 skinMatrix =
                WEIGHTS_0.x * getJointMatrix(u_jointSampler, JOINTS_0.x ) +
                WEIGHTS_0.y * getJointMatrix(u_jointSampler, JOINTS_0.y ) +
                WEIGHTS_0.z * getJointMatrix(u_jointSampler, JOINTS_0.z ) +
                WEIGHTS_0.w * getJointMatrix(u_jointSampler, JOINTS_0.w );

        #else
            mat4 skinMatrix =
                WEIGHTS_0.x * u_jointMatrix[ int( JOINTS_0.x ) ] +
                WEIGHTS_0.y * u_jointMatrix[ int( JOINTS_0.y ) ] +
                WEIGHTS_0.z * u_jointMatrix[ int( JOINTS_0.z ) ] +
                WEIGHTS_0.w * u_jointMatrix[ int( JOINTS_0.w ) ];
        #endif

        position = skinMatrix * position;

        #ifdef O3_HAS_NORMAL
            normal = vec4( skinMatrix * vec4( normal, 0.0 ) ).xyz;
            #if defined( O3_HAS_TANGENT ) && defined( O3_HAS_NORMALMAP )
                tangent.xyz = vec4( skinMatrix * vec4( tangent.xyz, 0.0 ) ).xyz;
            #endif

        #endif

#endif
