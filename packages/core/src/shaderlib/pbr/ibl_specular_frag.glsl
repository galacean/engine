#if defined( RE_IndirectSpecular )

    vec3 radiance = vec3( 0.0 );

#endif



#if defined( RE_IndirectSpecular )

    radiance += getLightProbeIndirectRadiance( geometry, Material_BlinnShininessExponent( material ), int(u_envMapLight.mipMapLevel) );

#endif


#if defined( RE_IndirectSpecular )

    RE_IndirectSpecular( radiance, geometry, material, reflectedLight );

#endif
