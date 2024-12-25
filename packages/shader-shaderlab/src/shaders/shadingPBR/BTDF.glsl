#ifndef BTDF_INCLUDED
#define BTDF_INCLUDED

#include "Refraction.glsl"

#ifdef MATERIAL_ENABLE_SS_REFRACTION 
    sampler2D camera_OpaqueTexture;
    vec3 evaluateRefraction(SurfaceData surfaceData, BRDFData brdfData) {
        RefractionModelResult ray;
        #ifdef REFRACTION_MODE
            refractionModelBox(-surfaceData.viewDir, surfaceData.position, surfaceData.normal, surfaceData.IOR, 0.005, ray);
        #endif
        //TODO: support cubemap refraction.
        vec3 refractedRayExit = ray.positionExit;

        // We calculate the screen space position of the refracted point
        vec4 samplingPositionNDC = camera_ProjMat * camera_ViewMat * vec4( refractedRayExit, 1.0 );
        vec2 refractionCoords = (samplingPositionNDC.xy / samplingPositionNDC.w) * 0.5 + 0.5;

        // Sample the opaque texture to get the transmitted light
		vec4 getTransmission = texture2D(camera_OpaqueTexture, refractionCoords);
        vec3 refractionTransmitted = getTransmission.rgb;
        refractionTransmitted *= brdfData.diffuseColor;
         
        // Use specularFGD as an approximation of the fresnel effect
        // https://blog.selfshadow.com/publications/s2017-shading-course/imageworks/s2017_pbs_imageworks_slides_v2.pdf
        vec3 specularDFG =  brdfData.specularDFG;

        refractionTransmitted *= (1.0 - specularDFG);
        
    return refractionTransmitted;
    }
#endif

#endif