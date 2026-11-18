
Shader "World/VolumetricClouds" {
  SubShader "Default" {
    Pass "DirectionCacheUpdate" {
      DepthState = { Enabled = false; WriteEnabled = false; }
      RasterState = { CullMode = CullMode.Off; }
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Blit/BlitVertex.glsl"

      mediump sampler2D material_WeatherMap;
      mediump sampler2D material_ShapeProfile;
      mediump sampler2D material_NoiseAtlas;
      mediump sampler2DArray material_DetailNoise;
      mediump sampler2D material_CurlNoise;
      mediump sampler2D material_BlueNoise;
      mediump sampler2D material_MultipleScatteringLUT;
      mediump sampler2D material_DirectionPreviousCache;
      mediump sampler2D material_DirectionPreviousMetadata;
      vec3 material_SunDirection;
      vec3 material_Zenith;
      vec3 material_Horizon;
      vec3 material_CloudLight;
      vec3 material_CloudShadow;
      vec3 material_EdgeLightColor;
      vec3 material_DirectionHistoryMotion;
      vec4 material_HistoryTexelSize;
      float material_Time;
      vec3 material_WindOffsetWS;
      vec3 material_WindVelocityWS;
      float material_MaxSteps;
      float material_DetailLodDistance;
      float material_BlueNoiseIntensity;
      float material_LightSteps;
      float material_LightDetailSteps;
      float material_CloudDensity;
      float material_Coverage;
      float material_CloudType;
      float material_WeatherDetail;
      float material_Storm;
      float material_PlanetRadius;
      float material_ObserverAltitude;
      float material_CloudBaseAltitude;
      float material_CloudThickness;
      float material_WeatherScale;
      float material_ShapeScale;
      float material_DetailScale;
      float material_ShapeVerticalFrequency;
      float material_DetailVerticalFrequency;
      float material_FrameJitter;
      float material_DirectionCheckerParity;
      float material_DirectionHistoryValid;
      float material_DirectionHistoryWeight;
      float material_HorizonStepMultiplier;
      float material_CacheHDRCompression;
      float material_MultipleScatteringLUTDecodeScale;
      float material_BottomShape;
      float material_MiddleShape;
      float material_TopShape;
      float material_RampShape;
      float material_CloudTypeShaping;
      float material_BaseErosionIntensity;
      float material_BaseNoiseMultiplier;
      float material_DetailErosionScale;
      float material_MaxDetailErosion;
      float material_DetailNoiseMultiplier;
      float material_CurlIntensity;
      float material_TopDensityMultiplier;
      float material_TopSkewRatio;
      float material_LightMarchDistanceScale;
      float material_StormExtinctionMultiplier;
      float material_InscatteringDensityScale;
      float material_MultipleScatteringMinimum;
      float material_DirectionalEnergyScale;
      float material_DirectionalEnergyCompression;
      float material_AmbientSkyBottom;
      float material_AmbientSkyTop;
      float material_AmbientGroundBottom;
      float material_AmbientGroundTop;
      float material_PowderDensityScale;
      float material_PowderDirectMinimum;
      float material_PowderDirectMaximum;
      float material_ExtinctionEdgeStart;
      float material_ExtinctionEdgeEnd;
      float material_ExtinctionScale;
      float material_DensitySmoothness;
      float material_EdgeLightIntensity;


      const float CLOUD_NUMERIC_EPSILON = 0.0001;
      const float CLOUD_SCALE_EPSILON = 0.000001;
      const float CLOUD_WEIGHT_EPSILON = 0.00001;
      const float CLOUD_GEOMETRY_EPSILON = 0.001;
      const float CLOUD_FOUR_PI = 12.5663706144;
      const float CLOUD_PHASE_DENOMINATOR_EXPONENT = 1.5;

      vec3 material_SolarHorizonTint;
      vec3 material_SunRadianceColor;
      float material_BlueNoiseWidth;
      float material_BlueNoiseHeight;
      float material_DetailNoiseDepth;
      float material_DetailNoiseMaxMip;
      float material_NoiseWeightLow;
      float material_NoiseWeightMiddle;
      float material_NoiseWeightHigh;
      float material_WeatherCoverageDilation;
      float material_WeatherTypeNoiseCenter;
      float material_WeatherTypeNoiseAmplitude;
      float material_WeatherTopCloudExponent;
      float material_WeatherTopCoveragePowerScale;
      float material_ProfileTypeOffset;
      float material_BottomBandStart;
      float material_BottomBandEnd;
      float material_MiddleBandStart;
      float material_MiddleBandEnd;
      float material_TopBandStart;
      float material_TopBandEnd;
      float material_EnvelopeScale;
      float material_BottomFadeExponent;
      float material_BottomFadeStrength;
      float material_TopFadeExponent;
      float material_TopFadeStrength;
      float material_TopCutoff;
      float material_DetailAnimationSpeed;
      float material_DetailCurlFrequency;
      float material_DetailCurlBlend;
      float material_DetailCurlExponent;
      float material_DetailVerticalCurlStrength;
      float material_DetailLodNearDistance;
      float material_DetailLodFarDistance;
      float material_DetailHeightErosionScale;
      float material_LightStepPattern0;
      float material_LightStepPattern1;
      float material_LightStepPattern2;
      float material_LightStepPattern3;
      float material_LightStepPattern4;
      float material_LightStepPattern5;
      float material_PhaseForwardAnisotropy;
      float material_PhaseBackwardAnisotropy;
      float material_PhaseBlend;
      float material_MultipleScatteringMaxOpticalDepth;
      float material_SingleScatteringAlbedo;
      float material_AmbientSkyColorBlend;
      float material_AmbientGroundColorBlend;
      float material_AmbientShadowStrength;
      float material_StormAmbientMultiplier;
      float material_CachePhaseIsotropyBlend;
      float material_CacheAmbientWeight;
      float material_CacheExposureScale;
      float material_CacheExposureMinimum;
      float material_CacheExposureMaximum;
      float material_CacheEncodingGamma;
      float material_SkyGradientStart;
      float material_SkyGradientEnd;
      float material_SkyGradientExponent;
      float material_HorizonGlowFalloff;
      float material_HorizonGlowStrength;
      float material_SolarHorizonPower;
      float material_SolarHorizonStrength;
      float material_SunDiscStart;
      float material_SunDiscEnd;
      float material_SunDiscStrength;
      float material_SunHaloPower;
      float material_SunHaloStrength;
      float material_SunHorizonFadeStart;
      float material_SunHorizonFadeEnd;
      float material_MaxHorizonSteps;
      float material_HorizonFadeStart;
      float material_HorizonFadeEnd;
      float material_HorizonStepStart;
      float material_HorizonStepEnd;
      float material_RayStartOffset;
      float material_TransmittanceCutoff;
      float material_DensityCutoff;
      float material_WeatherPresenceCutoff;
      float material_EmptySpaceWeatherThreshold;
      float material_EmptySpaceStepMultiplier;
      float material_InitialWeightedCenter;


      const float CLOUD_ISOTROPIC_PHASE = 1.0 / CLOUD_FOUR_PI;

      float cloudHenyeyGreenstein(float cosine, float g) {
        float g2 = g * g;
        return (1.0 - g2) /
          (CLOUD_FOUR_PI * pow(max(1.0 + g2 - 2.0 * g * cosine, CLOUD_NUMERIC_EPSILON), CLOUD_PHASE_DENOMINATOR_EXPONENT));
      }

      float cloudDualPhase(float cosine, float anisotropyScale) {
        return mix(
          cloudHenyeyGreenstein(cosine, material_PhaseForwardAnisotropy * anisotropyScale),
          cloudHenyeyGreenstein(cosine, material_PhaseBackwardAnisotropy * anisotropyScale),
          material_PhaseBlend
        );
      }

      float cloudMaxComponent(vec3 value) {
        return max(value.r, max(value.g, value.b));
      }

      float cloudCachePhaseTerm(vec3 ray) {
        float relativePhase = cloudDualPhase(dot(ray, normalize(material_SunDirection)), 1.0) / CLOUD_ISOTROPIC_PHASE;
        return mix(relativePhase, 1.0, material_CachePhaseIsotropyBlend);
      }

      float cloudCachePreExposure() {
        float direct = cloudMaxComponent(material_CloudLight);
        float ambient = max(cloudMaxComponent(material_Zenith), cloudMaxComponent(material_Horizon));
        return clamp(
          (direct + ambient * material_CacheAmbientWeight) * material_CacheExposureScale,
          material_CacheExposureMinimum,
          material_CacheExposureMaximum
        );
      }

      vec3 encodeCloudRadiance(vec3 radiance, vec3 ray) {
        if (material_CacheHDRCompression < 0.5) return max(radiance, vec3(0.0));
        float normalization = max(cloudCachePhaseTerm(ray) * cloudCachePreExposure(), CLOUD_NUMERIC_EPSILON);
        return pow(
          clamp(radiance / normalization, vec3(0.0), vec3(1.0)),
          vec3(1.0 / material_CacheEncodingGamma)
        );
      }

      vec3 decodeCloudRadiance(vec3 encodedRadiance, vec3 ray) {
        if (material_CacheHDRCompression < 0.5) return max(encodedRadiance, vec3(0.0));
        return pow(max(encodedRadiance, vec3(0.0)), vec3(material_CacheEncodingGamma)) *
          cloudCachePhaseTerm(ray) * cloudCachePreExposure();
      }


      float remap(float value, float oldMin, float oldMax, float newMin, float newMax) {
        return newMin + (clamp(value, oldMin, oldMax) - oldMin) /
          max(oldMax - oldMin, CLOUD_NUMERIC_EPSILON) * (newMax - newMin);
      }

      vec2 atlasUv(vec2 xy, float slice) {
        float wrappedSlice = mod(slice, 64.0);
        vec2 tile = vec2(
          mod(wrappedSlice, 8.0),
          floor(wrappedSlice / 8.0)
        );
        vec2 withinTile =
          (fract(xy) * 31.0 + 0.5) /
          32.0;
        return (tile + withinTile) / 8.0;
      }

      vec4 sampleNoise3D(vec3 position) {
        vec3 wrapped = fract(position);
        float depth = wrapped.z * 64.0;
        float lowSlice = floor(depth);
        float blend = fract(depth);
        vec4 low = texture2D(material_NoiseAtlas, atlasUv(wrapped.xy, lowSlice));
        vec4 high = texture2D(material_NoiseAtlas, atlasUv(wrapped.xy, lowSlice + 1.0));
        return mix(low, high, blend);
      }

      vec3 sampleDetailMip(vec3 position, float mipLevel) {
        vec3 wrapped = fract(position);
        float depth = max(material_DetailNoiseDepth / exp2(mipLevel), 1.0);
        float slice = wrapped.z * depth;
        float lowSlice = floor(slice);
        float blend = fract(slice);
        vec3 low = textureLod(material_DetailNoise, vec3(wrapped.xy, mod(lowSlice, depth)), mipLevel).rgb;
        vec3 high = textureLod(material_DetailNoise, vec3(wrapped.xy, mod(lowSlice + 1.0, depth)), mipLevel).rgb;
        return mix(low, high, blend);
      }

      vec3 sampleDetail3D(vec3 position, float lod) {
        float clampedLod = clamp(lod, 0.0, material_DetailNoiseMaxMip);
        float lowMip = floor(clampedLod);
        float highMip = min(lowMip + 1.0, material_DetailNoiseMaxMip);
        return mix(sampleDetailMip(position, lowMip), sampleDetailMip(position, highMip), fract(clampedLod));
      }

      float detailLod(float distanceToCamera) {
        float farMip = mix(material_DetailNoiseMaxMip, 0.0, material_DetailLodDistance);
        return farMip * smoothstep(
          material_DetailLodNearDistance,
          material_DetailLodFarDistance,
          distanceToCamera
        );
      }

      vec2 raySphere(vec3 origin, vec3 direction, vec3 center, float radius) {
        vec3 offset = origin - center;
        float projection = dot(offset, direction);
        float observerRadius = length(offset);
        float discriminant = projection * projection + (radius - observerRadius) * (radius + observerRadius);
        float safeRoot = sqrt(max(discriminant, 0.0));
        return vec2(-projection - safeRoot, -projection + safeRoot);
      }

      float sampleCloudProfile(float height, float cloudType) {
        float profileU =
          (clamp(cloudType + material_ProfileTypeOffset, 0.0, 1.0) *
            2.0 + 0.5) /
          3.0;
        vec4 gradient = texture2D(material_ShapeProfile, vec2(profileU, 0.5));
        return smoothstep(gradient.r, gradient.g, height) - smoothstep(gradient.b, gradient.a, height);
      }

      float cloudVerticalShape(float height) {
        float bottom = smoothstep(material_BottomBandStart, material_BottomBandEnd, height) *
          (1.0 - smoothstep(
            material_BottomBandStart + material_RampShape,
            material_BottomBandEnd + material_RampShape,
            height
          ));
        float middle = smoothstep(material_MiddleBandStart, material_MiddleBandEnd, height) *
          (1.0 - smoothstep(
            material_MiddleBandStart + material_RampShape,
            material_MiddleBandEnd + material_RampShape,
            height
          ));
        float top = smoothstep(material_TopBandStart, material_TopBandEnd, height) *
          (1.0 - smoothstep(
            material_TopBandStart + material_RampShape,
            material_TopBandEnd + material_RampShape,
            height
          ));
        float weight = max(bottom + middle + top, CLOUD_WEIGHT_EPSILON);
        bottom /= weight;
        middle /= weight;
        top /= weight;
        float envelope = 1.0 +
          (material_BottomShape * bottom + material_MiddleShape * middle + material_TopShape * top) *
          material_EnvelopeScale;
        envelope *= mix(
          1.0,
          1.0 - exp(-height * material_BottomFadeExponent),
          material_BottomFadeStrength * bottom
        );
        envelope *= mix(
          1.0,
          1.0 - exp(-(1.0 - height) * material_TopFadeExponent),
          material_TopFadeStrength * top
        );
        return height > material_TopCutoff ? 0.0 : max(envelope, 0.0);
      }

      vec3 cloudWindDisplacement() {
        // Eulerian advection is rho(x, t) = rho0(x - integral(v dt)). Sampling with the positive
        // offset moves the visible density against the physical wind vector used by trees and
        // ground vegetation.
        return vec3(-material_WindOffsetWS.x, 0.0, -material_WindOffsetWS.z);
      }

      vec4 sampleWeather(vec3 position) {
        vec2 uv = fract(position.xz * material_WeatherScale);
        vec4 basis = texture2D(material_WeatherMap, uv);
        float coverage = clamp(material_Coverage, 0.0, 1.0);
        float resolvedCoverage = coverage <= 0.0 ? 0.0 : clamp(
          (basis.a - (1.0 - coverage)) / max(coverage, CLOUD_NUMERIC_EPSILON),
          0.0,
          1.0
        );
        float cloudType = clamp(
          material_CloudType +
            (sqrt(max(basis.r, 0.0)) - material_WeatherTypeNoiseCenter) *
            material_WeatherTypeNoiseAmplitude,
          0.0,
          1.0
        );
        float topClouds = resolvedCoverage * clamp(
          pow(basis.g * basis.r, material_WeatherTopCloudExponent) +
            pow(resolvedCoverage, material_WeatherTopCoveragePowerScale),
          0.0,
          1.0
        );
        return vec4(resolvedCoverage, cloudType, topClouds, sqrt(topClouds));
      }

      float baseDensityAtWithWeather(vec3 position, vec3 center, vec4 weather, out float height) {
        float innerRadius = material_PlanetRadius + material_CloudBaseAltitude;
        height = clamp((length(position - center) - innerRadius) / material_CloudThickness, 0.0, 1.0);
        vec3 advectedPosition = position + cloudWindDisplacement();
        if (weather.r < material_WeatherPresenceCutoff) return 0.0;
        float horizontalWindSpeed = length(material_WindVelocityWS.xz);
        vec3 windDirection = horizontalWindSpeed > CLOUD_SCALE_EPSILON
          ? vec3(material_WindVelocityWS.x / horizontalWindSpeed, 0.0, material_WindVelocityWS.z / horizontalWindSpeed)
          : vec3(-0.9486832980505138, 0.0, -0.31622776601683794);
        advectedPosition += height * windDirection * (material_CloudThickness * material_TopSkewRatio);
        vec3 shapeCoord = vec3(
          advectedPosition.x * material_ShapeScale,
          height * material_ShapeVerticalFrequency,
          advectedPosition.z * material_ShapeScale
        );
        vec4 noise = sampleNoise3D(shapeCoord);
        float lowFrequencyFbm = clamp(
          noise.g * material_NoiseWeightLow +
          noise.b * material_NoiseWeightMiddle +
          noise.a * material_NoiseWeightHigh,
          0.0,
          1.0
        );
        float baseShape = remap(
          clamp(noise.r * material_BaseNoiseMultiplier, 0.0, 1.0),
          -(1.0 - lowFrequencyFbm) * material_BaseErosionIntensity,
          1.0,
          0.0,
          1.0
        );
        float shaped = baseShape * cloudVerticalShape(height);
        shaped *= mix(1.0, sampleCloudProfile(height, weather.g), material_CloudTypeShaping);
        float coverageThreshold = 1.0 - (height > material_TopCutoff ? weather.b : weather.r);
        return remap(shaped, coverageThreshold, 1.0, 0.0, 1.0);
      }

      float detailDensityAt(
        vec3 position,
        float distanceToCamera,
        float height,
        float covered
      ) {
        vec3 advectedPosition = position + cloudWindDisplacement();
        vec3 detailCoord = vec3(
          advectedPosition.x * material_DetailScale,
          height * material_DetailVerticalFrequency + material_Time * material_DetailAnimationSpeed,
          advectedPosition.z * material_DetailScale
        );
        float curlFade = clamp(
          1.0 - distanceToCamera / material_DetailLodFarDistance,
          0.0,
          1.0
        );
        vec2 curlA = texture2D(material_CurlNoise, fract(detailCoord.xz * material_DetailCurlFrequency)).rb;
        vec2 curlB = texture2D(material_CurlNoise, fract(detailCoord.xy * material_DetailCurlFrequency)).rb;
        vec2 curl = pow(
          max(mix(curlA, curlB, material_DetailCurlBlend), vec2(0.0)),
          vec2(material_DetailCurlExponent)
        );
        curl *= material_CurlIntensity * curlFade * sqrt(max(1.0 - height, 0.0));
        detailCoord.xz += curl;
        detailCoord.y += curl.y * material_DetailVerticalCurlStrength;
        vec3 detailNoise =
          sampleDetail3D(detailCoord, detailLod(distanceToCamera)) * material_DetailNoiseMultiplier;
        float highFrequencyFbm =
          detailNoise.r * material_NoiseWeightLow +
          detailNoise.g * material_NoiseWeightMiddle +
          detailNoise.b * material_NoiseWeightHigh;
        float heightErosion = mix(
          highFrequencyFbm,
          1.0 - highFrequencyFbm,
          clamp(height * material_DetailHeightErosionScale, 0.0, 1.0)
        );
        float erosion = heightErosion * clamp(
          material_WeatherDetail * material_DetailErosionScale,
          0.0,
          material_MaxDetailErosion
        );
        float eroded = remap(covered, erosion, 1.0, 0.0, 1.0);
        return max(0.0, eroded) *
          (height > material_TopCutoff ? material_TopDensityMultiplier : 1.0) *
          material_CloudDensity;
      }

      float densityAtWithWeather(
        vec3 position,
        vec3 center,
        float distanceToCamera,
        vec4 weather,
        out float height,
        out float coarseDensity
      ) {
        float covered = baseDensityAtWithWeather(position, center, weather, height);
        coarseDensity = max(covered, 0.0) * material_CloudDensity;
        if (covered <= 0.0) return 0.0;
        return detailDensityAt(position, distanceToCamera, height, covered);
      }

      float densityAt(
        vec3 position,
        vec3 center,
        float distanceToCamera,
        out float height,
        out vec4 weather,
        out float coarseDensity
      ) {
        weather = sampleWeather(position + cloudWindDisplacement());
        return densityAtWithWeather(position, center, distanceToCamera, weather, height, coarseDensity);
      }

      float extinctionOpticalDepth(float density, float pathLength) {
        return pow(max(density, 0.0), material_DensitySmoothness) * pathLength * material_ExtinctionScale *
          mix(1.0, material_StormExtinctionMultiplier, material_Storm);
      }

      float coarseLightDensityAt(vec3 position, vec3 center) {
        vec4 weather = sampleWeather(position + cloudWindDisplacement());
        float height;
        float covered = baseDensityAtWithWeather(position, center, weather, height);
        if (covered <= 0.0) return 0.0;
        return covered *
          (height > material_TopCutoff ? material_TopDensityMultiplier : 1.0) *
          material_CloudDensity;
      }

      float lightStepPattern(int lightStep) {
        if (lightStep == 0) return material_LightStepPattern0;
        if (lightStep == 1) return material_LightStepPattern1;
        if (lightStep == 2) return material_LightStepPattern2;
        if (lightStep == 3) return material_LightStepPattern3;
        if (lightStep == 4) return material_LightStepPattern4;
        return material_LightStepPattern5;
      }

      float lightStepPatternSum(float lightSteps) {
        float patternSum = 0.0;
        for (int lightStep = 0; lightStep < 6; lightStep++) {
          if (float(lightStep) >= lightSteps) break;
          patternSum += lightStepPattern(lightStep);
        }
        return patternSum;
      }

      float lightOpticalDepth(vec3 position, vec3 center, vec3 sunDirection) {
        float opticalDepth = 0.0;
        float distanceTraveled = 0.0;
        float innerRadius = material_PlanetRadius + material_CloudBaseAltitude;
        float outerRadius = innerRadius + material_CloudThickness;
        vec3 relativePosition = position - center;
        float projectedDistance = dot(relativePosition, sunDirection);
        float outerDiscriminant = projectedDistance * projectedDistance -
          (dot(relativePosition, relativePosition) - outerRadius * outerRadius);
        float shellExitDistance = max(
          -projectedDistance + sqrt(max(outerDiscriminant, 0.0)),
          0.0
        );
        float marchDistance = min(
          shellExitDistance,
          material_CloudThickness * material_LightMarchDistanceScale
        );
        float patternSum = lightStepPatternSum(material_LightSteps);
        for (int lightStep = 0; lightStep < 6; lightStep++) {
          if (float(lightStep) >= material_LightSteps) break;
          float segmentLength = marchDistance * lightStepPattern(lightStep) / patternSum;
          float sampleDistance = distanceTraveled + segmentLength * 0.5;
          vec3 samplePosition = position + sunDirection * sampleDistance;
          float sampleDensity;
          if (float(lightStep) < material_LightDetailSteps) {
            float sampleHeight;
            vec4 sampleWeatherField;
            float sampleCoarseDensity;
            sampleDensity = densityAt(
              samplePosition,
              center,
              length(samplePosition),
              sampleHeight,
              sampleWeatherField,
              sampleCoarseDensity
            );
          } else {
            sampleDensity = coarseLightDensityAt(samplePosition, center);
          }
          opticalDepth += extinctionOpticalDepth(sampleDensity, segmentLength);
          distanceTraveled += segmentLength;
          if (opticalDepth >= material_MultipleScatteringMaxOpticalDepth) break;
        }
        return min(opticalDepth, material_MultipleScatteringMaxOpticalDepth);
      }

      float multipleScatteringLUT(float viewSunCosine, float opticalDepth) {
        vec2 sampleUv = vec2(
          (clamp(opticalDepth / material_MultipleScatteringMaxOpticalDepth, 0.0, 1.0) *
            15.0 + 0.5) /
            16.0,
          ((clamp(viewSunCosine, -1.0, 1.0) * 0.5 + 0.5) *
            7.0 + 0.5) /
            8.0
        );
        return texture2D(material_MultipleScatteringLUT, sampleUv).r * material_MultipleScatteringLUTDecodeScale;
      }

      float directionalScattering(float viewSunCosine, float opticalDepth, float coarseDensity) {
        float single = exp(-opticalDepth) * cloudDualPhase(viewSunCosine, 1.0) *
          material_SingleScatteringAlbedo;
        float inscatteringProbability =
          1.0 - exp(-max(coarseDensity, 0.0) * material_InscatteringDensityScale);
        float multiple = multipleScatteringLUT(viewSunCosine, opticalDepth);
        multiple *= mix(material_MultipleScatteringMinimum, 1.0, inscatteringProbability);
        float relativeScattering = max((single + multiple) / CLOUD_ISOTROPIC_PHASE, 0.0);
        return material_DirectionalEnergyScale * relativeScattering /
          (1.0 + relativeScattering * material_DirectionalEnergyCompression);
      }

      vec3 cloudAmbient(float height, float density) {
        vec3 skyAmbient = mix(material_Horizon, material_Zenith, material_AmbientSkyColorBlend) *
          mix(material_AmbientSkyBottom, material_AmbientSkyTop, height);
        vec3 groundAmbient = mix(material_CloudShadow, material_Horizon, material_AmbientGroundColorBlend) *
          mix(material_AmbientGroundBottom, material_AmbientGroundTop, height);
        float localExtinction = extinctionOpticalDepth(density, 1.0) *
          (1.0 - material_SingleScatteringAlbedo * max(material_PhaseForwardAnisotropy, 0.0));
        float skyVisibility = exp(-localExtinction * material_CloudThickness * (1.0 - height));
        float groundVisibility = exp(-localExtinction * material_CloudThickness * height);
        float lateralVisibility = sqrt(skyVisibility * groundVisibility);
        return (
          skyAmbient * skyVisibility +
          groundAmbient * groundVisibility +
          material_CloudShadow * material_AmbientShadowStrength * lateralVisibility
        ) *
          mix(1.0, material_StormAmbientMultiplier, material_Storm);
      }

      void raymarchClouds(vec3 ray, out vec3 color, out float alpha, out float normalizedWeightedCenter) {
        color = vec3(0.0);
        alpha = 0.0;
        normalizedWeightedCenter = material_InitialWeightedCenter;
        float horizonFade = smoothstep(material_HorizonFadeStart, material_HorizonFadeEnd, ray.y);
        vec3 center = vec3(0.0, -(material_PlanetRadius + material_ObserverAltitude), 0.0);
        float innerRadius = material_PlanetRadius + material_CloudBaseAltitude;
        vec2 innerHit = raySphere(vec3(0.0), ray, center, innerRadius);
        vec2 outerHit = raySphere(vec3(0.0), ray, center, innerRadius + material_CloudThickness);
        float startDistance = max(0.0, innerHit.y);
        float endDistance = outerHit.y;
        float valid = step(CLOUD_GEOMETRY_EPSILON, horizonFade) *
          step(startDistance + CLOUD_GEOMETRY_EPSILON, endDistance);
        if (valid > 0.5) {
          float horizonStepFactor = 1.0 - smoothstep(material_HorizonStepStart, material_HorizonStepEnd, ray.y);
          float stepBudget = mix(
            material_MaxSteps,
            min(material_MaxHorizonSteps, material_MaxSteps * material_HorizonStepMultiplier),
            horizonStepFactor
          );
          float baseStep = (endDistance - startDistance) / max(stepBudget, 1.0);
          vec2 blueUv = fract(
            (gl_FragCoord.xy + vec2(17.0, 31.0) *
              material_FrameJitter) /
            vec2(material_BlueNoiseWidth, material_BlueNoiseHeight)
          );
          float blueNoise = fract(texture2D(material_BlueNoise, blueUv).r + material_FrameJitter);
          float distanceAlongRay =
            startDistance + baseStep * (material_RayStartOffset + blueNoise * material_BlueNoiseIntensity);
          float transmittance = 1.0;
          float weightedDistance = 0.0;
          float accumulatedWeight = 0.0;
          for (int stepIndex = 0; stepIndex < 96; stepIndex++) {
            if (
              float(stepIndex) >= stepBudget ||
              distanceAlongRay >= endDistance ||
              transmittance < material_TransmittanceCutoff
            ) break;
            vec3 position = ray * distanceAlongRay;
            float height;
            vec4 weather;
            float coarseDensity;
            float density = densityAt(position, center, distanceAlongRay, height, weather, coarseDensity);
            if (density > material_DensityCutoff) {
              float sampleAlpha = 1.0 - exp(-extinctionOpticalDepth(density, baseStep));
              vec3 sunDirection = normalize(material_SunDirection);
              float opticalDepth = lightOpticalDepth(position, center, sunDirection);
              float directEnergy = directionalScattering(dot(ray, sunDirection), opticalDepth, coarseDensity);
              float powder = 1.0 - exp(-density * material_PowderDensityScale);
              vec3 sampleColor = cloudAmbient(height, density);
              sampleColor += material_CloudLight * directEnergy *
                mix(material_PowderDirectMinimum, material_PowderDirectMaximum, powder);
              float edgeLightMask = directEnergy *
                (1.0 - smoothstep(material_ExtinctionEdgeStart, material_ExtinctionEdgeEnd, density));
              // Edge lighting is scattered source radiance, never an emissive term. Scaling by
              // the active celestial source prevents a below-horizon Sun from producing white clouds.
              float edgeSourceRadiance = cloudMaxComponent(material_CloudLight);
              sampleColor += material_EdgeLightColor *
                (edgeLightMask * material_EdgeLightIntensity * edgeSourceRadiance);
              float contribution = sampleAlpha * transmittance;
              color += sampleColor * contribution;
              weightedDistance += distanceAlongRay * contribution;
              accumulatedWeight += contribution;
              transmittance *= 1.0 - sampleAlpha;
              distanceAlongRay += baseStep;
            } else {
              distanceAlongRay += baseStep * mix(
                1.0,
                material_EmptySpaceStepMultiplier,
                1.0 - smoothstep(0.0, material_EmptySpaceWeatherThreshold, weather.r)
              );
            }
          }
          alpha = (1.0 - transmittance) * horizonFade;
          color *= horizonFade;
          if (accumulatedWeight > CLOUD_NUMERIC_EPSILON) {
            float representativeDistance = weightedDistance / accumulatedWeight;
            normalizedWeightedCenter = clamp(
              (representativeDistance - startDistance) /
                max(endDistance - startDistance, CLOUD_NUMERIC_EPSILON),
              0.0,
              1.0
            );
          }
        }
      }

      vec2 hemiOctEncode(vec3 direction) {
        vec3 ray = normalize(direction);
        vec2 diamond = ray.xz / max(abs(ray.x) + max(ray.y, 0.0) + abs(ray.z), CLOUD_NUMERIC_EPSILON);
        vec2 square = vec2(diamond.x + diamond.y, diamond.x - diamond.y);
        return square * 0.5 + 0.5;
      }

      vec3 hemiOctDecode(vec2 uv) {
        vec2 square = uv * 2.0 - 1.0;
        vec2 diamond = vec2((square.x + square.y) * 0.5, (square.x - square.y) * 0.5);
        float height = max(0.0, 1.0 - abs(diamond.x) - abs(diamond.y));
        return normalize(vec3(diamond.x, height, diamond.y));
      }

      vec2 cloudLayerSegment(vec3 ray) {
        vec3 center = vec3(0.0, -(material_PlanetRadius + material_ObserverAltitude), 0.0);
        vec3 offset = -center;
        float projection = dot(offset, ray);
        float innerRadius = material_PlanetRadius + material_CloudBaseAltitude;
        float outerRadius = innerRadius + material_CloudThickness;
        float observerRadius = length(offset);
        float innerRoot = sqrt(max(projection * projection + (innerRadius - observerRadius) * (innerRadius + observerRadius), 0.0));
        float outerRoot = sqrt(max(projection * projection + (outerRadius - observerRadius) * (outerRadius + observerRadius), 0.0));
        return vec2(max(0.0, -projection + innerRoot), -projection + outerRoot);
      }

      vec3 previousCloudRay(vec3 currentRay, float normalizedWeightedCenter) {
        vec2 segment = cloudLayerSegment(currentRay);
        if (segment.y <= segment.x + CLOUD_GEOMETRY_EPSILON) return currentRay;
        float representativeDistance = mix(segment.x, segment.y, clamp(normalizedWeightedCenter, 0.0, 1.0));
        return normalize(currentRay * representativeDistance + material_DirectionHistoryMotion);
      }

      struct DirectionCacheOutput {
        layout(location = 0) vec4 radiance;
        layout(location = 1) vec4 weightedCenter;
      };

      DirectionCacheOutput frag(Varyings input) {
        DirectionCacheOutput output;
        vec2 resolvedPixel = floor(gl_FragCoord.xy);
        float checkerParity = mod(resolvedPixel.x + resolvedPixel.y, 2.0);
        if (abs(checkerParity - material_DirectionCheckerParity) > 0.5) discard;
        vec2 resolvedUv = (resolvedPixel + 0.5) * material_HistoryTexelSize.xy;
        vec3 ray = hemiOctDecode(resolvedUv);
        vec2 halfTexel = material_HistoryTexelSize.xy * 0.5;
        float historyWasResolved = step(0.5, material_DirectionHistoryValid);
        float reprojectionCenter = texture2D(
          material_DirectionPreviousMetadata,
          clamp(resolvedUv, halfTexel, vec2(1.0) - halfTexel)
        ).r;
        reprojectionCenter = mix(material_InitialWeightedCenter, reprojectionCenter, historyWasResolved);
        vec3 historyRay = previousCloudRay(ray, reprojectionCenter);
        float historyDirectionValid = step(0.0, historyRay.y);
        vec2 previousUv = hemiOctEncode(historyRay);
        vec2 clampedPreviousUv = clamp(previousUv, halfTexel, vec2(1.0) - halfTexel);
        vec4 previous = texture2D(
          material_DirectionPreviousCache,
          clampedPreviousUv
        );
        float previousWeightedCenter = texture2D(material_DirectionPreviousMetadata, clampedPreviousUv).r;
        float historyAvailable = step(0.5, material_DirectionHistoryValid) * historyDirectionValid;
        previous *= historyAvailable;

        vec3 cloudColor;
        float cloudAlpha;
        float currentWeightedCenter;
        raymarchClouds(ray, cloudColor, cloudAlpha, currentWeightedCenter);
        float historyWeight = material_DirectionHistoryWeight * historyAvailable;
        vec3 previousRadiance = decodeCloudRadiance(previous.rgb, historyRay);
        vec3 updatedRadiance = mix(cloudColor, previousRadiance, historyWeight);
        float updatedAlpha = mix(clamp(cloudAlpha, 0.0, 1.0), previous.a, historyWeight);
        float updatedWeightedCenter = mix(currentWeightedCenter, previousWeightedCenter, historyWeight);
        output.radiance = vec4(
          encodeCloudRadiance(max(updatedRadiance, vec3(0.0)), ray),
          clamp(updatedAlpha, 0.0, 1.0)
        );
        output.weightedCenter = vec4(clamp(updatedWeightedCenter, 0.0, 1.0), 0.0, 0.0, 1.0);
        return output;
      }
    }

  }
}
