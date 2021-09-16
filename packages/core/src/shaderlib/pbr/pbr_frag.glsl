    vec3 normal = getNormal();
    vec4 diffuseColor = u_baseColor;
    vec3 totalEmissiveRadiance = u_emissiveColor;
    float metalnessFactor = u_metal;
    float roughnessFactor = u_roughness;
    vec3 specularFactor = u_specularColor;
    float glossinessFactor = u_glossinessFactor;

    ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
    PhysicalMaterial material;
    GeometricContext geometry;
    IncidentLight directLight;

    #ifdef HAS_BASECOLORMAP

        vec4 baseMapColor = texture2D( u_baseColorSampler, v_uv );
        baseMapColor = SRGBtoLINEAR( baseMapColor );
        diffuseColor *= baseMapColor;

    #endif

    #ifdef O3_HAS_VERTEXCOLOR
        diffuseColor *= v_color;
    #endif


    #ifdef ALPHA_CUTOFF

        if( diffuseColor.a < u_alphaCutoff ) {
            discard;
        }

    #endif

    #ifdef HAS_METALROUGHNESSMAP

        vec4 metalRoughMapColor = texture2D( u_metallicRoughnessSampler, v_uv );
        roughnessFactor *= metalRoughMapColor.g;
        metalnessFactor *= metalRoughMapColor.b;

    #endif

    #ifdef HAS_SPECULARGLOSSINESSMAP

        vec4 specularGlossinessColor = texture2D(u_specularGlossinessSampler, v_uv );
        specularFactor *= specularGlossinessColor.rgb;
        glossinessFactor *= specularGlossinessColor.a;

    #endif


    #ifdef IS_METALLIC_WORKFLOW
        material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
        material.specularRoughness = clamp( roughnessFactor, 0.04, 1.0 );
        material.specularColor = mix( vec3( 0.04), diffuseColor.rgb, metalnessFactor );
    #else
        float specularStrength = max( max( specularFactor.r, specularFactor.g ), specularFactor.b );
        material.diffuseColor = diffuseColor.rgb * ( 1.0 - specularStrength );
        material.specularRoughness = clamp( 1.0 - glossinessFactor, 0.04, 1.0 );
        material.specularColor = specularFactor;
    #endif

    geometry.position = v_pos;
    geometry.normal = normal;
    geometry.viewDir = normalize( u_cameraPos - v_pos );


#include <direct_irradiance_frag>

// IBL diffuse
#ifdef O3_USE_SH
   vec3 irradiance = getLightProbeIrradiance(u_env_sh, normal) * u_envMapLight.diffuseIntensity;
#else
   vec3 irradiance = u_envMapLight.diffuse * u_envMapLight.diffuseIntensity;
#endif

#ifndef PHYSICALLY_CORRECT_LIGHTS
   irradiance *= PI;
#endif

RE_IndirectDiffuse_Physical( irradiance, geometry, material, reflectedLight );


// IBL specular
vec3 radiance = getLightProbeIndirectRadiance( geometry, GGXRoughnessToBlinnExponent( material.specularRoughness ), int(u_envMapLight.mipMapLevel) );

RE_IndirectSpecular_Physical( radiance, geometry, material, reflectedLight );


// occlusion
#ifdef HAS_OCCLUSIONMAP

    float ambientOcclusion = (texture2D(u_occlusionSampler, v_uv).r - 1.0) * u_occlusionStrength + 1.0;
    reflectedLight.indirectDiffuse *= ambientOcclusion;

    #if defined(O3_USE_SPECULAR_ENV)

        float dotNV = saturate(dot(geometry.normal, geometry.viewDir));
        reflectedLight.indirectSpecular *= computeSpecularOcclusion(dotNV, ambientOcclusion, material.specularRoughness);

    #endif

#endif

// emissive
#ifdef HAS_EMISSIVEMAP

    vec4 emissiveMapColor = texture2D(u_emissiveSampler, v_uv);
    emissiveMapColor = SRGBtoLINEAR(emissiveMapColor);
    totalEmissiveRadiance *= emissiveMapColor.rgb;

#endif

vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
gl_FragColor = vec4(outgoingLight, diffuseColor.a);

