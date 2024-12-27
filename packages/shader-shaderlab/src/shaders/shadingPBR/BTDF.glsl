#ifndef BTDF_INCLUDED
#define BTDF_INCLUDED

#include "Refraction.glsl"

#ifdef MATERIAL_ENABLE_TRANSMISSION 
    sampler2D camera_OpaqueTexture;
    vec3 evaluateRefraction(SurfaceData surfaceData, BRDFData brdfData) {
        RefractionModelResult ray;
        // '0' is refraction sphere, '1' is refraction plane, '2' is refraction thin
        #if REFRACTION_MODE == 0
          RefractionModelSphere(-surfaceData.viewDir, surfaceData.position, surfaceData.normal, surfaceData.IOR, surfaceData.thickness, ray);
        #elif REFRACTION_MODE == 1
            RefractionModelBox(-surfaceData.viewDir, surfaceData.position, surfaceData.normal, surfaceData.IOR, surfaceData.thickness, ray);
        #elif REFRACTION_MODE == 2
            RefractionModelBox(-surfaceData.viewDir, surfaceData.position, surfaceData.normal, surfaceData.IOR, surfaceData.thickness, ray);
        #endif

        vec3 refractedRayExit = ray.positionExit;

        // We calculate the screen space position of the refracted point
        vec4 samplingPositionNDC = camera_ProjMat * camera_ViewMat * vec4( refractedRayExit, 1.0 );
        vec2 refractionCoords = (samplingPositionNDC.xy / samplingPositionNDC.w) * 0.5 + 0.5;

        // Absorption coefficient from Disney: http://blog.selfshadow.com/publications/s2015-shading-course/burley/s2015_pbs_disney_bsdf_notes.pdf
       #ifdef MATERIAL_HAS_ABSORPTION
            #ifdef MATERIAL_HAS_THICKNESS
                vec3 transmittance = min(vec3(1.0), exp(-surfaceData.absorptionCoefficient * ray.transmissionLength));
            #else
                vec3 transmittance = 1.0 - surfaceData.absorptionCoefficient;
            #endif
       #endif

        // Sample the opaque texture to get the transmitted light
		vec4 getTransmission = texture2D(camera_OpaqueTexture, refractionCoords);
        vec3 refractionTransmitted = getTransmission.rgb;
        refractionTransmitted *= brdfData.diffuseColor;
         
        // Use specularFGD as an approximation of the fresnel effect
        // https://blog.selfshadow.com/publications/s2017-shading-course/imageworks/s2017_pbs_imageworks_slides_v2.pdf
        vec3 specularDFG =  brdfData.envSpecularDFG;

        refractionTransmitted *= (1.0 - specularDFG);

       #ifdef MATERIAL_HAS_ABSORPTION
            refractionTransmitted *= transmittance;
       #endif
        
    return refractionTransmitted;
    }
#endif

#endif