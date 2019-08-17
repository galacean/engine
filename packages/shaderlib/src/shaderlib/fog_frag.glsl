    #ifdef O3_HAS_FOG

    float fogDepth = length( v_fogDepth );

        #ifdef O3_FOG_EXP2

            float fogFactor = whiteCompliment( exp2( - u_fogDensity * u_fogDensity * fogDepth * fogDepth * LOG2 ) );

        #else

            float fogFactor = smoothstep( u_fogNear, u_fogFar, fogDepth );

        #endif

	gl_FragColor.rgb = mix( gl_FragColor.rgb, u_fogColor, fogFactor );

    #endif
