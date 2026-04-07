#ifdef RENDERER_NOISE_MODULE_ENABLED

#include <noise_common>
#include <noise_simplex_3D>

// renderer_NoiseParams: xyz = strength, w = frequency
// renderer_NoiseOctaveParams: x = scrollSpeed, y = octaveCount, z = octaveIntensityMul, w = octaveFreqMul
uniform vec4 renderer_NoiseParams;
uniform vec4 renderer_NoiseOctaveParams;

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

    return (noiseValue / totalWeight) * renderer_NoiseParams.xyz;
}

#endif
