#if defined(renderer_ROL_CONSTANT_MODE) || defined(renderer_ROL_CURVE_MODE)
    #ifdef renderer_ROL_CURVE_MODE
        uniform vec2 renderer_ROLMaxCurveZ[4];
        // #ifdef renderer_ROL_IS_SEPARATE
        //     uniform vec2 renderer_ROLMaxCurveX[4];
        //     uniform vec2 renderer_ROLMaxCurveY[4];
        // #endif
        #ifdef renderer_ROL_IS_RANDOM_TWO
            uniform vec2 renderer_ROLMinCurveZ[4];
            // #ifdef renderer_ROL_IS_SEPARATE
            //     uniform vec2 renderer_ROLMinCurveX[4];
            //     uniform vec2 renderer_ROLMinCurveY[4];
            // #endif
        #endif
    #else
        uniform vec3 renderer_ROLMaxConst;
        #ifdef renderer_ROL_IS_RANDOM_TWO
            uniform vec3 renderer_ROLMinConst;
        #endif
    #endif
#endif

float computeParticleRotationFloat(in float rotation, in float age, in float normalizedAge) {
    #if defined(renderer_ROL_CONSTANT_MODE) || defined(renderer_ROL_CURVE_MODE)
        #ifdef renderer_ROL_CURVE_MODE
            float lifeRotation = evaluateParticleCurveCumulative(renderer_ROLMaxCurveZ, normalizedAge);
            #ifdef renderer_ROL_IS_RANDOM_TWO
                lifeRotation = mix(evaluateParticleCurveCumulative(renderer_ROLMinCurveZ, normalizedAge), lifeRotation, a_Random0.w);
            #endif
            rotation += lifeRotation * a_ShapePositionStartLifeTime.w;
        #else
            float lifeRotation = renderer_ROLMaxConst.z;
            #ifdef renderer_ROL_IS_RANDOM_TWO
                lifeRotation = mix(renderer_ROLMinConst.z, lifeRotation, a_Random0.w);
            #endif
            rotation += lifeRotation * age;
        #endif
    #endif
    return rotation;
}


#if defined(RENDERER_MODE_MESH) && (defined(ROTATION_OVER_LIFETIME) || defined(ROTATION_OVER_LIFETIME_SEPARATE))
vec3 computeParticleRotationVec3(in vec3 rotation,
    in float age,
    in float normalizedAge) {
#ifdef ROTATION_OVER_LIFETIME
    #ifdef ROTATION_OVER_LIFETIME_CONSTANT
        float ageRot = u_ROLAngularVelocityConst * age;
        rotation += ageRot;
    #endif
    #ifdef ROTATION_OVER_LIFETIME_CURVE
        rotation += getTotalValueFromGradientFloat(u_ROLAngularVelocityGradient, normalizedAge);
    #endif
    #ifdef ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS
        float ageRot = mix(u_ROLAngularVelocityConst, u_ROLAngularVelocityConstMax, a_Random0.w) * age;
        rotation += ageRot;
    #endif
    #ifdef ROTATION_OVER_LIFETIME_RANDOM_CURVES
        rotation += mix(
        getTotalValueFromGradientFloat(u_ROLAngularVelocityGradient, normalizedAge),
        getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientMax,
            normalizedAge),
        a_Random0.w);
    #endif
#endif

#ifdef ROTATION_OVER_LIFETIME_SEPARATE
    #ifdef ROTATION_OVER_LIFETIME_CONSTANT
        vec3 ageRot = u_ROLAngularVelocityConstSeparate * age;
        rotation += ageRot;
    #endif
    #ifdef ROTATION_OVER_LIFETIME_CURVE
        rotation += vec3(getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientX,
                 normalizedAge),
        getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientY,
            normalizedAge),
        getTotalValueFromGradientFloat(u_ROLAngularVelocityGradientZ,
            normalizedAge));
    #endif
    #ifdef ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS
        vec3 ageRot = mix(u_ROLAngularVelocityConstSeparate,
                  renderer_ROLMaxConst,
                  a_Random0.w)
        * age;
        rotation += ageRot;
    #endif
    #ifdef ROTATION_OVER_LIFETIME_RANDOM_CURVES
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
    #endif
#endif
    return rotation;
}
#endif
