#if defined( O3_HAS_SKIN ) && ( defined( O3_JOINTS_NUM ) || defined( O3_USE_JOINT_TEXTURE ) )

        #ifdef O3_USE_JOINT_TEXTURE
            mat4 skinMatrix =
                a_weight.x * getJointMatrix(u_jointSampler, a_joint.x ) +
                a_weight.y * getJointMatrix(u_jointSampler, a_joint.y ) +
                a_weight.z * getJointMatrix(u_jointSampler, a_joint.z ) +
                a_weight.w * getJointMatrix(u_jointSampler, a_joint.w );

        #elif defined( O3_JOINTS_NUM )
            mat4 skinMatrix =
                a_weight.x * u_jointMatrix[ int( a_joint.x ) ] +
                a_weight.y * u_jointMatrix[ int( a_joint.y ) ] +
                a_weight.z * u_jointMatrix[ int( a_joint.z ) ] +
                a_weight.w * u_jointMatrix[ int( a_joint.w ) ];
        #endif

        position = skinMatrix * position;

        #ifdef O3_HAS_NORMAL
            normal = vec4( skinMatrix * vec4( normal, 0.0 ) ).xyz;
            #if defined( O3_HAS_TANGENT ) && defined( O3_HAS_NORMALMAP )
                tangent.xyz = vec4( skinMatrix * vec4( tangent.xyz, 0.0 ) ).xyz;
            #endif

        #endif

#endif
