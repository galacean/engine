#ifdef HAS_PERTURBATIONMAP

  vec4 screenColor = texture2D(u_perturbationSampler, getScreenUv() + normalize(u_viewMat * vec4(normal, 1.)).xy * vec2(u_perturbationUOffset, u_perturbationVOffset));
  if (gl_FragColor.a < 1.) {
    // mock alpha blend
    gl_FragColor *=  gl_FragColor.a;
    gl_FragColor += (1.0 - gl_FragColor.a)  * screenColor;
  }

#endif
