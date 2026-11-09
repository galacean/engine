#ifndef FOG_INCLUDED
#define FOG_INCLUDED

#if SCENE_FOG_MODE != 0
    vec4 scene_FogColor;
    vec4 scene_FogParams; // (-1/(end-start), end/(end-start), density/ln(2),density/sprt(ln(2)));
    #ifdef SCENE_FOG_CUSTOM_EXPONENT
        float scene_FogExponent;
    #endif

    #ifdef SCENE_FOG_DIRECTIONAL_SKY
        #include "ShaderLibrary/Common/Transform.glsl"

        vec4 scene_FogTint;
        #ifdef SCENE_USE_REALTIME_SH
            #include "ShaderLibrary/Lighting/RealtimeSphericalHarmonics.glsl"
        #else
            vec3 scene_FogSkySH[9];
        #endif

        vec3 getFogSkyRadiance(vec3 positionVS) {
            vec3 directionVS = positionVS / max(length(positionVS), 1.0e-6);
            vec3 directionWS = normalize(vec3(
                dot(camera_ViewMat[0].xyz, directionVS),
                dot(camera_ViewMat[1].xyz, directionVS),
                dot(camera_ViewMat[2].xyz, directionVS)
            ));
            #ifdef SCENE_USE_REALTIME_SH
                return getRealtimeLightProbeRadiance(directionWS) * scene_FogTint.rgb;
            #else
                float x = directionWS.x;
                float y = directionWS.y;
                float z = directionWS.z;
                vec3 radiance = scene_FogSkySH[0] * 0.282095;
                radiance += scene_FogSkySH[1] * (-0.488603 * y);
                radiance += scene_FogSkySH[2] * (0.488603 * z);
                radiance += scene_FogSkySH[3] * (-0.488603 * x);
                radiance += scene_FogSkySH[4] * (1.092548 * x * y);
                radiance += scene_FogSkySH[5] * (-1.092548 * y * z);
                radiance += scene_FogSkySH[6] * (0.315392 * (3.0 * z * z - 1.0));
                radiance += scene_FogSkySH[7] * (-1.092548 * x * z);
                radiance += scene_FogSkySH[8] * (0.546274 * (x * x - y * y));
                return max(radiance, vec3(0.0)) * scene_FogTint.rgb;
            #endif
        }
    #endif

    float getSceneFogVisibility(vec3 positionVS) {
        float fogDepth = length(positionVS);

        #if SCENE_FOG_MODE == 1
            // (end-z) / (end-start) = z * (-1/(end-start)) + (end/(end-start))
            float fogIntensity = clamp(fogDepth * scene_FogParams.x + scene_FogParams.y, 0.0, 1.0);
        #elif defined(SCENE_FOG_CUSTOM_EXPONENT)
            // exp(-(z * density)^exponent), retaining the exact legacy curves at exponents 1 and 2.
            const float fogLn2 = 0.6931471805599453;
            float densityDistance = max(fogDepth * scene_FogParams.z * fogLn2, 0.0);
            float fogPower = pow(densityDistance, max(scene_FogExponent, 0.0001));
            float fogIntensity = clamp(exp2(-fogPower / fogLn2), 0.0, 1.0);
        #elif SCENE_FOG_MODE == 2
            // exp(-z * density) = exp2((-z * density)/ln(2)) = exp2(-z * density/ln(2))
            float fogIntensity = clamp(exp2(-fogDepth * scene_FogParams.z), 0.0, 1.0);
        #elif SCENE_FOG_MODE == 3
            // exp(-(z * density)^2) = exp2(-(z * density)^2/ln(2)) = exp2(-(z * density/sprt(ln(2)))^2)
            float factor = fogDepth * scene_FogParams.w;
            float fogIntensity = clamp(exp2(-factor * factor), 0.0, 1.0);
        #else
            float fogIntensity = 1.0;
        #endif

        return fogIntensity;
    }

    vec4 fog(vec4 color, vec3 positionVS){
        float fogIntensity = getSceneFogVisibility(positionVS);

        #ifdef SCENE_FOG_DIRECTIONAL_SKY
            vec3 fogRadiance = getFogSkyRadiance(positionVS);
        #else
            vec3 fogRadiance = scene_FogColor.rgb;
        #endif
        color.rgb = mix(fogRadiance, color.rgb, fogIntensity);

        return color;
    }
#endif


#endif
