#if OASIS_FOG_MODE != 0
    vec4 positionVS = u_MVMat * position;
    v_positionVS = positionVS.xyz / positionVS.w;
#endif
