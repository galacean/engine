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

vec3 computeNoisePositionOffset(vec3 birthPosition, float normalizedAge, float age) {
    vec3 coord = birthPosition * renderer_NoiseFrequency
               + vec3(renderer_CurrentTime * renderer_NoiseScrollSpeed);

    float amplitude = 1.0;
    float frequency = 1.0;
    vec3 noiseValue = sampleNoise3D(coord);

    // Unrolled octave loop (GLSL ES 1.0 requires constant loop bounds)
    int octaves = int(renderer_NoiseOctaveInfo.x);
    if (octaves >= 2) {
        amplitude *= renderer_NoiseOctaveInfo.y;
        frequency *= renderer_NoiseOctaveInfo.z;
        noiseValue += amplitude * sampleNoise3D(coord * frequency);
    }
    if (octaves >= 3) {
        amplitude *= renderer_NoiseOctaveInfo.y;
        frequency *= renderer_NoiseOctaveInfo.z;
        noiseValue += amplitude * sampleNoise3D(coord * frequency);
    }

    vec3 offset = noiseValue * renderer_NoiseStrength;

    #ifdef RENDERER_NOISE_DAMPING
        offset *= (1.0 - normalizedAge);
    #endif

    return offset;
}

#endif
