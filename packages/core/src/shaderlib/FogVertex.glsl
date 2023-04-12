#if GALACEAN_FOG_MODE != 0
    vec4 positionVS = galacean_MVMat * position;
    v_positionVS = positionVS.xyz / positionVS.w;
#endif
