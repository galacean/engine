  vec4 shadowColor = vec4(1.0, 1.0, 1.0, 1.0);

#ifdef CASCADED_SHADOW_MAP_COUNT

  float visibility = getVisibility(u_shadowMaps[0], u_shadowInfos[0].x, u_shadowInfos[0].y, u_shadowInfos[0].z);
  shadowColor = vec4(visibility, visibility, visibility, 1.0);

#endif

  gl_FragColor *= shadowColor;