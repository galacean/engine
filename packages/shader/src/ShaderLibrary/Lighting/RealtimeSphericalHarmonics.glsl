#ifndef REALTIME_SPHERICAL_HARMONICS_INCLUDED
#define REALTIME_SPHERICAL_HARMONICS_INCLUDED

#ifdef SCENE_USE_REALTIME_SH
    vec4 scene_RealtimeEnvSH[9];

    vec3 getRealtimeLightProbeIrradiance(vec3 normal) {
        vec3 result = scene_RealtimeEnvSH[0].xyz +
            scene_RealtimeEnvSH[1].xyz * normal.y +
            scene_RealtimeEnvSH[2].xyz * normal.z +
            scene_RealtimeEnvSH[3].xyz * normal.x +
            scene_RealtimeEnvSH[4].xyz * (normal.y * normal.x) +
            scene_RealtimeEnvSH[5].xyz * (normal.y * normal.z) +
            scene_RealtimeEnvSH[6].xyz * (3.0 * normal.z * normal.z - 1.0) +
            scene_RealtimeEnvSH[7].xyz * (normal.z * normal.x) +
            scene_RealtimeEnvSH[8].xyz * (normal.x * normal.x - normal.y * normal.y);
        return max(result, vec3(0.0));
    }

    vec3 getRealtimeLightProbeRadiance(vec3 direction) {
        float x = direction.x;
        float y = direction.y;
        float z = direction.z;
        vec3 radiance = scene_RealtimeEnvSH[0].xyz * (0.282095 / 0.886227);
        radiance += scene_RealtimeEnvSH[1].xyz * ((-0.488603 / -1.023327) * y);
        radiance += scene_RealtimeEnvSH[2].xyz * ((0.488603 / 1.023327) * z);
        radiance += scene_RealtimeEnvSH[3].xyz * ((-0.488603 / -1.023327) * x);
        radiance += scene_RealtimeEnvSH[4].xyz * ((1.092548 / 0.858086) * x * y);
        radiance += scene_RealtimeEnvSH[5].xyz * ((-1.092548 / -0.858086) * y * z);
        radiance += scene_RealtimeEnvSH[6].xyz * ((0.315392 / 0.247708) * (3.0 * z * z - 1.0));
        radiance += scene_RealtimeEnvSH[7].xyz * ((-1.092548 / -0.858086) * x * z);
        radiance += scene_RealtimeEnvSH[8].xyz * ((0.546274 / 0.429042) * (x * x - y * y));
        return max(radiance, vec3(0.0));
    }
#endif

#endif
