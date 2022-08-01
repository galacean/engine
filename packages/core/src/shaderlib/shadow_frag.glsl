  vec4 shadowColor = vec4(1.0, 1.0, 1.0, 1.0);

#ifdef O3_SHADOW_MAP_COUNT

  float visibility = 1.0;

  #if (O3_SHADOW_MAP_COUNT == 1)
    visibility -= getVisibility(v_PositionFromLight[0], u_shadowMaps[0], u_shadowMapSize[0], u_shadowIntensity[0], u_shadowBias[0], u_shadowRadius[0]);
  #elif (O3_SHADOW_MAP_COUNT == 2)
    visibility -= getVisibility(v_PositionFromLight[0], u_shadowMaps[0], u_shadowMapSize[0], u_shadowIntensity[0], u_shadowBias[0], u_shadowRadius[0]);
    visibility -= getVisibility(v_PositionFromLight[1], u_shadowMaps[1], u_shadowMapSize[1], u_shadowIntensity[1], u_shadowBias[1], u_shadowRadius[1]);
  #elif (O3_SHADOW_MAP_COUNT == 3)
    visibility -= getVisibility(v_PositionFromLight[0], u_shadowMaps[0], u_shadowMapSize[0], u_shadowIntensity[0], u_shadowBias[0], u_shadowRadius[0]);
    visibility -= getVisibility(v_PositionFromLight[1], u_shadowMaps[1], u_shadowMapSize[1], u_shadowIntensity[1], u_shadowBias[1], u_shadowRadius[1]);
    visibility -= getVisibility(v_PositionFromLight[2], u_shadowMaps[2], u_shadowMapSize[2], u_shadowIntensity[2], u_shadowBias[2], u_shadowRadius[2]);
  #endif


  visibility = clamp(visibility, 0.0, 1.0);
  shadowColor = vec4(visibility, visibility, visibility, 1.0);
  

#endif

  gl_FragColor *= shadowColor;