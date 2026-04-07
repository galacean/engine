#ifdef RENDERER_NOISE_MODULE_ENABLED

#include <noise_common>
#include <noise_simplex_3D>

uniform vec3 renderer_NoiseStrength;
uniform float renderer_NoiseFrequency;
uniform float renderer_NoiseScrollSpeed;
uniform vec3 renderer_NoiseOctaveInfo; // x=octaveCount, y=octaveIntensityMultiplier, z=octaveFrequencyMultiplier

vec3 sampleSimplexNoise3D(vec3 coord) {
    return vec3(
        simplex(coord),
        simplex(coord + vec3(17.0, 31.0, 47.0)),
        simplex(coord + vec3(67.0, 89.0, 113.0))
    );
}

vec3 computeNoisePositionOffset(vec3 currentPosition) {
    vec3 coord = currentPosition * renderer_NoiseFrequency
               + vec3(renderer_CurrentTime * renderer_NoiseScrollSpeed);

    int octaveCount = int(renderer_NoiseOctaveInfo.x);
    float octaveIntensityMultiplier = renderer_NoiseOctaveInfo.y;
    float octaveFrequencyMultiplier = renderer_NoiseOctaveInfo.z;

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

    return (noiseValue / totalWeight) * renderer_NoiseStrength;
}

#endif
