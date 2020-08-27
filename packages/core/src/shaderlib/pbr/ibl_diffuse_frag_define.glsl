void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in GeometricContext geometry, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {

    reflectedLight.indirectDiffuse += irradiance * BRDF_Diffuse_Lambert( material.diffuseColor );

}

#ifdef O3_HAS_AMBIENT_LIGHT

vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {

    vec3 irradiance = ambientLightColor;

    #ifndef PHYSICALLY_CORRECT_LIGHTS

        irradiance *= PI;

    #endif

    return irradiance;

}

#endif
