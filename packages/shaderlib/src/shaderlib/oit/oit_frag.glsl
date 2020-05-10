#if defined(ALPHA_BLEND) && defined(OIT_ENABLE)
    if(gl_FragCoord.z > texture2D(u_depthSampler, gl_FragCoord.xy / u_resolution).r){
        discard;
    }
    vec4 oitColor = gl_FragColor;

    // Bavoil and Myers’ Method
    gl_FragData[0]= vec4(oitColor.rgb * oitColor.a, oitColor.a);
    gl_FragData[1]= vec4(1)/ 255.0; // 兼容非浮点输出


    // Depth Weights Improve Occlusion
//    float w = weight(gl_FragCoord.z, oitColor.a);
//    gl_FragData[0] = vec4(oitColor.rgb * oitColor.a * w, oitColor.a);
//    gl_FragData[1].r =oitColor.a * w;
#endif
