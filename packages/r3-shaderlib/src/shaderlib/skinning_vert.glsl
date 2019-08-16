    #if defined( R3_HAS_SKIN ) && defined( R3_JOINTS_NUM )

    mat4 skinMatrix =
        a_weight.x * u_jointMatrix[ int( a_joint.x ) ] +
        a_weight.y * u_jointMatrix[ int( a_joint.y ) ] +
        a_weight.z * u_jointMatrix[ int( a_joint.z ) ] +
        a_weight.w * u_jointMatrix[ int( a_joint.w ) ];

    position = skinMatrix * position;

        #ifdef R3_HAS_NORMAL
        normal = vec4( skinMatrix * vec4( normal, 0.0 ) ).xyz;

            #if defined( R3_HAS_TANGENT ) && defined( R3_HAS_NORMALMAP )
            tangent.xyz = vec4( skinMatrix * vec4( tangent.xyz, 0.0 ) ).xyz;
            #endif

        #endif

    #endif
