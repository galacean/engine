#ifdef RENDERER_NOISE_MODULE_ENABLED

#include <noise_common>
#include <noise_simplex_3D>

uniform vec3 renderer_NoiseStrength;
uniform float renderer_NoiseFrequency;
uniform float renderer_NoiseScrollSpeed;
uniform vec3 renderer_NoiseOctaveInfo; // x=octaveCount, y=octaveMultiplier, z=octaveScale

vec3 sampleNoise3D(vec3 coord) {
    return vec3(
        simplex(coord),
        simplex(coord + vec3(17.0, 31.0, 47.0)),
        simplex(coord + vec3(67.0, 89.0, 113.0))
    );
}

vec3 computeNoisePositionOffset(vec3 currentPosition) {
    vec3 coord = currentPosition * renderer_NoiseFrequency
               + vec3(renderer_CurrentTime * renderer_NoiseScrollSpeed);

    int octaves = int(renderer_NoiseOctaveInfo.x);
    float octaveMultiplier = renderer_NoiseOctaveInfo.y;
    float octaveScale = renderer_NoiseOctaveInfo.z;

    vec3 noiseValue = sampleNoise3D(coord);
    float totalWeight = 1.0;

    // Unrolled octave loop (GLSL ES 1.0 requires constant loop bounds)
    if (octaves >= 2) {
        float weight = octaveMultiplier;
        totalWeight += weight;
        noiseValue += weight * sampleNoise3D(coord * octaveScale);

        if (octaves >= 3) {
            weight *= octaveMultiplier;
            totalWeight += weight;
            noiseValue += weight * sampleNoise3D(coord * octaveScale * octaveScale);
        }
    }

    vec3 offset = (noiseValue / totalWeight) * renderer_NoiseStrength;

    #ifdef RENDERER_NOISE_DAMPING
        float normalizedAge = (renderer_CurrentTime - a_DirectionTime.w) / a_ShapePositionStartLifeTime.w;
        offset *= (1.0 - normalizedAge);
    #endif

    return offset;
}

#endif
