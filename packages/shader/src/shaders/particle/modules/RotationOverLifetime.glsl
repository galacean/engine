#ifndef ROTATION_OVER_LIFETIME_INCLUDED
#define ROTATION_OVER_LIFETIME_INCLUDED

#if defined(RENDERER_ROL_CONSTANT_MODE) || defined(RENDERER_ROL_CURVE_MODE)
    #ifdef RENDERER_ROL_CURVE_MODE
        vec2 renderer_ROLMaxCurveZ[4];
        #ifdef RENDERER_ROL_IS_SEPARATE
            vec2 renderer_ROLMaxCurveX[4];
            vec2 renderer_ROLMaxCurveY[4];
        #endif
        #ifdef RENDERER_ROL_IS_RANDOM_TWO
            vec2 renderer_ROLMinCurveZ[4];
            #ifdef RENDERER_ROL_IS_SEPARATE
                vec2 renderer_ROLMinCurveX[4];
                vec2 renderer_ROLMinCurveY[4];
            #endif
        #endif
    #else
        vec3 renderer_ROLMaxConst;
        #ifdef RENDERER_ROL_IS_RANDOM_TWO
            vec3 renderer_ROLMinConst;
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
            float currentValue;
            float lifetime = a_ShapePositionStartLifeTime.w;
            #ifdef RENDERER_ROL_IS_RANDOM_TWO
                rotation += vec3(
                    mix(evaluateParticleCurveCumulative(renderer_ROLMinCurveX, normalizedAge, currentValue),
                        evaluateParticleCurveCumulative(renderer_ROLMaxCurveX, normalizedAge, currentValue), a_Random0.w),
                    mix(evaluateParticleCurveCumulative(renderer_ROLMinCurveY, normalizedAge, currentValue),
                        evaluateParticleCurveCumulative(renderer_ROLMaxCurveY, normalizedAge, currentValue), a_Random0.w),
                    mix(evaluateParticleCurveCumulative(renderer_ROLMinCurveZ, normalizedAge, currentValue),
                        evaluateParticleCurveCumulative(renderer_ROLMaxCurveZ, normalizedAge, currentValue), a_Random0.w)) * lifetime;
            #else
                rotation += vec3(
                    evaluateParticleCurveCumulative(renderer_ROLMaxCurveX, normalizedAge, currentValue),
                    evaluateParticleCurveCumulative(renderer_ROLMaxCurveY, normalizedAge, currentValue),
                    evaluateParticleCurveCumulative(renderer_ROLMaxCurveZ, normalizedAge, currentValue)) * lifetime;
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
            float currentValue;
            float lifeRotation = evaluateParticleCurveCumulative(renderer_ROLMaxCurveZ, normalizedAge, currentValue);
            #ifdef RENDERER_ROL_IS_RANDOM_TWO
                lifeRotation = mix(evaluateParticleCurveCumulative(renderer_ROLMinCurveZ, normalizedAge, currentValue), lifeRotation, a_Random0.w);
            #endif
            rotation += lifeRotation * a_ShapePositionStartLifeTime.w;
        #endif
    #endif
    return rotation;
}
#endif

#endif
