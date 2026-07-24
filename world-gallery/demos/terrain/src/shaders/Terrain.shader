Shader "Terrain" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      DepthState = { WriteEnabled = true; }
      RasterState = { CullMode = CullMode.Back; }
      RenderQueueType = Opaque;

      struct Attributes {
        vec3 POSITION;
      };

      struct Varyings {
        vec3 worldPosition;
        vec2 terrainCoord;
        float cameraDistance;
        #ifdef TERRAIN_DEBUG
          float geomorphFactor;
        #endif
        vec2 worldNoiseDdxDdy;
      };

      struct TerrainSurface {
        vec4 albedoHeight;
        vec4 normalRoughness;
        float normalDepth;
        float aoStrength;
        float totalWeight;
      };

      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Shadow/Shadow.glsl"
      #include "ShaderLibrary/Lighting/Light.glsl"
      #ifdef TERRAIN_DEBUG
        float renderer_Lod;
        float renderer_DebugWire;
      #endif

      highp sampler2DArray material_HeightMaps;
      highp sampler2DArray material_ControlMaps;
      highp sampler2DArray material_ColorMaps;
      highp usampler2D material_RegionMap;
      vec4 material_TerrainParams;
      int material_RegionMapSize;
      float material_MeshSize;
      int material_BackgroundMode;
      int material_WorldNoiseFragmentNormals;
      float material_WorldNoiseRegionBlend;
      int material_WorldNoiseMaxOctaves;
      int material_WorldNoiseMinOctaves;
      float material_WorldNoiseLodDistance;
      float material_WorldNoiseScale;
      float material_WorldNoiseHeight;
      vec3 material_WorldNoiseOffset;

      highp sampler2DArray material_LayerAlbedoArray;
      highp sampler2DArray material_LayerNormalArray;
      int material_LayerCount;
      float material_LayerUvScales[32];
      vec2 material_LayerDetiling[32];
      vec3 material_LayerColors[32];
      float material_LayerNormalDepths[32];
      float material_LayerAoStrengths[32];
      float material_LayerRoughnessMods[32];

      float material_AutoSlope;
      float material_AutoHeightReduction;
      int material_AutoBaseTexture;
      int material_AutoOverlayTexture;

      int material_ProjectionEnabled;
      float material_ProjectionThreshold;
      float material_BlendSharpness;
      float material_MipmapBias;
      float material_BiasDistance;
      float material_DepthBlur;

      int material_DualTexture;
      float material_DualReduction;
      float material_DualNear;
      float material_DualFar;

      highp sampler2D material_MacroNoise;
      vec3 material_MacroColor1;
      vec3 material_MacroColor2;
      float material_MacroSlope;
      float material_Noise1Scale;
      float material_Noise1Angle;
      vec2 material_Noise1Offset;
      float material_Noise2Scale;
      #ifdef TERRAIN_DEBUG
        int material_DebugView;
        int material_DebugLayer;
      #endif

      VertexShader = vert;
      FragmentShader = frag;

      float regionSize() {
        return material_TerrainParams.x;
      }

      float regionTexelSize() {
        return material_TerrainParams.y;
      }

      float vertexSpacing() {
        return material_TerrainParams.z;
      }

      float vertexDensity() {
        return material_TerrainParams.w;
      }

      float decodeBlend(uint control) {
        return float((control >> 14u) & 0xffu) * (1.0 / 255.0);
      }

      int decodeBase(uint control) {
        return int((control >> 27u) & 0x1fu);
      }

      int decodeOverlay(uint control) {
        return int((control >> 22u) & 0x1fu);
      }

      float decodeAngle(uint control) {
        return float((control >> 10u) & 0xfu) * -0.392699081698724;
      }

      float decodeScale(uint control) {
        uint scaleIndex = (control >> 7u) & 0x7u;
        return 0.9 - float(((scaleIndex + 3u) % 8u) + 1u) * 0.1;
      }

      bool decodeHole(uint control) {
        return ((control >> 2u) & 0x1u) != 0u;
      }

      bool decodeAuto(uint control) {
        return (control & 0x1u) != 0u;
      }

      int regionLayerAt(ivec2 regionLocation) {
        int halfMap = material_RegionMapSize / 2;
        ivec2 mapPosition = regionLocation + ivec2(halfMap);
        if (mapPosition.x < 0 || mapPosition.y < 0 ||
            mapPosition.x >= material_RegionMapSize || mapPosition.y >= material_RegionMapSize) {
          return -1;
        }
        return int(texelFetch(material_RegionMap, mapPosition, 0).r) - 1;
      }

      float worldNoiseCheckRegion(vec2 regionCoordinate) {
        return float(regionLayerAt(ivec2(floor(regionCoordinate))) >= 0);
      }

      float worldNoiseRegionBlend(vec2 regionCoordinate) {
        regionCoordinate -= 0.5;
        const vec2 offset = vec2(0.0, 1.0);
        float a = worldNoiseCheckRegion(regionCoordinate + offset.xy);
        float b = worldNoiseCheckRegion(regionCoordinate + offset.yy);
        float c = worldNoiseCheckRegion(regionCoordinate + offset.yx);
        float d = worldNoiseCheckRegion(regionCoordinate + offset.xx);
        vec2 weight = smoothstep(vec2(0.0), vec2(1.0), fract(regionCoordinate));
        float blend = mix(mix(d, c, weight.x), mix(a, b, weight.x), weight.y);
        return 1.0 - blend;
      }

      float worldNoiseHash(vec2 value) {
        return fract(
          10000.0 * sin(17.0 * value.x + value.y * 0.1) * (0.1 + abs(sin(value.y * 13.0 + value.x)))
        );
      }

      vec3 worldNoise2D(vec2 value) {
        vec2 fractional = fract(value);
        vec2 squared = fractional * fractional;
        vec2 cubed = squared * fractional;
        vec2 inverse = fractional - 1.0;
        vec2 inverseSquared = inverse * inverse;
        vec2 interpolation = cubed * (6.0 * squared + (-15.0 * fractional + 10.0));
        vec2 derivative = 30.0 * squared * inverseSquared;
        vec2 cell = floor(value);
        float a = worldNoiseHash(cell + vec2(0.0, 0.0));
        float b = worldNoiseHash(cell + vec2(1.0, 0.0));
        float c = worldNoiseHash(cell + vec2(0.0, 1.0));
        float d = worldNoiseHash(cell + vec2(1.0, 1.0));
        float k0 = a;
        float k1 = b - a;
        float k2 = c - a;
        float k3 = d - (b + k2);
        return vec3(
          k2 * interpolation.y + (interpolation.x * (k3 * interpolation.y + k1) + k0),
          derivative * (vec2(k3) * interpolation.yx + vec2(k1, k2))
        );
      }

      float worldNoise(vec2 position, float worldDistance) {
        float amplitude = 0.0;
        float weight = 1.0;
        vec2 derivative = vec2(0.0);
        // Zero disables the near-detail radius, so every distance uses the minimum octave count.
        float requestedOctaves = material_WorldNoiseLodDistance > 0.0
          ? float(material_WorldNoiseMaxOctaves) - floor(worldDistance / material_WorldNoiseLodDistance)
          : float(material_WorldNoiseMinOctaves);
        int octaves = int(
          clamp(requestedOctaves, float(material_WorldNoiseMinOctaves), float(material_WorldNoiseMaxOctaves))
        );
        for (int index = 0; index < octaves; index++) {
          vec3 noise = worldNoise2D(position);
          derivative += noise.yz;
          amplitude += weight * noise.x / (1.0 + dot(derivative, derivative));
          weight *= 0.5;
          position = mat2(vec2(0.8, -0.6), vec2(0.6, 0.8)) * position * 2.0;
        }
        return amplitude;
      }

      float getWorldNoiseHeight(vec2 regionCoordinate, float worldDistance) {
        float weight = worldNoiseRegionBlend(regionCoordinate);
        if (weight <= 1.0 - material_WorldNoiseRegionBlend) return 0.0;
        float noise = worldNoise(
          (regionCoordinate + material_WorldNoiseOffset.xz * 1024.0 / regionSize()) *
            material_WorldNoiseScale * regionSize() / 1024.0 * 0.1,
          worldDistance
        ) * material_WorldNoiseHeight * 10.0 + material_WorldNoiseOffset.y * 100.0;
        weight = smoothstep(1.0 - material_WorldNoiseRegionBlend, 1.0, weight);
        return mix(0.0, noise, weight);
      }

      // xy: local texel, z: texture-array layer, w: flattened region-map position.
      ivec4 getIndexCoord(vec2 terrainGrid, int searchDepth) {
        vec2 roundedGrid = round(terrainGrid);
        vec2 localGrid = mod(roundedGrid, regionSize());
        ivec2 mapPosition = ivec2(0);
        int layer = -1;
        int flatMapPosition = -1;
        for (int search = -1; search < 2; search++) {
          if (search >= searchDepth) break;
          if ((layer == -1 && material_BackgroundMode == 0) || search < 0) {
            if (search != -1) {
              roundedGrid -= vec2(float(localGrid.x <= localGrid.y), float(localGrid.y <= localGrid.x));
            }
            mapPosition = ivec2(floor(roundedGrid * regionTexelSize())) + ivec2(material_RegionMapSize / 2);
            if (mapPosition.x >= 0 && mapPosition.y >= 0 &&
                mapPosition.x < material_RegionMapSize && mapPosition.y < material_RegionMapSize) {
              flatMapPosition = mapPosition.y * material_RegionMapSize + mapPosition.x;
              layer = int(texelFetch(material_RegionMap, mapPosition, 0).r) - 1;
            } else {
              flatMapPosition = -1;
              layer = -1;
            }
          }
        }
        return ivec4(ivec2(mod(roundedGrid, regionSize())), layer, flatMapPosition);
      }

      vec3 getIndexUv(vec2 regionGrid) {
        ivec2 regionLocation = ivec2(floor(regionGrid));
        int layer = regionLayerAt(regionLocation);
        return vec3(regionGrid - vec2(regionLocation), float(layer));
      }

      float fetchHeight(ivec4 index) {
        if (index.z < 0) return 0.0;
        return texelFetch(material_HeightMaps, ivec3(index.xy, index.z), 0).r;
      }

      uint fetchControl(ivec4 index) {
        if (index.z < 0) return 0u;
        uvec4 bytes = uvec4(round(texelFetch(material_ControlMaps, ivec3(index.xy, index.z), 0) * 255.0));
        return bytes.r | (bytes.g << 8u) | (bytes.b << 16u) | (bytes.a << 24u);
      }

      vec2 rotateVector(vec2 value, vec2 cosineSine) {
        return vec2(
          cosineSine.x * value.x + cosineSine.y * value.y,
          cosineSine.x * value.y - cosineSine.y * value.x
        );
      }

      float randomCell(vec2 cell) {
        return fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
      }

      vec3 diffuseIrradiance(vec3 terrainNormal) {
        vec3 irradiance = scene_EnvMapLight.diffuse * PI;
        #ifdef SCENE_USE_SH
          irradiance = max(
            scene_EnvSH[0] +
              scene_EnvSH[1] * terrainNormal.y +
              scene_EnvSH[2] * terrainNormal.z +
              scene_EnvSH[3] * terrainNormal.x +
              scene_EnvSH[4] * (terrainNormal.y * terrainNormal.x) +
              scene_EnvSH[5] * (terrainNormal.y * terrainNormal.z) +
              scene_EnvSH[6] * (3.0 * terrainNormal.z * terrainNormal.z - 1.0) +
              scene_EnvSH[7] * (terrainNormal.z * terrainNormal.x) +
              scene_EnvSH[8] * (terrainNormal.x * terrainNormal.x - terrainNormal.y * terrainNormal.y),
            vec3(0.0)
          );
        #endif
        return irradiance;
      }

      Varyings vert(Attributes attributes) {
        Varyings output;
        vec3 terrainWorldPosition = (renderer_ModelMat * vec4(attributes.POSITION, 1.0)).xyz;
        output.cameraDistance = length(terrainWorldPosition.xz - camera_Position.xz);
        output.worldNoiseDdxDdy = vec2(0.0);

        float lodScale = length(renderer_ModelMat[0].xyz);
        float vertexLerp = smoothstep(
          0.55,
          0.95,
          (output.cameraDistance / lodScale - material_MeshSize - 4.0) / (material_MeshSize - 2.0)
        );
        #ifdef TERRAIN_DEBUG
          output.geomorphFactor = vertexLerp;
        #endif
        vec2 vertexFract = fract(attributes.POSITION.xz * 0.5) * 2.0;
        vec2 shift;
        if (lodScale < vertexSpacing() + 0.000001) {
          float alternating = round(
            fract(round(mod(terrainWorldPosition.z * vertexDensity(), 4.0))) *
            round(mod(terrainWorldPosition.x * vertexDensity(), 4.0)) * 0.25
          );
          shift = mix(vertexFract, vec2(vertexFract.x, -vertexFract.y), alternating);
        } else {
          shift = vertexFract * round((fract(terrainWorldPosition.xz * 0.25 / lodScale) - 0.5) * 4.0);
        }

        vec2 startPosition = terrainWorldPosition.xz * vertexDensity();
        vec2 endPosition = (terrainWorldPosition.xz - shift * lodScale) * vertexDensity();
        terrainWorldPosition.xz -= shift * lodScale * vertexLerp;

        ivec4 startIndex = getIndexCoord(startPosition, 1);
        uint control = fetchControl(startIndex);
        bool resolveHeight = true;
        #ifdef TERRAIN_DEBUG
        if (startIndex.z < 0 && (material_DebugView == 2 || material_DebugView == 10)) {
          terrainWorldPosition.y = 0.0;
          resolveHeight = false;
        } else if ((startIndex.z < 0 && material_BackgroundMode == 0) ||
                   (decodeHole(control) && material_DebugView != 9)) {
          terrainWorldPosition.x = sqrt(-1.0);
          resolveHeight = false;
        }
        #else
        if ((startIndex.z < 0 && material_BackgroundMode == 0) || decodeHole(control)) {
          terrainWorldPosition.x = sqrt(-1.0);
          resolveHeight = false;
        }
        #endif
        if (resolveHeight) {
          ivec4 endIndex = getIndexCoord(endPosition, 1);
          float height = mix(fetchHeight(startIndex), fetchHeight(endIndex), vertexLerp);
          if (material_BackgroundMode == 2) {
            vec2 noiseUvA = startPosition * regionTexelSize() + vec2(0.5 * regionTexelSize());
            vec2 noiseUvB = endPosition * regionTexelSize() + vec2(0.5 * regionTexelSize());
            float noiseHeight = mix(
              getWorldNoiseHeight(noiseUvA, output.cameraDistance),
              getWorldNoiseHeight(noiseUvB, output.cameraDistance),
              vertexLerp
            );
            float noiseU = mix(
              getWorldNoiseHeight(noiseUvA + vec2(regionTexelSize(), 0.0), output.cameraDistance),
              getWorldNoiseHeight(noiseUvB + vec2(regionTexelSize(), 0.0), output.cameraDistance),
              vertexLerp
            );
            float noiseV = mix(
              getWorldNoiseHeight(noiseUvA + vec2(0.0, regionTexelSize()), output.cameraDistance),
              getWorldNoiseHeight(noiseUvB + vec2(0.0, regionTexelSize()), output.cameraDistance),
              vertexLerp
            );
            output.worldNoiseDdxDdy = vec2(noiseHeight - noiseU, noiseHeight - noiseV);
            height += noiseHeight;
          }
          terrainWorldPosition.y = height;
        }

        output.worldPosition = terrainWorldPosition;
        output.terrainCoord = terrainWorldPosition.xz * vertexDensity();
        gl_Position = camera_VPMat * vec4(terrainWorldPosition, 1.0);
        return output;
      }

      vec2 collectWeights(uvec4 controls, vec4 corners, ivec2 candidateIds) {
        vec2 result = vec2(0.0);
        uint c0 = controls.x;
        uint c1 = controls.y;
        uint c2 = controls.z;
        uint c3 = controls.w;
        float b0 = decodeBlend(c0);
        float b1 = decodeBlend(c1);
        float b2 = decodeBlend(c2);
        float b3 = decodeBlend(c3);

        result.x += corners.x * ((decodeBase(c0) == candidateIds.x ? 1.0 - b0 : 0.0) + (decodeOverlay(c0) == candidateIds.x ? b0 : 0.0));
        result.x += corners.y * ((decodeBase(c1) == candidateIds.x ? 1.0 - b1 : 0.0) + (decodeOverlay(c1) == candidateIds.x ? b1 : 0.0));
        result.x += corners.z * ((decodeBase(c2) == candidateIds.x ? 1.0 - b2 : 0.0) + (decodeOverlay(c2) == candidateIds.x ? b2 : 0.0));
        result.x += corners.w * ((decodeBase(c3) == candidateIds.x ? 1.0 - b3 : 0.0) + (decodeOverlay(c3) == candidateIds.x ? b3 : 0.0));

        result.y += corners.x * ((decodeBase(c0) == candidateIds.y ? 1.0 - b0 : 0.0) + (decodeOverlay(c0) == candidateIds.y ? b0 : 0.0));
        result.y += corners.y * ((decodeBase(c1) == candidateIds.y ? 1.0 - b1 : 0.0) + (decodeOverlay(c1) == candidateIds.y ? b1 : 0.0));
        result.y += corners.z * ((decodeBase(c2) == candidateIds.y ? 1.0 - b2 : 0.0) + (decodeOverlay(c2) == candidateIds.y ? b2 : 0.0));
        result.y += corners.w * ((decodeBase(c3) == candidateIds.y ? 1.0 - b3 : 0.0) + (decodeOverlay(c3) == candidateIds.y ? b3 : 0.0));
        return result;
      }

      void prepareLayerSample(
        int layer,
        float layerScale,
        vec2 samplePosition,
        vec2 sampleUv,
        vec4 derivatives,
        vec2 controlCosineSine,
        out vec2 cell,
        out vec2 layerUv,
        out vec2 layerCosineSine,
        out vec4 layerDerivatives
      ) {
        cell = floor(samplePosition * layerScale + vec2(0.5));
        layerDerivatives = derivatives * layerScale;
        vec2 detile = (randomCell(cell) * 2.0 - 1.0) * material_LayerDetiling[layer] * 6.283185307179586;
        layerCosineSine = vec2(cos(detile.x), sin(detile.x));
        layerUv = rotateVector(sampleUv * layerScale - cell, layerCosineSine) + cell + detile.y - 0.5;
        layerCosineSine = vec2(
          layerCosineSine.x * controlCosineSine.x - layerCosineSine.y * controlCosineSine.y,
          layerCosineSine.y * controlCosineSine.x + layerCosineSine.x * controlCosineSine.y
        );
        layerDerivatives.xy = rotateVector(layerDerivatives.xy, layerCosineSine);
        layerDerivatives.zw = rotateVector(layerDerivatives.zw, layerCosineSine);
      }

      void prepareLayerSampleAtCell(
        int layer,
        float layerScale,
        vec2 sampleUv,
        vec4 derivatives,
        vec2 controlCosineSine,
        vec2 cell,
        out vec2 layerUv,
        out vec2 layerCosineSine,
        out vec4 layerDerivatives
      ) {
        layerDerivatives = derivatives * layerScale;
        vec2 detile = (randomCell(cell) * 2.0 - 1.0) * material_LayerDetiling[layer] * 6.283185307179586;
        layerCosineSine = vec2(cos(detile.x), sin(detile.x));
        layerUv = rotateVector(sampleUv * layerScale - cell, layerCosineSine) + cell + detile.y - 0.5;
        layerCosineSine = vec2(
          layerCosineSine.x * controlCosineSine.x - layerCosineSine.y * controlCosineSine.y,
          layerCosineSine.y * controlCosineSine.x + layerCosineSine.x * controlCosineSine.y
        );
        layerDerivatives.xy = rotateVector(layerDerivatives.xy, layerCosineSine);
        layerDerivatives.zw = rotateVector(layerDerivatives.zw, layerCosineSine);
      }

      void sampleLayerCell(
        int layer,
        float layerScale,
        vec2 sampleUv,
        vec4 derivatives,
        vec2 controlCosineSine,
        mat2 projectionAlignment,
        vec2 cell,
        out vec4 albedo,
        out vec4 normal
      ) {
        vec2 layerUv;
        vec2 layerCosineSine;
        vec4 layerDerivatives;
        prepareLayerSampleAtCell(
          layer,
          layerScale,
          sampleUv,
          derivatives,
          controlCosineSine,
          cell,
          layerUv,
          layerCosineSine,
          layerDerivatives
        );
        albedo = textureGrad(material_LayerAlbedoArray, vec3(layerUv, float(layer)), layerDerivatives.xy, layerDerivatives.zw);
        normal = textureGrad(material_LayerNormalArray, vec3(layerUv, float(layer)), layerDerivatives.xy, layerDerivatives.zw);
        albedo.rgb *= material_LayerColors[layer];
        normal.a = clamp(normal.a + material_LayerRoughnessMods[layer], 0.0, 1.0);
        normal.xyz = normal.xzy * 2.0 - 1.0;
        normal.xz = rotateVector(normal.xz, layerCosineSine) * projectionAlignment;
      }

      void sampleLayer(
        int layer,
        float layerScale,
        vec2 samplePosition,
        vec2 sampleUv,
        vec4 derivatives,
        vec2 controlCosineSine,
        mat2 projectionAlignment,
        out vec4 albedo,
        out vec4 normal
      ) {
        vec2 sourceCell = floor(samplePosition * layerScale + vec2(0.5));
        sampleLayerCell(
          layer,
          layerScale,
          sampleUv,
          derivatives,
          controlCosineSine,
          projectionAlignment,
          sourceCell,
          albedo,
          normal
        );
      }

      vec3 worldNormalFromSample(vec4 normalSample, vec3 tangent, vec3 bitangent, vec3 terrainNormal) {
        return tangent * normalSample.x + bitangent * normalSample.z + terrainNormal * normalSample.y;
      }

      void addSample(
        int layer,
        vec4 albedo,
        vec4 normal,
        float weight,
        inout TerrainSurface surface
      ) {
        surface.albedoHeight += albedo * weight;
        surface.normalRoughness += normal * weight;
        surface.normalDepth += material_LayerNormalDepths[layer] * weight;
        surface.aoStrength += material_LayerAoStrengths[layer] * weight;
        surface.totalWeight += weight;
      }

      void prepareMaterialCoordinates(
        vec3 baseDdx,
        vec3 baseDdy,
        vec2 sampleGrid,
        uint control,
        vec3 terrainNormal,
        float height,
        vec3 worldPosition,
        out vec2 samplePosition,
        out vec2 sampleUv,
        out vec4 derivatives,
        out vec2 controlCosineSine,
        out mat2 projectionAlignment
      ) {
        samplePosition = sampleGrid * vertexSpacing();
        sampleUv = worldPosition.xz;
        derivatives = vec4(baseDdx.xz, baseDdy.xz);
        projectionAlignment = mat2(1.0);
        if (terrainNormal.y <= material_ProjectionThreshold && material_ProjectionEnabled != 0) {
          projectionAlignment = mat2(vec2(terrainNormal.z, -terrainNormal.x), vec2(terrainNormal.x, terrainNormal.z));
          vec2 projectedAxis = round(normalize(-terrainNormal.xz) * 1.3065629648763765);
          projectedAxis *= abs(projectedAxis.x) + abs(projectedAxis.y) > 1.5 ? 0.7071067811865475 : 1.0;
          projectedAxis = vec2(-projectedAxis.y, projectedAxis.x);
          samplePosition = floor(vec2(dot(samplePosition, projectedAxis), -height));
          sampleUv = vec2(dot(worldPosition.xz, projectedAxis), -worldPosition.y);
          derivatives.xy = vec2(dot(baseDdx.xz, projectedAxis), -baseDdx.y);
          derivatives.zw = vec2(dot(baseDdy.xz, projectedAxis), -baseDdy.y);
        }

        float controlScale = decodeScale(control);
        derivatives *= controlScale;
        sampleUv *= controlScale;
        samplePosition *= controlScale;
        float controlAngle = decodeAngle(control);
        controlCosineSine = vec2(cos(controlAngle), sin(controlAngle));
        sampleUv = rotateVector(sampleUv, controlCosineSine);
        samplePosition = rotateVector(samplePosition, controlCosineSine);
      }

      void accumulateMaterial(
        vec3 baseDdx,
        vec3 baseDdy,
        float cornerWeight,
        vec2 sampleGrid,
        uint control,
        vec2 textureWeights,
        ivec2 textureIds,
        vec3 terrainNormal,
        float height,
        vec3 worldPosition,
        inout TerrainSurface surface
      ) {
        vec2 samplePosition;
        vec2 sampleUv;
        vec4 derivatives;
        vec2 controlCosineSine;
        mat2 projectionAlignment;
        prepareMaterialCoordinates(
          baseDdx,
          baseDdy,
          sampleGrid,
          control,
          terrainNormal,
          height,
          worldPosition,
          samplePosition,
          sampleUv,
          derivatives,
          controlCosineSine,
          projectionAlignment
        );

        vec3 tangent = normalize(baseDdx);
        vec3 bitangent = -normalize(baseDdy);
        float blend = decodeBlend(control);
        float sharpness = 56.0 * material_BlendSharpness + 8.0;
        float mappedBaseNormalY = 1.0;

        #ifdef TERRAIN_DUAL_SCALING
          float farFactor = clamp(smoothstep(material_DualNear, material_DualFar, length(worldPosition - camera_Position)), 0.0, 1.0);
          vec4 farAlbedo = vec4(0.0);
          vec4 farNormal = vec4(0.0);
          bool dualLayerPresent = textureIds.x == material_DualTexture || textureIds.y == material_DualTexture;
          if (farFactor > 0.0 && dualLayerPresent && material_DualTexture < material_LayerCount) {
            float farScale = material_LayerUvScales[material_DualTexture] * material_DualReduction;
            sampleLayer(
              material_DualTexture,
              farScale,
              samplePosition,
              sampleUv,
              derivatives,
              controlCosineSine,
              projectionAlignment,
              farAlbedo,
              farNormal
            );
            if (farFactor == 1.0) {
              float dualWeight = textureIds.x == material_DualTexture ? textureWeights.x : textureWeights.y;
              float weighted = exp2(sharpness * log2(cornerWeight + dualWeight + farAlbedo.a)) * cornerWeight;
              mappedBaseNormalY = worldNormalFromSample(farNormal, tangent, bitangent, terrainNormal).y;
              addSample(material_DualTexture, farAlbedo, farNormal, weighted, surface);
            }
          }
        #else
          float farFactor = 0.0;
          vec4 farAlbedo = vec4(0.0);
          vec4 farNormal = vec4(0.0);
        #endif

        bool skipBaseForFar = farFactor == 1.0 && textureIds.x == material_DualTexture;
        if (blend < 1.0 && !skipBaseForFar && textureIds.x >= 0 && textureIds.x < material_LayerCount) {
          int layer = textureIds.x;
          vec4 albedo;
          vec4 normal;
          sampleLayer(
            layer,
            material_LayerUvScales[layer],
            samplePosition,
            sampleUv,
            derivatives,
            controlCosineSine,
            projectionAlignment,
            albedo,
            normal
          );
          #ifdef TERRAIN_DUAL_SCALING
            if (layer == material_DualTexture && farFactor > 0.0) {
              albedo = mix(albedo, farAlbedo, farFactor);
              normal = mix(normal, farNormal, farFactor);
            }
          #endif
          mappedBaseNormalY = worldNormalFromSample(normal, tangent, bitangent, terrainNormal).y;
          float weighted = exp2(sharpness * log2(cornerWeight + textureWeights.x + albedo.a)) * cornerWeight;
          addSample(layer, albedo, normal, weighted, surface);
        }

        bool skipOverlayForFar = farFactor == 1.0 && textureIds.y == material_DualTexture;
        if (blend > 0.0 && textureIds.y != textureIds.x && !skipOverlayForFar &&
            textureIds.y >= 0 && textureIds.y < material_LayerCount) {
          int layer = textureIds.y;
          vec4 albedo;
          vec4 normal;
          sampleLayer(
            layer,
            material_LayerUvScales[layer],
            samplePosition,
            sampleUv,
            derivatives,
            controlCosineSine,
            projectionAlignment,
            albedo,
            normal
          );
          #ifdef TERRAIN_DUAL_SCALING
            if (layer == material_DualTexture && farFactor > 0.0) {
              albedo = mix(albedo, farAlbedo, farFactor);
              normal = mix(normal, farNormal, farFactor);
            }
          #endif
          float weighted = exp2(
            sharpness * log2(cornerWeight + textureWeights.y + albedo.a * clamp(mappedBaseNormalY, 0.0, 1.0))
          ) * cornerWeight;
          addSample(layer, albedo, normal, weighted, surface);
        }
      }

      uint autoControl(float normalY, float height) {
        float autoBlend = clamp(
          material_AutoSlope * 2.0 * (normalY - 1.0) + 1.0 - material_AutoHeightReduction * 0.01 * height,
          0.0,
          1.0
        );
        return
          ((uint(material_AutoBaseTexture) & 0x1fu) << 27u) |
          ((uint(material_AutoOverlayTexture) & 0x1fu) << 22u) |
          ((uint(autoBlend * 255.0 + 0.5) & 0xffu) << 14u);
      }

      #ifdef TERRAIN_DEBUG
      vec3 lodColor(float lod) {
        if (lod < 0.5) return vec3(1.0, 0.2, 0.2);
        if (lod < 1.5) return vec3(1.0, 0.65, 0.1);
        if (lod < 2.5) return vec3(0.2, 1.0, 0.25);
        if (lod < 3.5) return vec3(0.1, 0.8, 1.0);
        if (lod < 4.5) return vec3(0.25, 0.35, 1.0);
        if (lod < 5.5) return vec3(0.75, 0.25, 1.0);
        return vec3(1.0, 0.25, 0.7);
      }

      vec3 textureIdColor(int id) {
        vec3 colors[32];
        colors[0] = vec3(1.0, 0.0, 0.0);
        colors[1] = vec3(0.0, 1.0, 0.0);
        colors[2] = vec3(0.0, 0.0, 1.0);
        colors[3] = vec3(1.0, 0.0, 1.0);
        colors[4] = vec3(0.0, 1.0, 1.0);
        colors[5] = vec3(1.0, 1.0, 0.0);
        colors[6] = vec3(0.2, 0.0, 0.0);
        colors[7] = vec3(0.0, 0.2, 0.0);
        colors[8] = vec3(0.0, 0.0, 0.35);
        colors[9] = vec3(0.2, 0.0, 0.2);
        colors[10] = vec3(0.0, 0.2, 0.2);
        colors[11] = vec3(0.2, 0.2, 0.0);
        colors[12] = vec3(0.1, 0.0, 0.0);
        colors[13] = vec3(0.0, 0.1, 0.0);
        colors[14] = vec3(0.0, 0.0, 0.15);
        colors[15] = vec3(0.1, 0.0, 0.1);
        colors[16] = vec3(0.0, 0.1, 0.1);
        colors[17] = vec3(0.1, 0.1, 0.0);
        colors[18] = vec3(0.2, 0.05, 0.05);
        colors[19] = vec3(0.1, 0.3, 0.1);
        colors[20] = vec3(0.05, 0.05, 0.2);
        colors[21] = vec3(0.1, 0.05, 0.2);
        colors[22] = vec3(0.05, 0.15, 0.2);
        colors[23] = vec3(0.2, 0.2, 0.1);
        colors[24] = vec3(1.0);
        colors[25] = vec3(0.5);
        colors[26] = vec3(0.35);
        colors[27] = vec3(0.25);
        colors[28] = vec3(0.15);
        colors[29] = vec3(0.1);
        colors[30] = vec3(0.05);
        colors[31] = vec3(0.0125);
        return colors[id];
      }

      float cellEdge(vec2 localPosition) {
        vec2 distanceToEdge = min(localPosition, 1.0 - localPosition);
        return 1.0 - smoothstep(0.0, 0.025, min(distanceToEdge.x, distanceToEdge.y));
      }
      #endif

      vec4 shadeTerrain(Varyings varyings) {
        #ifdef TERRAIN_DEBUG
        if (material_DebugView == 27) {
          return renderer_DebugWire > 0.5 ? vec4(0.65, 0.95, 1.0, 1.0) : vec4(0.015, 0.02, 0.03, 1.0);
        }
        if (material_DebugView == 13) {
          if (renderer_DebugWire > 0.5) {
            vec3 ringColor = lodColor(renderer_Lod);
            float morphBrightness = mix(0.5, 1.0, varyings.geomorphFactor);
            return vec4(ringColor * morphBrightness, 1.0);
          }
          return vec4(0.025, 0.03, 0.045, 1.0);
        }
        if (material_DebugView == 14) {
          float factor = clamp(
            smoothstep(material_DualNear, material_DualFar, length(varyings.worldPosition - camera_Position)),
            0.0,
            1.0
          );
          return vec4(factor, 0.0, 1.0 - factor, 1.0);
        }
        if (material_DebugView == 15) {
          vec2 grid = floor(varyings.terrainCoord * 0.5);
          float check = mod(grid.x + grid.y, 2.0);
          return vec4(vec3(mix(0.15, 0.35, check)), 1.0);
        }
        if (material_DebugView == 16) return vec4(vec3(0.2), 1.0);
        if (material_DebugView == 11) {
          vec2 grid = abs(fract(varyings.terrainCoord) - 0.5);
          float line = float(grid.x > 0.47 || grid.y > 0.47);
          return vec4(vec3(line), 1.0);
        }
        #endif

        vec2 indexPosition = floor(varyings.terrainCoord);
        vec2 fractional = fract(varyings.terrainCoord);
        vec2 inverseFractional = 1.0 - fractional;
        vec4 cornerWeights = vec4(
          inverseFractional.x * fractional.y,
          fractional.x * fractional.y,
          fractional.x * inverseFractional.y,
          inverseFractional.x * inverseFractional.y
        );

        ivec4 index0 = getIndexCoord(indexPosition + vec2(0.0, 1.0), 2);
        ivec4 index1 = getIndexCoord(indexPosition + vec2(1.0, 1.0), 2);
        ivec4 index2 = getIndexCoord(indexPosition + vec2(1.0, 0.0), 2);
        ivec4 index3 = getIndexCoord(indexPosition, 2);
        vec3 regionUv = getIndexUv(varyings.terrainCoord * regionTexelSize() + vec2(0.5 * regionTexelSize()));
        #ifdef TERRAIN_DEBUG
        if (material_DebugView == 2) {
          return index3.z < 0 ? vec4(0.02, 0.02, 0.02, 1.0) : vec4(lodColor(float(index3.z)), 1.0);
        }
        if (material_DebugView == 10) {
          vec2 cell = fract(varyings.terrainCoord * regionTexelSize());
          float line = float(cell.x < 0.004 || cell.y < 0.004 || cell.x > 0.996 || cell.y > 0.996);
          vec3 regionColor = index3.z < 0 ? vec3(0.02) : lodColor(float(index3.z)) * 0.35;
          return vec4(mix(regionColor, vec3(1.0), line), 1.0);
        }
        #endif

        vec3 baseDdx = dFdx(varyings.worldPosition);
        vec3 baseDdy = dFdy(varyings.worldPosition);
        float regionMip = log2(max(length(baseDdx.xz), length(baseDdy.xz)) * vertexDensity());
        bool bilerp = regionMip < 0.0 && regionUv.z > -1.0;
        vec4 colorMap = regionUv.z > -1.0
          ? textureLod(material_ColorMaps, regionUv, regionMip)
          : vec4(1.0, 1.0, 1.0, 0.5);
        vec2 backgroundNoiseDerivatives = vec2(0.0);
        if (material_BackgroundMode == 2) {
          if (material_WorldNoiseFragmentNormals != 0) {
            vec2 worldNoiseUv = varyings.terrainCoord * regionTexelSize() + vec2(0.5 * regionTexelSize());
            float noiseHeight = getWorldNoiseHeight(worldNoiseUv, varyings.cameraDistance);
            backgroundNoiseDerivatives.x = noiseHeight - getWorldNoiseHeight(
              worldNoiseUv + vec2(regionTexelSize(), 0.0),
              varyings.cameraDistance
            );
            backgroundNoiseDerivatives.y = noiseHeight - getWorldNoiseHeight(
              worldNoiseUv + vec2(0.0, regionTexelSize()),
              varyings.cameraDistance
            );
          } else {
            backgroundNoiseDerivatives = varyings.worldNoiseDdxDdy;
          }
        }

        float h3 = fetchHeight(index3);
        float h2 = fetchHeight(index2);
        float h0 = fetchHeight(index0);
        vec3 normal3 = normalize(vec3(h3 - h2 + backgroundNoiseDerivatives.x, vertexSpacing(), h3 - h0 + backgroundNoiseDerivatives.y));
        vec3 normal0 = normal3;
        vec3 normal1 = normal3;
        vec3 normal2 = normal3;
        float h1 = h3;
        vec3 terrainNormal = normal3;
        if (bilerp) {
          vec4 color0 = index0.z > -1 ? texelFetch(material_ColorMaps, ivec3(index0.xyz), 0) : vec4(1.0, 1.0, 1.0, 0.5);
          vec4 color1 = index1.z > -1 ? texelFetch(material_ColorMaps, ivec3(index1.xyz), 0) : vec4(1.0, 1.0, 1.0, 0.5);
          vec4 color2 = index2.z > -1 ? texelFetch(material_ColorMaps, ivec3(index2.xyz), 0) : vec4(1.0, 1.0, 1.0, 0.5);
          vec4 color3 = index3.z > -1 ? texelFetch(material_ColorMaps, ivec3(index3.xyz), 0) : vec4(1.0, 1.0, 1.0, 0.5);
          colorMap =
            color0 * cornerWeights.x + color1 * cornerWeights.y +
            color2 * cornerWeights.z + color3 * cornerWeights.w;
          h1 = fetchHeight(index1);
          float h4 = fetchHeight(getIndexCoord(indexPosition + vec2(1.0, 2.0), 2));
          float h5 = fetchHeight(getIndexCoord(indexPosition + vec2(2.0, 1.0), 2));
          float h6 = fetchHeight(getIndexCoord(indexPosition + vec2(2.0, 0.0), 2));
          float h7 = fetchHeight(getIndexCoord(indexPosition + vec2(0.0, 2.0), 2));
          normal0 = normalize(vec3(h0 - h1 + backgroundNoiseDerivatives.x, vertexSpacing(), h0 - h7 + backgroundNoiseDerivatives.y));
          normal1 = normalize(vec3(h1 - h5 + backgroundNoiseDerivatives.x, vertexSpacing(), h1 - h4 + backgroundNoiseDerivatives.y));
          normal2 = normalize(vec3(h2 - h6 + backgroundNoiseDerivatives.x, vertexSpacing(), h2 - h1 + backgroundNoiseDerivatives.y));
          terrainNormal =
            normal0 * cornerWeights.x + normal1 * cornerWeights.y +
            normal2 * cornerWeights.z + normal3 * cornerWeights.w;
        }
        #ifdef TERRAIN_DEBUG
        if (material_DebugView == 17) {
          float debugH1 = fetchHeight(index1);
          float debugH4 = fetchHeight(getIndexCoord(indexPosition + vec2(1.0, 2.0), 2));
          float debugH5 = fetchHeight(getIndexCoord(indexPosition + vec2(2.0, 1.0), 2));
          float debugH6 = fetchHeight(getIndexCoord(indexPosition + vec2(2.0, 0.0), 2));
          float debugH7 = fetchHeight(getIndexCoord(indexPosition + vec2(0.0, 2.0), 2));
          vec3 debugNormal0 = normalize(vec3(h0 - debugH1, vertexSpacing(), h0 - debugH7));
          vec3 debugNormal1 = normalize(vec3(debugH1 - debugH5, vertexSpacing(), debugH1 - debugH4));
          vec3 debugNormal2 = normalize(vec3(h2 - debugH6, vertexSpacing(), h2 - debugH1));
          float jaggedness = max(length(normal3 - debugNormal0), length(normal3 - debugNormal2));
          jaggedness = max(jaggedness, length(normal3 - debugNormal1));
          return vec4(vec3(0.01 + pow(jaggedness, 8.0)), 1.0);
        }
        if (material_DebugView == 1) {
          float height = smoothstep(-0.1, 2.0, 0.5 + varyings.worldPosition.y / 300.0);
          return vec4(vec3(height), 1.0);
        }
        if (material_DebugView == 28) return vec4(colorMap.rgb, 1.0);
        if (material_DebugView == 29) return vec4(vec3(colorMap.a), 1.0);
        if (material_DebugView == 12) return vec4(normalize(terrainNormal) * 0.5 + 0.5, 1.0);
        #endif

        float samplingBias = mix(
          material_MipmapBias,
          material_DepthBlur + 1.0,
          smoothstep(0.0, 1.0, (varyings.cameraDistance - material_BiasDistance) * (1.0 / 1024.0))
        );
        baseDdx *= samplingBias;
        baseDdy *= samplingBias;

        uint raw0 = fetchControl(index0);
        uint raw1 = bilerp ? fetchControl(index1) : raw0;
        uint raw2 = bilerp ? fetchControl(index2) : raw0;
        uint raw3 = fetchControl(index3);
        #ifdef TERRAIN_DEBUG
        if (material_DebugView == 26) {
          return bilerp ? vec4(0.1, 0.9, 0.25, 1.0) : vec4(0.8, 0.12, 0.08, 1.0);
        }
        if (material_DebugView == 3) return vec4(vec3(float(decodeBase(raw3)) / 31.0), 1.0);
        if (material_DebugView == 4) return vec4(vec3(float(decodeOverlay(raw3)) / 31.0), 1.0);
        if (material_DebugView == 5) {
          float autoBlend = 0.0;
          #ifdef TERRAIN_AUTO_SHADER
            autoBlend = clamp(
              material_AutoSlope * 2.0 * (terrainNormal.y - 1.0) + 1.0 -
                material_AutoHeightReduction * 0.01 * varyings.worldPosition.y,
              0.0,
              1.0
            );
          #endif
          return vec4(decodeBlend(raw3), 0.0, autoBlend * float(decodeAuto(raw3) || index3.z < 0), 1.0);
        }
        if (material_DebugView == 6) return vec4(vec3(float((raw3 >> 10u) & 0xfu) / 15.0), 1.0);
        if (material_DebugView == 7) return vec4(vec3(decodeScale(raw3)), 1.0);
        if (material_DebugView == 18) {
          float baseOver = length(fract(varyings.terrainCoord) - 0.5) < decodeBlend(raw3) * 0.45 + 0.1 ? 1.0 : 0.0;
          return vec4(mix(textureIdColor(decodeBase(raw3)), textureIdColor(decodeOverlay(raw3)), baseOver), 1.0);
        }
        if (material_DebugView == 8) {
          return vec4(vec3(float(decodeAuto(raw3) || index3.z < 0)), 1.0);
        }
        if (material_DebugView == 9) {
          return vec4(decodeHole(raw3) ? vec3(1.0, 0.0, 0.2) : vec3(0.08), 1.0);
        }
        #endif
        uvec4 controls = uvec4(raw0, raw1, raw2, raw3);

        #ifdef TERRAIN_AUTO_SHADER
          uint automatic = autoControl(terrainNormal.y, varyings.worldPosition.y);
          controls.x = decodeAuto(controls.x) || index0.z < 0 ? automatic : controls.x;
          controls.y = decodeAuto(controls.y) || index1.z < 0 ? automatic : controls.y;
          controls.z = decodeAuto(controls.z) || index2.z < 0 ? automatic : controls.z;
          controls.w = decodeAuto(controls.w) || index3.z < 0 ? automatic : controls.w;
        #endif

        #ifdef TERRAIN_DEBUG
        if ((material_DebugView >= 22 && material_DebugView <= 25) || material_DebugView == 30) {
          if (material_DebugLayer < 0 || material_DebugLayer >= material_LayerCount) {
            return vec4(1.0, 0.0, 1.0, 1.0);
          }
          vec2 samplePosition;
          vec2 sampleUv;
          vec4 derivatives;
          vec2 controlCosineSine;
          mat2 projectionAlignment;
          prepareMaterialCoordinates(
            baseDdx,
            baseDdy,
            indexPosition,
            controls.w,
            normal3,
            h3,
            varyings.worldPosition,
            samplePosition,
            sampleUv,
            derivatives,
            controlCosineSine,
            projectionAlignment
          );
          float layerScale = material_LayerUvScales[material_DebugLayer];
          vec2 detileCell;
          vec2 detiledUv;
          vec2 detiledCosineSine;
          vec4 detiledDerivatives;
          prepareLayerSample(
            material_DebugLayer,
            layerScale,
            samplePosition,
            sampleUv,
            derivatives,
            controlCosineSine,
            detileCell,
            detiledUv,
            detiledCosineSine,
            detiledDerivatives
          );
          if (material_DebugView == 30) {
            vec2 cellLocal = fract(samplePosition * layerScale + vec2(0.5)) - vec2(0.5);
            vec2 perpendicular = vec2(-detiledCosineSine.y, detiledCosineSine.x);
            float axisLine = 1.0 - smoothstep(0.0, 0.018, abs(dot(cellLocal, perpendicular)));
            float border = cellEdge(fract(samplePosition * layerScale + vec2(0.5)));
            vec3 direction = vec3(detiledCosineSine * 0.5 + 0.5, 0.2);
            return vec4(mix(direction, vec3(1.0), max(axisLine, border)), 1.0);
          }
          if (material_DebugView == 22) {
            float cellHash = randomCell(detileCell);
            vec3 cellColor = vec3(
              fract(cellHash * 11.17),
              fract(cellHash * 31.73),
              fract(cellHash * 47.29)
            );
            return vec4(mix(cellColor, vec3(1.0), cellEdge(fract(samplePosition * layerScale + vec2(0.5)))), 1.0);
          }
          if (material_DebugView == 23) {
            float mip = log2(max(length(detiledDerivatives.xy), length(detiledDerivatives.zw)) *
              float(textureSize(material_LayerAlbedoArray, 0).x));
            float normalizedMip = clamp((mip + 1.0) * 0.1, 0.0, 1.0);
            return vec4(normalizedMip, normalizedMip * normalizedMip, 1.0 - normalizedMip, 1.0);
          }
          vec4 debugAlbedo;
          if (material_DebugView == 24) {
            vec4 sourceDerivatives = derivatives * layerScale;
            sourceDerivatives.xy = rotateVector(sourceDerivatives.xy, controlCosineSine);
            sourceDerivatives.zw = rotateVector(sourceDerivatives.zw, controlCosineSine);
            debugAlbedo = textureGrad(
              material_LayerAlbedoArray,
              vec3(sampleUv * layerScale - vec2(0.5), float(material_DebugLayer)),
              sourceDerivatives.xy,
              sourceDerivatives.zw
            );
          } else {
            debugAlbedo = textureGrad(
              material_LayerAlbedoArray,
              vec3(detiledUv, float(material_DebugLayer)),
              detiledDerivatives.xy,
              detiledDerivatives.zw
            );
          }
          return vec4(debugAlbedo.rgb * material_LayerColors[material_DebugLayer], 1.0);
        }
        #endif

        ivec2 ids0 = ivec2(decodeBase(controls.x), decodeOverlay(controls.x));
        ivec2 ids1 = ivec2(decodeBase(controls.y), decodeOverlay(controls.y));
        ivec2 ids2 = ivec2(decodeBase(controls.z), decodeOverlay(controls.z));
        ivec2 ids3 = ivec2(decodeBase(controls.w), decodeOverlay(controls.w));
        vec2 weights0 = vec2(1.0 - decodeBlend(controls.x), decodeBlend(controls.x));
        vec2 weights1 = vec2(1.0 - decodeBlend(controls.y), decodeBlend(controls.y));
        vec2 weights2 = vec2(1.0 - decodeBlend(controls.z), decodeBlend(controls.z));
        vec2 weights3 = vec2(1.0 - decodeBlend(controls.w), decodeBlend(controls.w));
        if (bilerp) {
          weights0 = collectWeights(controls, cornerWeights, ids0);
          weights1 = collectWeights(controls, cornerWeights, ids1);
          weights2 = collectWeights(controls, cornerWeights, ids2);
          weights3 = collectWeights(controls, cornerWeights, ids3);
        }

        TerrainSurface surface;
        surface.albedoHeight = vec4(0.0);
        surface.normalRoughness = vec4(0.0);
        surface.normalDepth = 0.0;
        surface.aoStrength = 0.0;
        surface.totalWeight = 0.0;
        accumulateMaterial(
          baseDdx,
          baseDdy,
          cornerWeights.w,
          indexPosition,
          controls.w,
          weights3,
          ids3,
          normal3,
          h3,
          varyings.worldPosition,
          surface
        );
        if (bilerp) {
          accumulateMaterial(
            baseDdx,
            baseDdy,
            cornerWeights.z,
            indexPosition + vec2(1.0, 0.0),
            controls.z,
            weights2,
            ids2,
            normal2,
            h2,
            varyings.worldPosition,
            surface
          );
          accumulateMaterial(
            baseDdx,
            baseDdy,
            cornerWeights.y,
            indexPosition + vec2(1.0, 1.0),
            controls.y,
            weights1,
            ids1,
            normal1,
            h1,
            varyings.worldPosition,
            surface
          );
          accumulateMaterial(
            baseDdx,
            baseDdy,
            cornerWeights.x,
            indexPosition + vec2(0.0, 1.0),
            controls.x,
            weights0,
            ids0,
            normal0,
            h0,
            varyings.worldPosition,
            surface
          );
        }
        float inverseWeight = 1.0 / max(surface.totalWeight, 0.000001);
        surface.albedoHeight *= inverseWeight;
        surface.normalRoughness *= inverseWeight;
        surface.normalDepth *= inverseWeight;
        surface.aoStrength *= inverseWeight;
        #ifdef TERRAIN_DEBUG
        if (material_DebugView == 19) return vec4(vec3(surface.albedoHeight.a), 1.0);
        if (material_DebugView == 20) {
          return vec4(normalize(surface.normalRoughness.xzy) * 0.5 + 0.5, 1.0);
        }
        if (material_DebugView == 21) return vec4(vec3(surface.normalRoughness.a), 1.0);
        #endif

        vec3 macroVariation = vec3(1.0);
        #ifdef TERRAIN_MACRO_VARIATION
          vec2 noiseCosineSine = vec2(cos(material_Noise1Angle), sin(material_Noise1Angle));
          float noise1 = texture(
            material_MacroNoise,
            rotateVector(varyings.terrainCoord * material_Noise1Scale * 0.1 + material_Noise1Offset, noiseCosineSine)
          ).r;
          float noise2 = texture(material_MacroNoise, varyings.terrainCoord * material_Noise2Scale * 0.1).r;
          macroVariation = mix(material_MacroColor1, vec3(1.0), noise1);
          macroVariation *= mix(material_MacroColor2, vec3(1.0), noise2);
          macroVariation = mix(vec3(1.0), macroVariation, clamp(terrainNormal.y + material_MacroSlope, 0.0, 1.0));
        #endif

        vec3 albedo = surface.albedoHeight.rgb * colorMap.rgb * macroVariation;
        #if !defined(TERRAIN_DIRECT_LIGHTING) && !defined(TERRAIN_INDIRECT_LIGHTING)
          return vec4(albedo, 1.0);
        #endif
        vec3 normalMap = surface.normalRoughness.xyz;
        normalMap.xz *= surface.normalDepth;
        vec3 worldTangent = normalize(baseDdx);
        vec3 worldBitangent = -normalize(baseDdy);
        vec3 shadingNormal = normalize(
          worldTangent * normalMap.x + worldBitangent * normalMap.z + terrainNormal * normalMap.y
        );
        float roughness = clamp(
          (colorMap.a - 0.5) * 2.0 + surface.normalRoughness.a,
          0.0,
          1.0
        );
        vec3 lighting = vec3(0.0);
        #ifdef TERRAIN_DIRECT_LIGHTING
          float shadowAttenuation = 1.0;
          #if defined(SCENE_DIRECT_LIGHT_COUNT) && defined(NEED_CALCULATE_SHADOWS)
            shadowAttenuation = sampleShadowMap(
              varyings.worldPosition,
              getShadowCoord(varyings.worldPosition)
            );
          #endif
          #ifdef SCENE_DIRECT_LIGHT_COUNT
            if (!isRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[0])) {
              DirectLight directLight = getDirectLight(0);
              vec3 lightDirection = -directLight.direction;
              float lambert = saturate(dot(shadingNormal, lightDirection));
              vec3 halfDirection = normalize(lightDirection + normalize(camera_Position - varyings.worldPosition));
              float specular = saturate(dot(shadingNormal, halfDirection));
              specular *= specular;
              specular *= specular * (1.0 - roughness) * 0.06;
              lighting += directLight.color * shadowAttenuation * (albedo * lambert + vec3(specular));
            }
          #endif
        #endif
        #ifdef TERRAIN_INDIRECT_LIGHTING
          float terrainAO = (1.0 - (surface.albedoHeight.a * log(2.1 - surface.aoStrength))) *
            (1.0 - surface.normalRoughness.y);
          float ambientOcclusion = clamp(
            1.0 - terrainAO * surface.aoStrength,
            surface.albedoHeight.a,
            1.0
          );
          lighting += albedo * ambientOcclusion * diffuseIrradiance(shadingNormal) * scene_EnvMapLight.diffuseIntensity / PI;
        #endif
        return vec4(lighting, 1.0);
      }

      void frag(Varyings varyings) {
        gl_FragColor = shadeTerrain(varyings);
      }
    }
  }
}
