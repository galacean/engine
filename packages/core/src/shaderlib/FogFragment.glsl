#if OASIS_FOG_MODE != 0
    gl_FragColor.rgb = mix(oasis_FogColor.rgb,gl_FragColor.rgb, ComputeFogIntensity(length(v_positionVS)));
#endif
