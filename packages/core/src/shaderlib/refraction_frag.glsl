#ifdef HAS_REFRACTIONMAP
  vec4 refractionColor = vec4(0.);
  vec3 refractDir = normalize(refract(-geometry.viewDir, geometry.normal, u_refractionRatio));
  vec3 newPos = v_pos + refractDir * u_refractionDepth;
  vec4 projectionPos = u_PTMMatrix * u_projMat * u_viewMat * vec4(newPos, 1.0);
  vec2 projectionUv = projectionPos.xy / projectionPos.w;
  refractionColor = texture2D(u_refractionSampler, projectionUv);
  gl_FragColor = mix(refractionColor, gl_FragColor, gl_FragColor.a);

#endif
