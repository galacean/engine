#if {{VALUE_001_LOCAL_BATHYMETRY_VERTEX}}
        float authoredDepth = waterSpatialFieldDecodeDepth(
          localMap.b,
          material_LocalMapDecode.y
        );
        float signedDistance =
          waterSpatialFieldDecodeSignedDistance(
            localMap.a,
            2.0,
            -1.0,
            material_LocalMapDecode.z
          );
#endif
#if {{VALUE_002_PACKED_LOCAL_MAP_VERTEX}}
        float authoredDepth = localMap.b * material_LocalMapDecode.y;
        float signedDistance = (localMap.a * 2.0 - 1.0) * material_LocalMapDecode.z;
#endif
#if {{VALUE_003_LOCAL_BATHYMETRY_FRAGMENT}}
        float authoredDepth = max(
          waterSpatialFieldDecodeDepth(
            localMap.b,
            material_LocalMapDecode.y
          ),
          0.0
        );
        float signedDistance =
          waterSpatialFieldDecodeSignedDistance(
            localMap.a,
            2.0,
            -1.0,
            material_LocalMapDecode.z
          );
#endif
#if {{VALUE_004_PACKED_LOCAL_MAP_FRAGMENT}}
        float authoredDepth = max(localMap.b * material_LocalMapDecode.y, 0.0);
        float signedDistance = (localMap.a * 2.0 - 1.0) * material_LocalMapDecode.z;
#endif
