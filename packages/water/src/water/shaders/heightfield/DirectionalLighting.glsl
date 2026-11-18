      ivec4 renderer_Layer;
      #ifndef GRAPHICS_API_WEBGL2
        bool waterSurfaceLightLayerBitSet(float value, float mask, float bitIndex) {
          return mod(floor(value / pow(2.0, bitIndex)), 2.0) == 1.0
            && mod(floor(mask / pow(2.0, bitIndex)), 2.0) == 1.0;
        }
      #endif

      bool waterSurfaceIsRendererCulledByLight(ivec2 rendererLayer, ivec2 lightCullingMask) {
        #ifdef GRAPHICS_API_WEBGL2
          return !(
            (rendererLayer.x & lightCullingMask.x) != 0
              || (rendererLayer.y & lightCullingMask.y) != 0
          );
        #else
          for (int layerBit = 0; layerBit < 16; layerBit++) {
            if (
              waterSurfaceLightLayerBitSet(
                float(rendererLayer.x),
                float(lightCullingMask.x),
                float(layerBit)
              )
                || waterSurfaceLightLayerBitSet(
                  float(rendererLayer.y),
                  float(lightCullingMask.y),
                  float(layerBit)
                )
            ) {
              return false;
            }
          }
          return true;
        #endif
      }

      #ifdef SCENE_DIRECT_LIGHT_COUNT
        struct WaterSurfaceDirectLight {
          vec3 color;
          vec3 direction;
        };
        ivec2 scene_DirectLightCullingMask[SCENE_DIRECT_LIGHT_COUNT];
        vec3 scene_DirectLightColor[SCENE_DIRECT_LIGHT_COUNT];
        vec3 scene_DirectLightDirection[SCENE_DIRECT_LIGHT_COUNT];
        #ifdef GRAPHICS_API_WEBGL2
          WaterSurfaceDirectLight getWaterSurfaceDirectLight(int index) {
            WaterSurfaceDirectLight light;
            light.color = scene_DirectLightColor[index];
            light.direction = scene_DirectLightDirection[index];
            return light;
          }
        #endif
      #endif