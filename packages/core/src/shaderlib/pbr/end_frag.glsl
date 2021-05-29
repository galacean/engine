#ifdef HAS_OCCLUSIONMAP

    float ambientOcclusion = (texture2D(u_occlusionSampler, v_uv).r - 1.0) * u_occlusionStrength + 1.0;
    reflectedLight.indirectDiffuse *= ambientOcclusion;

    #if defined(O3_USE_SPECULAR_ENV)

        float dotNV = saturate(dot(geometry.normal, geometry.viewDir));
        reflectedLight.indirectSpecular *= computeSpecularOcclusion(dotNV, ambientOcclusion, material.specularRoughness);

    #endif

#endif

#ifdef HAS_EMISSIVEMAP

    vec4 emissiveMapColor = texture2D(u_emissiveSampler, v_uv);
    emissiveMapColor = SRGBtoLinear(emissiveMapColor);
    totalEmissiveRadiance *= emissiveMapColor.rgb;

#endif

vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
gl_FragColor = vec4(outgoingLight, diffuseColor.a);

