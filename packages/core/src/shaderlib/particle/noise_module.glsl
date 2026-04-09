#ifdef RENDERER_NOISE_MODULE_ENABLED

#include <noise_common>
#include <noise_simplex_3D>

uniform vec4 renderer_NoiseParams; // xyz = strength (constant mode only), w = frequency
uniform vec4 renderer_NoiseOctaveParams; // x = scrollSpeed, y = octaveCount, z = octaveIntensityMultiplier, w = octaveFrequencyMultiplier

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
    float axisOffset = 100.0;
    return vec3(
        simplex(vec3(coord.z, coord.y, coord.x)),
        simplex(vec3(coord.x + axisOffset, coord.z, coord.y)),
        simplex(vec3(coord.y, coord.x + axisOffset, coord.z))
    );
}

vec3 computeNoiseDisplacement(vec3 currentPosition, float normalizedAge) {
    vec3 coord = currentPosition * renderer_NoiseParams.w
               + vec3(renderer_CurrentTime * renderer_NoiseOctaveParams.x);

    int octaveCount = int(renderer_NoiseOctaveParams.y);
    float octaveIntensityMultiplier = renderer_NoiseOctaveParams.z;
    float octaveFrequencyMultiplier = renderer_NoiseOctaveParams.w;

    vec3 noiseValue = sampleSimplexNoise3D(coord);
    float totalAmplitude = 1.0;

    // Unrolled octave loop (GLSL ES 1.0 requires constant loop bounds)
    if (octaveCount >= 2) {
        float amplitude = octaveIntensityMultiplier;
        totalAmplitude += amplitude;
        noiseValue += amplitude * sampleSimplexNoise3D(coord * octaveFrequencyMultiplier);

        if (octaveCount >= 3) {
            amplitude *= octaveIntensityMultiplier;
            totalAmplitude += amplitude;
            noiseValue += amplitude * sampleSimplexNoise3D(coord * octaveFrequencyMultiplier * octaveFrequencyMultiplier);
        }
    }

    // Evaluate strength (supports Constant, TwoConstants, Curve, TwoCurves).
    vec3 strength;
    #ifdef RENDERER_NOISE_STRENGTH_CURVE
        float sx = evaluateParticleCurve(renderer_NoiseStrengthMaxCurveX, normalizedAge);
        #ifdef RENDERER_NOISE_STRENGTH_IS_RANDOM_TWO
            sx = mix(evaluateParticleCurve(renderer_NoiseStrengthMinCurveX, normalizedAge), sx, a_Random0.z);
        #endif
        #ifdef RENDERER_NOISE_IS_SEPARATE
            float sy = evaluateParticleCurve(renderer_NoiseStrengthMaxCurveY, normalizedAge);
            float sz = evaluateParticleCurve(renderer_NoiseStrengthMaxCurveZ, normalizedAge);
            #ifdef RENDERER_NOISE_STRENGTH_IS_RANDOM_TWO
                sy = mix(evaluateParticleCurve(renderer_NoiseStrengthMinCurveY, normalizedAge), sy, a_Random0.z);
                sz = mix(evaluateParticleCurve(renderer_NoiseStrengthMinCurveZ, normalizedAge), sz, a_Random0.z);
            #endif
            strength = vec3(sx, sy, sz);
        #else
            strength = vec3(sx);
        #endif
    #else
        strength = renderer_NoiseParams.xyz;
        #ifdef RENDERER_NOISE_STRENGTH_IS_RANDOM_TWO
            strength = mix(renderer_NoiseStrengthMinConst, strength, a_Random0.z);
        #endif
    #endif

    return (noiseValue / totalAmplitude) * strength;
}

#endif
