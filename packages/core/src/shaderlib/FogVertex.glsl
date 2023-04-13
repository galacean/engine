#if SCENE_FOG_MODE != 0
    vec4 positionVS = renderer_MVMat * position;
    v_positionVS = positionVS.xyz / positionVS.w;
#endif
