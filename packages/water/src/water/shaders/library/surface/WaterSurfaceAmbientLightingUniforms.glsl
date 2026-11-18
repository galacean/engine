#ifndef WATER_SURFACE_AMBIENT_LIGHTING_UNIFORMS_INCLUDED
#define WATER_SURFACE_AMBIENT_LIGHTING_UNIFORMS_INCLUDED

      struct WaterSurfaceEnvironmentLight {
        vec3 diffuse;
        float mipMapLevel;
        float diffuseIntensity;
        float specularIntensity;
      };
      WaterSurfaceEnvironmentLight scene_EnvMapLight;
      #ifdef SCENE_USE_SH
        #ifdef SCENE_USE_REALTIME_SH
          #include "ShaderLibrary/Lighting/RealtimeSphericalHarmonics.glsl"
        #else
        vec3 scene_EnvSH[9];
        #endif
      #endif

#endif
