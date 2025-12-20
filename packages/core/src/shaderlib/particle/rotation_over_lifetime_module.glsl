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
                rotation += vec3(mix(getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientX,
                        normalizedAge),
                    getTotalValueFromGradientFloat(renderer_ROLMaxCurveX,
                        normalizedAge),
                    a_Random0.w),
                mix(getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientY,
                    normalizedAge),
                    getTotalValueFromGradientFloat(renderer_ROLMaxCurveY,
                    normalizedAge),
                    a_Random0.w),
                mix(getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientZ,
                    normalizedAge),
                    getTotalValueFromGradientFloat(renderer_ROLMaxCurveZ,
                    normalizedAge),
                    a_Random0.w));
            #else
                rotation += vec3(getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientX,
                        normalizedAge),
                getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientY,
                    normalizedAge),
                getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientZ,
                    normalizedAge));
            #endif
        #endif
    #else
        #ifdef RENDERER_ROL_CONSTANT_MODE
            #ifdef RENDERER_ROL_IS_RANDOM_TWO
                float ageRot = mix(u_ROLAngularVelocityConst, u_ROLAngularVelocityConstMax, a_Random0.w) * age;
            #else
                float ageRot = u_ROLAngularVelocityConst * age;
            #endif
            rotation += ageRot;
        #endif

        #ifdef RENDERER_ROL_CURVE_MODE
            #ifdef RENDERER_ROL_IS_RANDOM_TWO
                 rotation += mix(
                getTotalValueFromGradientFloat(u_ROLAngularVelocityGradient, normalizedAge),
                getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientMax,
                    normalizedAge),
                a_Random0.w);
            #else
                rotation += getTotalValueFromGradientFloat(u_ROLAngularVelocityGradient, normalizedAge);
            #endif
        #endif
    #endif
    return rotation;
}
#endif
