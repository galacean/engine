
Shader "Terrain/WindGpuExposure" {
  SubShader "Default" {
    Pass "Exposure" {
      DepthState = { Enabled = false; WriteEnabled = false; }
      RasterState = { CullMode = CullMode.Off; }
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Blit/BlitVertex.glsl"

      mediump sampler2D renderer_BlitTexture;
      vec2 material_TerrainHeightAtlasInvSize;
      vec4 material_TerrainRegionWorldBounds[32];
      vec4 material_TerrainRegionAtlasRects[32];
      vec2 material_TerrainRegionHeightDecode[32];
      int material_TerrainRegionCount;
      vec4 material_FieldBounds;
      vec4 material_WindDirection;

      int terrainWindRegionIndex(vec2 worldXZ) {
        int inclusiveCandidate = -1;
        vec2 candidateMinimum = vec2(-3.402823466e+38);
        for (int index = 0; index < 32; index++) {
          if (index >= material_TerrainRegionCount) break;
          vec4 bounds = material_TerrainRegionWorldBounds[index];
          vec2 minimum = bounds.xy;
          vec2 maximum = minimum + bounds.zw;
          if (all(greaterThanEqual(worldXZ, minimum)) && all(lessThanEqual(worldXZ, maximum))) {
            if (all(lessThan(worldXZ, maximum))) return index;
            if (
              inclusiveCandidate < 0 ||
              minimum.x > candidateMinimum.x ||
              (minimum.x == candidateMinimum.x && minimum.y > candidateMinimum.y)
            ) {
              inclusiveCandidate = index;
              candidateMinimum = minimum;
            }
          }
        }
        return inclusiveCandidate;
      }

      float terrainWindDecodeR16(vec2 atlasTexel) {
        vec2 bytes = texture2D(
          renderer_BlitTexture,
          (atlasTexel + vec2(0.5)) * material_TerrainHeightAtlasInvSize
        ).rg * 255.0;
        return (bytes.x + bytes.y * 256.0) / 65535.0;
      }

      float terrainWindHeightAt(vec2 worldXZ, out float valid) {
        int regionIndex = terrainWindRegionIndex(worldXZ);
        if (regionIndex < 0) {
          valid = 0.0;
          return 0.0;
        }
        vec4 bounds = material_TerrainRegionWorldBounds[regionIndex];
        vec4 atlasRect = material_TerrainRegionAtlasRects[regionIndex];
        vec2 local = clamp((worldXZ - bounds.xy) / bounds.zw, vec2(0.0), vec2(1.0));
        vec2 grid = local * (atlasRect.zw - vec2(1.0));
        vec2 gridMinimum = floor(grid);
        vec2 gridMaximum = min(gridMinimum + vec2(1.0), atlasRect.zw - vec2(1.0));
        vec2 blend = grid - gridMinimum;
        vec2 atlasMinimum = atlasRect.xy + gridMinimum;
        vec2 atlasMaximum = atlasRect.xy + gridMaximum;
        float height00 = terrainWindDecodeR16(atlasMinimum);
        float height10 = terrainWindDecodeR16(vec2(atlasMaximum.x, atlasMinimum.y));
        float height01 = terrainWindDecodeR16(vec2(atlasMinimum.x, atlasMaximum.y));
        float height11 = terrainWindDecodeR16(atlasMaximum);
        float normalizedHeight = mix(mix(height00, height10, blend.x), mix(height01, height11, blend.x), blend.y);
        vec2 decode = material_TerrainRegionHeightDecode[regionIndex];
        valid = 1.0;
        return decode.x + normalizedHeight * decode.y;
      }

      void frag(Varyings input) {
        vec2 worldXZ = mix(material_FieldBounds.xy, material_FieldBounds.zw, input.v_uv);
        float baseValid;
        float baseHeight = terrainWindHeightAt(worldXZ, baseValid);
        if (baseValid < 0.5) {
          gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
        } else {
          vec2 direction = material_WindDirection.xy;
          float directionLength = length(direction);
          if (directionLength <= 1e-5) {
            gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
          } else {
            direction /= directionLength;
            float nearValid;
            float farValid;
            float nearHeight = terrainWindHeightAt(worldXZ - direction * 8.0, nearValid);
            float farHeight = terrainWindHeightAt(worldXZ - direction * 24.0, farValid);
            float maximumBlockingSlope = 0.0;
            if (nearValid > 0.5) maximumBlockingSlope = max(maximumBlockingSlope, (nearHeight - baseHeight) / 8.0);
            if (farValid > 0.5) maximumBlockingSlope = max(maximumBlockingSlope, (farHeight - baseHeight) / 24.0);
            float shelter = smoothstep(0.035, 0.42, maximumBlockingSlope);
            float exposure = 1.0 - shelter * 0.72;
            gl_FragColor = vec4(exposure, 0.0, 0.0, 1.0);
          }
        }
      }
    }
  }
}
