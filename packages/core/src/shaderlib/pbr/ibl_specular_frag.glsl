vec3 radiance = vec3( 0.0 );
radiance += getLightProbeIndirectRadiance( geometry, GGXRoughnessToBlinnExponent( material.specularRoughness ), int(u_envMapLight.mipMapLevel) );

RE_IndirectSpecular_Physical( radiance, geometry, material, reflectedLight );