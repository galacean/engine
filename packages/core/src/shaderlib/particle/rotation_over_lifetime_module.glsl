#if defined(RENDERER_ROL_CONSTANT_MODE) || defined(RENDERER_ROL_CURVE_MODE)
    #ifdef RENDERER_ROL_CURVE_MODE
        uniform vec2 renderer_ROLMaxCurveZ[4];
        // #ifdef RENDERER_ROL_IS_SEPARATE
        //     uniform vec2 renderer_ROLMaxCurveX[4];
        //     uniform vec2 renderer_ROLMaxCurveY[4];
        // #endif
        #ifdef RENDERER_ROL_IS_RANDOM_TWO
            uniform vec2 renderer_ROLMinCurveZ[4];
            // #ifdef RENDERER_ROL_IS_SEPARATE
            //     uniform vec2 renderer_ROLMinCurveX[4];
            //     uniform vec2 renderer_ROLMinCurveY[4];
            // #endif
        #endif
    #else
        uniform vec3 renderer_ROLMaxConst;
        #ifdef RENDERER_ROL_IS_RANDOM_TWO
            uniform vec3 renderer_ROLMinConst;
        #endif
    #endif
#endif

float computeParticleRotationFloat(in float rotation, in float age, in float normalizedAge) {
    #if defined(RENDERER_ROL_CONSTANT_MODE) || defined(RENDERER_ROL_CURVE_MODE)
        #ifdef RENDERER_ROL_CURVE_MODE
            float currentValue;
            float lifeRotation = evaluateParticleCurveCumulative(renderer_ROLMaxCurveZ, normalizedAge, currentValue);
            #ifdef RENDERER_ROL_IS_RANDOM_TWO
                lifeRotation = mix(evaluateParticleCurveCumulative(renderer_ROLMinCurveZ, normalizedAge, currentValue), lifeRotation, a_Random0.w);
            #endif
            rotation += lifeRotation * a_ShapePositionStartLifeTime.w;
        #else
            float lifeRotation = renderer_ROLMaxConst.z;
            #ifdef RENDERER_ROL_IS_RANDOM_TWO
                lifeRotation = mix(renderer_ROLMinConst.z, lifeRotation, a_Random0.w);
            #endif
            rotation += lifeRotation * age;
        #endif
    #endif
    return rotation;
}


#if defined(RENDERER_MODE_MESH) && (defined(RENDERER_ROL_CONSTANT_MODE) || defined(RENDERER_ROL_CURVE_MODE))
vec3 computeParticleRotationVec3(in vec3 rotation, in float age, in float normalizedAge) {
    #ifdef RENDERER_ROL_IS_SEPARATE
        #ifdef RENDERER_ROL_CONSTANT_MODE
            #ifdef RENDERER_ROL_IS_RANDOM_TWO
                vec3 ageRot = mix(renderer_ROLMinConst, renderer_ROLMaxConst, a_Random0.w) * age;
            #else
                vec3 ageRot = renderer_ROLMaxConst * age;
            #endif
            rotation += ageRot;
        #endif
        #ifdef RENDERER_ROL_CURVE_MODE
            #ifdef RENDERER_ROL_IS_RANDOM_TWO
                rotation += vec3(
                mix(getTotalValueFromGradientFloat(renderer_ROLMinCurveX, normalizedAge),
                    getTotalValueFromGradientFloat(renderer_ROLMaxCurveX, normalizedAge), a_Random0.w),
                mix(getTotalValueFromGradientFloat(renderer_ROLMinCurveY, normalizedAge),
                    getTotalValueFromGradientFloat(renderer_ROLMaxCurveY, normalizedAge), a_Random0.w),
                mix(getTotalValueFromGradientFloat(renderer_ROLMinCurveZ, normalizedAge),
                    getTotalValueFromGradientFloat(renderer_ROLMaxCurveZ, normalizedAge), a_Random0.w));
            #else
                rotation += vec3(getTotalValueFromGradientFloat(renderer_ROLMaxCurveX, normalizedAge),
                getTotalValueFromGradientFloat(renderer_ROLMaxCurveY, normalizedAge),
                getTotalValueFromGradientFloat(renderer_ROLMaxCurveZ, normalizedAge));
            #endif
        #endif
    #else
        #ifdef RENDERER_ROL_CONSTANT_MODE
            #ifdef RENDERER_ROL_IS_RANDOM_TWO
                float ageRot = mix(renderer_ROLMinConst.z, renderer_ROLMaxConst.z, a_Random0.w) * age;
            #else
                float ageRot = renderer_ROLMaxConst.z * age;
            #endif
            rotation += ageRot;
        #endif

        #ifdef RENDERER_ROL_CURVE_MODE
            #ifdef RENDERER_ROL_IS_RANDOM_TWO
                rotation += mix(
                getTotalValueFromGradientFloat(renderer_ROLMinCurveZ, normalizedAge),
                getTotalValueFromGradientFloat(renderer_ROLMaxCurveZ, normalizedAge),
                a_Random0.w);
            #else
                rotation += getTotalValueFromGradientFloat(renderer_ROLMaxCurveZ, normalizedAge);
            #endif
        #endif
    #endif
    return rotation;
}
#endif
