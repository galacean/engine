#ifdef GAMMA
    float gamma = 2.2;
    gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(1.0 / gamma));
#endif
