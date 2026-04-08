#ifdef RENDERER_NOISE_MODULE_ENABLED

#include <noise_common>
#include <noise_simplex_3D>

// renderer_NoiseParams: xyz = strength (constant mode only), w = frequency
// renderer_NoiseOctaveParams: x = scrollSpeed, y = octaveCount, z = octaveIntensityMul, w = octaveFreqMul
uniform vec4 renderer_NoiseParams;
uniform vec4 renderer_NoiseOctaveParams;

#ifdef RENDERER_NOISE_STRENGTH_CURVE
    uniform vec2 renderer_NoiseStrengthMaxCurveX[4];
    #ifdef RENDERER_NOISE_IS_SEPARATE
        uniform vec2 renderer_NoiseStrengthMaxCurveY[4];
        uniform vec2 renderer_NoiseStrengthMaxCurveZ[4];
    #endif
    #ifdef RENDERER_NOISE_STRENGTH_IS_RANDOM_TWO
        uniform vec2 renderer_NoiseStrengthMinCurveX[4];
        #ifdef RENDERER_NOISE_IS_SEPARATE
            uniform vec2 renderer_NoiseStrengthMinCurveY[4];
            uniform vec2 renderer_NoiseStrengthMinCurveZ[4];
        #endif
    #endif
#else
    #ifdef RENDERER_NOISE_STRENGTH_IS_RANDOM_TWO
        uniform vec3 renderer_NoiseStrengthMinConst;
    #endif
#endif

vec3 sampleSimplexNoise3D(vec3 coord) {
    float d = 100.0;
    return vec3(
        simplex(vec3(coord.z, coord.y, coord.x)),
        simplex(vec3(coord.x + d, coord.z, coord.y)),
        simplex(vec3(coord.y, coord.x + d, coord.z))
    );
}

vec3 computeNoiseVelocity(vec3 currentPosition, float normalizedAge) {
    // Per-particle random offset (in noise space) ensures particles emitted from the
    // same position sample different regions of the noise field.
    // 50.0: empirical value large enough to decorrelate adjacent particles across
    // typical frequency ranges (0.1–10), yet small relative to simplex noise's
    // effectively infinite non-repeating domain. Larger values work equally well.
    vec3 coord = currentPosition * renderer_NoiseParams.w
               + a_Random0.yzw * 50.0
               + vec3(renderer_CurrentTime * renderer_NoiseOctaveParams.x);

    int octaveCount = int(renderer_NoiseOctaveParams.y);
    float octaveIntensityMultiplier = renderer_NoiseOctaveParams.z;
    float octaveFrequencyMultiplier = renderer_NoiseOctaveParams.w;

    vec3 noiseValue = sampleSimplexNoise3D(coord);
    float totalWeight = 1.0;

    // Unrolled octave loop (GLSL ES 1.0 requires constant loop bounds)
    if (octaveCount >= 2) {
        float weight = octaveIntensityMultiplier;
        totalWeight += weight;
        noiseValue += weight * sampleSimplexNoise3D(coord * octaveFrequencyMultiplier);

        if (octaveCount >= 3) {
            weight *= octaveIntensityMultiplier;
            totalWeight += weight;
            noiseValue += weight * sampleSimplexNoise3D(coord * octaveFrequencyMultiplier * octaveFrequencyMultiplier);
        }
    }

    // Evaluate strength (supports Constant, TwoConstants, Curve, TwoCurves)
    vec3 strength;
    #ifdef RENDERER_NOISE_STRENGTH_CURVE
        float sx = evaluateParticleCurve(renderer_NoiseStrengthMaxCurveX, normalizedAge);
        #ifdef RENDERER_NOISE_STRENGTH_IS_RANDOM_TWO
            sx = mix(evaluateParticleCurve(renderer_NoiseStrengthMinCurveX, normalizedAge), sx, a_Random0.y);
        #endif
        #ifdef RENDERER_NOISE_IS_SEPARATE
            float sy = evaluateParticleCurve(renderer_NoiseStrengthMaxCurveY, normalizedAge);
            float sz = evaluateParticleCurve(renderer_NoiseStrengthMaxCurveZ, normalizedAge);
            #ifdef RENDERER_NOISE_STRENGTH_IS_RANDOM_TWO
                sy = mix(evaluateParticleCurve(renderer_NoiseStrengthMinCurveY, normalizedAge), sy, a_Random0.y);
                sz = mix(evaluateParticleCurve(renderer_NoiseStrengthMinCurveZ, normalizedAge), sz, a_Random0.y);
            #endif
            strength = vec3(sx, sy, sz);
        #else
            strength = vec3(sx);
        #endif
    #else
        strength = renderer_NoiseParams.xyz;
        #ifdef RENDERER_NOISE_STRENGTH_IS_RANDOM_TWO
            strength = mix(renderer_NoiseStrengthMinConst, strength, a_Random0.y);
        #endif
    #endif

    return (noiseValue / totalWeight) * strength;
}

#endif
