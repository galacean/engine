
      vec2 waterWorldToLocalXZ(vec2 worldXZ) {
        vec2 delta = worldXZ - material_WaterWorldToLocalPlanar.zw;
        return vec2(
          delta.x * material_WaterWorldToLocalPlanar.x - delta.y * material_WaterWorldToLocalPlanar.y,
          delta.x * material_WaterWorldToLocalPlanar.y + delta.y * material_WaterWorldToLocalPlanar.x
        );
      }

      vec2 waterLocalDirectionToWorldXZ(vec2 localDirection) {
        return vec2(
          localDirection.x * material_WaterWorldToLocalPlanar.x
            + localDirection.y * material_WaterWorldToLocalPlanar.y,
          -localDirection.x * material_WaterWorldToLocalPlanar.y
            + localDirection.y * material_WaterWorldToLocalPlanar.x
        );
      }
