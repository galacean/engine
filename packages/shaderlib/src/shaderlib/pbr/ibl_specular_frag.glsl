#if defined( RE_IndirectSpecular )

    vec3 radiance = vec3( 0.0 );
    vec3 clearCoatRadiance = vec3( 0.0 );

#endif



#if defined( O3_HAS_ENVMAP_LIGHT ) && defined( RE_IndirectSpecular )

    radiance += getLightProbeIndirectRadiance( geometry, Material_BlinnShininessExponent( material ), int(u_envMapLight.mipMapLevel) );
    clearCoatRadiance += getLightProbeIndirectRadiance( geometry, Material_ClearCoat_BlinnShininessExponent( material ), int(u_envMapLight.mipMapLevel) );

#endif


#if defined( RE_IndirectSpecular )

    RE_IndirectSpecular( radiance, clearCoatRadiance, geometry, material, reflectedLight );

#endif
