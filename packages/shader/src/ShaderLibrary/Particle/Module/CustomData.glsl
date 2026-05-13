#ifndef CUSTOM_DATA_INCLUDED
#define CUSTOM_DATA_INCLUDED

// Custom data streams: two user-configurable per-particle vec4 values readable
// in a custom particle shader. Each stream's four components share the same
// mode (constant or curve). For `IS_RANDOM_TWO` modes the per-particle random
// factor is deterministically hashed from the birth time so no extra vertex
// attribute is required.

#if defined(RENDERER_CUSTOM_DATA0_CONSTANT_MODE) || defined(RENDERER_CUSTOM_DATA0_CURVE_MODE)
    #define _CUSTOM_DATA0_ENABLED

    #ifdef RENDERER_CUSTOM_DATA0_CONSTANT_MODE
        vec4 renderer_CustomData0MaxConst;
        #ifdef RENDERER_CUSTOM_DATA0_IS_RANDOM_TWO
            vec4 renderer_CustomData0MinConst;
        #endif
    #endif

    #ifdef RENDERER_CUSTOM_DATA0_CURVE_MODE
        vec2 renderer_CustomData0MaxGradientX[4];
        vec2 renderer_CustomData0MaxGradientY[4];
        vec2 renderer_CustomData0MaxGradientZ[4];
        vec2 renderer_CustomData0MaxGradientW[4];
        #ifdef RENDERER_CUSTOM_DATA0_IS_RANDOM_TWO
            vec2 renderer_CustomData0MinGradientX[4];
            vec2 renderer_CustomData0MinGradientY[4];
            vec2 renderer_CustomData0MinGradientZ[4];
            vec2 renderer_CustomData0MinGradientW[4];
        #endif
    #endif
#endif

#if defined(RENDERER_CUSTOM_DATA1_CONSTANT_MODE) || defined(RENDERER_CUSTOM_DATA1_CURVE_MODE)
    #define _CUSTOM_DATA1_ENABLED

    #ifdef RENDERER_CUSTOM_DATA1_CONSTANT_MODE
        vec4 renderer_CustomData1MaxConst;
        #ifdef RENDERER_CUSTOM_DATA1_IS_RANDOM_TWO
            vec4 renderer_CustomData1MinConst;
        #endif
    #endif

    #ifdef RENDERER_CUSTOM_DATA1_CURVE_MODE
        vec2 renderer_CustomData1MaxGradientX[4];
        vec2 renderer_CustomData1MaxGradientY[4];
        vec2 renderer_CustomData1MaxGradientZ[4];
        vec2 renderer_CustomData1MaxGradientW[4];
        #ifdef RENDERER_CUSTOM_DATA1_IS_RANDOM_TWO
            vec2 renderer_CustomData1MinGradientX[4];
            vec2 renderer_CustomData1MinGradientY[4];
            vec2 renderer_CustomData1MinGradientZ[4];
            vec2 renderer_CustomData1MinGradientW[4];
        #endif
    #endif
#endif

// Deterministic per-particle 4-component random in [0, 1) hashed from birth time.
// `seed` should differ between sample sites so multiple modules don't share factors.
vec4 _customDataParticleRand(float birthTime, float seed) {
    vec4 k = vec4(12.9898, 78.233, 39.346, 11.135) + vec4(seed);
    return fract(sin(birthTime * k) * 43758.5453);
}

vec4 sampleParticleCustomData0(Attributes attr, float normalizedAge) {
    #ifdef _CUSTOM_DATA0_ENABLED
        #ifdef RENDERER_CUSTOM_DATA0_CONSTANT_MODE
            vec4 value = renderer_CustomData0MaxConst;
            #ifdef RENDERER_CUSTOM_DATA0_IS_RANDOM_TWO
                vec4 r = _customDataParticleRand(attr.a_DirectionTime.w, 1.0);
                value = mix(renderer_CustomData0MinConst, value, r);
            #endif
            return value;
        #endif
        #ifdef RENDERER_CUSTOM_DATA0_CURVE_MODE
            float ignored;
            vec4 value = vec4(
                evaluateParticleCurve(renderer_CustomData0MaxGradientX, normalizedAge),
                evaluateParticleCurve(renderer_CustomData0MaxGradientY, normalizedAge),
                evaluateParticleCurve(renderer_CustomData0MaxGradientZ, normalizedAge),
                evaluateParticleCurve(renderer_CustomData0MaxGradientW, normalizedAge)
            );
            #ifdef RENDERER_CUSTOM_DATA0_IS_RANDOM_TWO
                vec4 minValue = vec4(
                    evaluateParticleCurve(renderer_CustomData0MinGradientX, normalizedAge),
                    evaluateParticleCurve(renderer_CustomData0MinGradientY, normalizedAge),
                    evaluateParticleCurve(renderer_CustomData0MinGradientZ, normalizedAge),
                    evaluateParticleCurve(renderer_CustomData0MinGradientW, normalizedAge)
                );
                vec4 r = _customDataParticleRand(attr.a_DirectionTime.w, 1.0);
                value = mix(minValue, value, r);
            #endif
            return value;
        #endif
    #endif
    return vec4(0.0);
}

vec4 sampleParticleCustomData1(Attributes attr, float normalizedAge) {
    #ifdef _CUSTOM_DATA1_ENABLED
        #ifdef RENDERER_CUSTOM_DATA1_CONSTANT_MODE
            vec4 value = renderer_CustomData1MaxConst;
            #ifdef RENDERER_CUSTOM_DATA1_IS_RANDOM_TWO
                vec4 r = _customDataParticleRand(attr.a_DirectionTime.w, 2.0);
                value = mix(renderer_CustomData1MinConst, value, r);
            #endif
            return value;
        #endif
        #ifdef RENDERER_CUSTOM_DATA1_CURVE_MODE
            vec4 value = vec4(
                evaluateParticleCurve(renderer_CustomData1MaxGradientX, normalizedAge),
                evaluateParticleCurve(renderer_CustomData1MaxGradientY, normalizedAge),
                evaluateParticleCurve(renderer_CustomData1MaxGradientZ, normalizedAge),
                evaluateParticleCurve(renderer_CustomData1MaxGradientW, normalizedAge)
            );
            #ifdef RENDERER_CUSTOM_DATA1_IS_RANDOM_TWO
                vec4 minValue = vec4(
                    evaluateParticleCurve(renderer_CustomData1MinGradientX, normalizedAge),
                    evaluateParticleCurve(renderer_CustomData1MinGradientY, normalizedAge),
                    evaluateParticleCurve(renderer_CustomData1MinGradientZ, normalizedAge),
                    evaluateParticleCurve(renderer_CustomData1MinGradientW, normalizedAge)
                );
                vec4 r = _customDataParticleRand(attr.a_DirectionTime.w, 2.0);
                value = mix(minValue, value, r);
            #endif
            return value;
        #endif
    #endif
    return vec4(0.0);
}

#endif
