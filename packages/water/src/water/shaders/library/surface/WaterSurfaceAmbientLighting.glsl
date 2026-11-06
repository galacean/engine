#ifndef WATER_SURFACE_AMBIENT_LIGHTING_INCLUDED
#define WATER_SURFACE_AMBIENT_LIGHTING_INCLUDED

      const float WATER_SURFACE_AMBIENT_PI = 3.141592653589793;

      vec3 waterSurfaceAmbientDiffuseRadiance(vec3 normalWS) {
        vec3 ambientIrradiance = scene_EnvMapLight.diffuse * WATER_SURFACE_AMBIENT_PI;
        #ifdef SCENE_USE_SH
          #ifdef SCENE_USE_REALTIME_SH
          ambientIrradiance = getRealtimeLightProbeIrradiance(normalWS);
          #else
          ambientIrradiance = max(
            scene_EnvSH[0]
              + scene_EnvSH[1] * normalWS.y
              + scene_EnvSH[2] * normalWS.z
              + scene_EnvSH[3] * normalWS.x
              + scene_EnvSH[4] * (normalWS.y * normalWS.x)
              + scene_EnvSH[5] * (normalWS.y * normalWS.z)
              + scene_EnvSH[6] * (3.0 * normalWS.z * normalWS.z - 1.0)
              + scene_EnvSH[7] * (normalWS.z * normalWS.x)
              + scene_EnvSH[8] * (normalWS.x * normalWS.x - normalWS.y * normalWS.y),
            vec3(0.0)
          );
          #endif
        #endif
        return ambientIrradiance
          * max(scene_EnvMapLight.diffuseIntensity, 0.0)
          / WATER_SURFACE_AMBIENT_PI;
      }

#endif
