#ifdef RENDERER_NOISE_MODULE_ENABLED

#include <noise_common>
#include <noise_simplex_3D>

// renderer_NoiseParams: xyz = strength/frequency, w = frequency
// renderer_NoiseOctaveParams: x = scrollSpeed, y = octaveCount, z = octaveIntensityMul, w = octaveFreqMul
uniform vec4 renderer_NoiseParams;
uniform vec4 renderer_NoiseOctaveParams;

vec3 sampleSimplexNoise3D(vec3 coord) {
    return vec3(
        simplex(coord),
        simplex(coord + vec3(17.0, 31.0, 47.0)),
        simplex(coord + vec3(67.0, 89.0, 113.0))
    );
}

vec3 computeNoisePositionOffset(vec3 currentPosition) {
    vec3 coord = currentPosition * renderer_NoiseParams.w
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

    return (noiseValue / totalWeight) * renderer_NoiseParams.xyz;
}

#endif
