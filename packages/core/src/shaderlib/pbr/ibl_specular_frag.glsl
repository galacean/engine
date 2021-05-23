vec3 radiance = getIndirectRadiance( geometry, material.specularRoughness, int(u_envMapLight.maxMipMapLevel) );

RE_IndirectSpecular_Physical( radiance, irradiance * u_envMapLight.specularIntensity * RECIPROCAL_PI, geometry, material, reflectedLight );