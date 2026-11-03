// Sun-disk shaping retains the Unity skybox-Procedural algorithm, developed by Unity and licensed under the Unity Companion License.
// The atmosphere is a fixed-ground-observer, single-scattering model with continuous sky-to-ground optical depth.

Shader "Sky/SkyProcedural" {
  Editor {
    Properties {
      Header("Base") {
        /** Linear brightness multiplier for the sky and ground colors. */
        material_Exposure("Exposure", Range(0, 8, 0.1)) = 1;
        /** Selects a sun-disk approximation, or hides the disk. */
        sunMode("SunMode", Enum(HighQuality:0, Simple:1, None:2)) = 0;
        /** Dimensionless control for the apparent size of the sun disk. */
        material_SunSize("SunSize", Range(0, 1, 0.01)) = 0.04;
        /** Controls sun-disk focus in HighQuality mode. */
        material_SunSizeConvergence("SunSizeConvergence", Range(0, 20, 0.1)) = 5;
        material_SunAtmosphereColor("SunAtmosphereColor", Color) = (1, 1, 1, 1);
        /** Relative atmosphere density used for Rayleigh scattering. */
        material_AtmosphereThickness("AtmosphereThickness", Range(0, 5, 0.1)) = 1;
        material_AtmosphereHeight("AtmosphereHeight", Range(0.005, 0.1, 0.001)) = 0.025;
        material_ObserverHeight("ObserverHeight", Range(0.000001, 0.01, 0.000001)) = 0.000001;
        material_RayleighScattering("RayleighScattering", Range(0, 0.02, 0.0001)) = 0.0025;
        material_RayleighScaleHeight("RayleighScaleHeight", Range(0.0001, 0.05, 0.0001)) = 0.00625;
        material_MieScattering("MieScattering", Range(0, 0.02, 0.0001)) = 0.001;
        material_MieScaleHeight("MieScaleHeight", Range(0.00005, 0.02, 0.00005)) = 0.00125;
        material_MieAnisotropy("MieAnisotropy", Range(0, 0.99, 0.01)) = 0.76;
        material_ScatteringIntensity("ScatteringIntensity", Range(0, 100, 0.1)) = 20;
        material_HorizonHaze("HorizonHaze", Range(0, 4, 0.01)) = 1;
        material_AtmosphereSampleCount("AtmosphereSampleCount", Range(2, 8, 1)) = 6;
        /** Atmospheric tint that controls the scattering wavelengths. */
        material_SkyTint("SkyTint", Color) = (0.214, 0.214, 0.214, 1);
        /** Tint of the ground below the horizon. */
        material_GroundTint("GroundTint", Color) = (0.112, 0.1, 0.095, 1);
        material_CustomSkyTintStrength("CustomSkyTintStrength", Range(0, 1, 0.01)) = 0;
        material_CustomSkyZenithTint("CustomSkyZenithTint", Color) = (1, 1, 1, 1);
        material_CustomSkyHorizonTint("CustomSkyHorizonTint", Color) = (1, 1, 1, 1);
      }
      Header("Night") {
        material_TwilightIntensity("TwilightIntensity", Range(0, 8, 0.1)) = 1;
        material_StarIntensity("StarIntensity", Range(0, 8, 0.1)) = 1;
        material_StarSize("StarSize", Range(0, 4, 0.01)) = 1;
        material_StarCount("StarCount", Range(0, 4, 0.01)) = 1;
        material_StarTwinkleIntensity("StarTwinkleIntensity", Range(0, 1, 0.01)) = 0;
        material_StarTwinkleSpeed("StarTwinkleSpeed", Range(0, 4, 0.01)) = 1;
        material_AirglowIntensity("AirglowIntensity", Range(0, 8, 0.1)) = 1;
      }
      Header("Moon") {
        material_MoonColor("MoonColor", Color) = (1, 1, 1, 1);
        material_MoonDiskIntensity("MoonDiskIntensity", Range(0, 8, 0.1)) = 0;
        material_MoonAtmosphereIntensity("MoonAtmosphereIntensity", Range(0, 8, 0.1)) = 0;
        material_MoonAngularRadius("MoonAngularRadius", Range(0, 0.02, 0.0001)) = 0.00465;
      }
    }
  }

  SubShader "Default" {
    Pass "Forward Pass" {
      Tags { pipelineStage = "Forward" }

      DepthState = {
        CompareFunction = CompareFunction.LessEqual;
      }
      RasterState = {
        CullMode = CullMode.Off;
      }

      VertexShader = SkyProceduralVertex;
      FragmentShader = SkyProceduralFragment;

      #include "ShaderLibrary/Common/Common.glsl"
      #ifdef MATERIAL_VOLUMETRIC_CLOUDS
        #include "ShaderLibrary/Lighting/VolumetricCloudComposition.glsl"
      #endif

      #define INNER_RADIUS 1.0
      #define MAX_SCATTER 50.0

      #define innerRadius INNER_RADIUS
      #define innerRadius2 (INNER_RADIUS * INNER_RADIUS)
      #define outerRadius (INNER_RADIUS + max(material_AtmosphereHeight, 1.0e-4))
      #define outerRadius2 (outerRadius * outerRadius)
      #define cameraHeight max(material_ObserverHeight, 1.0e-7)
      #define rayleighScaleHeight max(material_RayleighScaleHeight, 1.0e-5)
      #define mieScaleHeight max(material_MieScaleHeight, 1.0e-5)
      #define inverseAtmosphereHeight (1.0 / max(material_AtmosphereHeight, 1.0e-4))

      const float HDSundiskIntensityFactor = 15.0;
      const float simpleSundiskIntensityFactor = 27.0;

      const vec3 c_DefaultScatteringWavelength = vec3(0.65, 0.57, 0.475);
      const vec3 c_VariableRangeForScatteringWavelength = vec3(0.15, 0.15, 0.15);

      struct Attributes {
        vec4 POSITION;
      };

      struct Varyings {
        vec3 v_AtmosphereColor;
        vec3 v_ViewRay;
        vec3 v_ViewTransmittance;
        float v_GroundMask;
        #if defined(MATERIAL_SUN_HIGH_QUALITY) || defined(MATERIAL_SUN_SIMPLE)
          vec3 v_SunColor;
        #endif
      };

      mat4 camera_VPMat;
      vec3 material_SkyTint;
      vec3 material_GroundTint;
      vec3 material_CustomSkyZenithTint;
      vec3 material_CustomSkyHorizonTint;
      vec3 material_SunDirection;
      vec3 material_SunAtmosphereColor;
      float material_Exposure;
      float material_AtmosphereThickness;
      float material_AtmosphereHeight;
      float material_ObserverHeight;
      float material_RayleighScattering;
      float material_RayleighScaleHeight;
      float material_MieScattering;
      float material_MieScaleHeight;
      float material_MieAnisotropy;
      float material_ScatteringIntensity;
      float material_HorizonHaze;
      float material_AtmosphereSampleCount;
      float material_CustomSkyTintStrength;
      float material_TwilightIntensity;
      float material_StarIntensity;
      float material_StarSize;
      float material_StarCount;
      float material_StarTwinkleIntensity;
      float material_StarTwinkleSpeed;
      float material_AirglowIntensity;
      vec3 material_StarAxis;
      float material_StarRotation;
      vec3 material_MoonDirection;
      vec3 material_MoonColor;
      float material_MoonDiskIntensity;
      float material_MoonAtmosphereIntensity;
      float material_MoonAngularRadius;
      vec4 scene_ElapsedTime;
      float material_SunSize;
      float material_SunSizeConvergence;

      #define GAMMA 2.2
      #define COLOR_2_GAMMA(color) pow(color, vec3(1.0 / GAMMA))
      #define COLOR_2_LINEAR(color) color

      float getRayleighPhase(vec3 light, vec3 ray) {
        float eyeCos = dot(light, ray);
        return 0.75 + 0.75 * eyeCos * eyeCos;
      }

      float getAtmosphereMiePhase(float eyeCos) {
        float g = clamp(material_MieAnisotropy, 0.0, 0.99);
        float g2 = g * g;
        float denominator = max(1.0 + g2 - 2.0 * g * eyeCos, 1.0e-3);
        return 1.5 * ((1.0 - g2) / (2.0 + g2)) * (1.0 + eyeCos * eyeCos) / pow(denominator, 1.5);
      }

      float getFarSphereIntersection(vec3 origin, vec3 direction, float radiusSquared) {
        float projected = dot(origin, direction);
        float discriminant = projected * projected - (dot(origin, origin) - radiusSquared);
        return -projected + sqrt(max(discriminant, 0.0));
      }

      float getNearSphereIntersection(vec3 origin, vec3 direction, float radiusSquared) {
        float projected = dot(origin, direction);
        float discriminant = projected * projected - (dot(origin, origin) - radiusSquared);
        if (discriminant < 0.0) {
          return -1.0;
        }
        float distance = -projected - sqrt(discriminant);
        return distance > 0.0 ? distance : -1.0;
      }

      bool rayIntersectsGround(vec3 origin, vec3 direction) {
        return getNearSphereIntersection(origin, direction, innerRadius2) > 0.0;
      }

      float getRelativeAirMass(float zenithCosine, float scaleHeight, float radius) {
        // Spherical Chapman-function approximation. It remains finite at the horizon,
        // unlike the plane-parallel 1 / cos(theta) approximation.
        float curvature = 2.0 * scaleHeight / max(radius, innerRadius);
        float denominator = zenithCosine + sqrt(max(zenithCosine * zenithCosine + curvature, 1.0e-6));
        return min(2.0 / max(denominator, 1.0e-3), 80.0);
      }

      vec2 getSunOpticalDepth(vec3 samplePosition, vec3 sunDirection, vec2 localDensity) {
        if (rayIntersectsGround(samplePosition, sunDirection)) {
          return vec2(MAX_SCATTER);
        }
        vec3 sampleUp = samplePosition / max(length(samplePosition), 1.0e-5);
        float sunZenithCosine = dot(sampleUp, sunDirection);
        float sampleRadius = length(samplePosition);
        return vec2(
          localDensity.x * (rayleighScaleHeight * inverseAtmosphereHeight) *
            getRelativeAirMass(sunZenithCosine, rayleighScaleHeight, sampleRadius),
          localDensity.y * (mieScaleHeight * inverseAtmosphereHeight) *
            getRelativeAirMass(sunZenithCosine, mieScaleHeight, sampleRadius)
        );
      }

      float getGroundCoverage(
        vec3 cameraPosition,
        vec3 viewDirection,
        bool hitsGround,
        float atmosphereThickness
      ) {
        if (!hitsGround) {
          return 0.0;
        }

        float cameraRadius = length(cameraPosition);
        vec3 cameraUp = cameraPosition / max(cameraRadius, 1.0e-5);
        float radiusRatio = innerRadius / max(cameraRadius, innerRadius);
        float geometricHorizonCosine = -sqrt(max(1.0 - radiusRatio * radiusRatio, 0.0));
        float angleBelowHorizon = geometricHorizonCosine - dot(cameraUp, viewDirection);

        // The aerosol scale height gives the apparent angular thickness of the
        // horizon haze. This keeps the transition coupled to the atmosphere's
        // physical dimensions instead of using an authored screen-space band.
        float aerosolAngularScale = sqrt(2.0 * mieScaleHeight / innerRadius);
        float densityScale = mix(0.45, 0.8, clamp(atmosphereThickness, 0.0, 1.0));
        float horizonBlendWidth = max(aerosolAngularScale * densityScale * material_HorizonHaze, 1.0e-5);
        return smoothstep(0.0, horizonBlendWidth, angleBelowHorizon);
      }

      void integrateAtmosphere(
        vec3 cameraPosition,
        vec3 viewDirection,
        vec3 sunDirection,
        vec3 inverseWavelength,
        out vec3 radiance,
        out vec3 viewTransmittance,
        out float groundMask
      ) {
        float atmosphereDistance = getFarSphereIntersection(cameraPosition, viewDirection, outerRadius2);
        float groundDistance = getNearSphereIntersection(cameraPosition, viewDirection, innerRadius2);
        bool hitsGround = groundDistance > 0.0 && groundDistance < atmosphereDistance;
        float thickness = max(material_AtmosphereThickness, 0.0);
        groundMask = getGroundCoverage(cameraPosition, viewDirection, hitsGround, thickness);
        float groundPathLength = hitsGround ? groundDistance : atmosphereDistance;
        float pathLength = mix(atmosphereDistance, groundPathLength, groundMask);
        float atmosphereSamples = clamp(floor(material_AtmosphereSampleCount + 0.5), 2.0, 8.0);
        float stepLength = pathLength / atmosphereSamples;
        float scaledStepLength = stepLength * inverseAtmosphereHeight;
        vec3 sampleStep = viewDirection * stepLength;
        vec3 samplePosition = cameraPosition + sampleStep * 0.5;

        float rayleighCoefficient = material_RayleighScattering * pow(thickness, 2.5);
        float mieCoefficient = material_MieScattering * thickness;
        vec3 rayleighExtinction = inverseWavelength * rayleighCoefficient * (4.0 * 3.14159265);
        vec3 mieExtinction = vec3(mieCoefficient * (4.0 * 3.14159265));
        vec3 rayleighScattering =
          inverseWavelength * rayleighCoefficient * material_ScatteringIntensity;
        vec3 mieScattering = vec3(mieCoefficient * material_ScatteringIntensity);

        vec2 viewOpticalDepth = vec2(0.0);
        vec3 rayleighIntegral = vec3(0.0);
        vec3 mieIntegral = vec3(0.0);
        vec3 moonRayleighIntegral = vec3(0.0);
        vec3 moonMieIntegral = vec3(0.0);
        vec3 moonDirection = material_MoonDirection / max(length(material_MoonDirection), 1.0e-5);
        for (int sampleIndex = 0; sampleIndex < 8; sampleIndex++) {
          if (float(sampleIndex) >= atmosphereSamples) break;
          float altitude = max(length(samplePosition) - innerRadius, 0.0);
          vec2 localDensity = vec2(
            exp(-altitude / rayleighScaleHeight),
            exp(-altitude / mieScaleHeight)
          );
          vec2 segmentOpticalDepth = localDensity * scaledStepLength;
          vec2 sampleViewOpticalDepth = viewOpticalDepth + segmentOpticalDepth * 0.5;
          vec2 sunOpticalDepth = getSunOpticalDepth(samplePosition, sunDirection, localDensity);
          vec3 sunOpticalDepthRGB =
            rayleighExtinction * (sampleViewOpticalDepth.x + sunOpticalDepth.x) +
            mieExtinction * (sampleViewOpticalDepth.y + sunOpticalDepth.y);
          vec3 sunTransmittance = exp(-min(sunOpticalDepthRGB, vec3(MAX_SCATTER)));

          vec2 moonOpticalDepth = getSunOpticalDepth(samplePosition, moonDirection, localDensity);
          vec3 moonOpticalDepthRGB =
            rayleighExtinction * (sampleViewOpticalDepth.x + moonOpticalDepth.x) +
            mieExtinction * (sampleViewOpticalDepth.y + moonOpticalDepth.y);
          vec3 moonTransmittance = exp(-min(moonOpticalDepthRGB, vec3(MAX_SCATTER)));

          rayleighIntegral += sunTransmittance * segmentOpticalDepth.x;
          mieIntegral += sunTransmittance * segmentOpticalDepth.y;
          moonRayleighIntegral += moonTransmittance * segmentOpticalDepth.x;
          moonMieIntegral += moonTransmittance * segmentOpticalDepth.y;
          viewOpticalDepth += segmentOpticalDepth;
          samplePosition += sampleStep;
        }

        float sunViewCosine = dot(sunDirection, viewDirection);
        vec3 solarSingleScattering =
          rayleighIntegral * rayleighScattering * getRayleighPhase(sunDirection, viewDirection) +
          mieIntegral * mieScattering * getAtmosphereMiePhase(sunViewCosine);
        float moonViewCosine = dot(moonDirection, viewDirection);
        vec3 lunarSingleScattering =
          moonRayleighIntegral * rayleighScattering * getRayleighPhase(moonDirection, viewDirection) +
          moonMieIntegral * mieScattering * getAtmosphereMiePhase(moonViewCosine);
        float moonAboveHorizon = smoothstep(-0.02, 0.08, moonDirection.y);
        radiance =
          solarSingleScattering * material_SunAtmosphereColor +
          lunarSingleScattering * material_MoonColor * material_MoonAtmosphereIntensity * moonAboveHorizon;
        viewTransmittance = exp(
          -min(
            rayleighExtinction * viewOpticalDepth.x + mieExtinction * viewOpticalDepth.y,
            vec3(MAX_SCATTER)
          )
        );
        // Dense sunrise and sunset paths can extinguish the direct solar beam before
        // the low-sample single-scattering integral reaches the thin illuminated upper
        // atmosphere. Approximate the missing low-order multiple scattering from the
        // interacted view energy and the shell-derived twilight limit. This remains
        // coupled to the physical coefficients and vanishes once the planet fully
        // occludes the atmosphere.
        float twilightLimit = sqrt(max(1.0 - innerRadius2 / outerRadius2, 0.0));
        float upperAtmosphereSunlight = smoothstep(-twilightLimit, 0.02, sunDirection.y);
        vec3 spectralScattering = rayleighExtinction + mieExtinction;
        spectralScattering /= max(max(spectralScattering.r, spectralScattering.g), max(spectralScattering.b, 1.0e-5));
        vec3 interactedViewEnergy = vec3(1.0) - viewTransmittance;
        radiance +=
          material_SunAtmosphereColor *
          spectralScattering *
          interactedViewEnergy *
          upperAtmosphereSunlight *
          (1.0 - groundMask) *
          material_ScatteringIntensity *
          0.0025;
        if (hitsGround) {
          vec3 groundPosition = cameraPosition + viewDirection * groundDistance;
          vec3 groundNormal = normalize(groundPosition);
          float groundNdotL = max(dot(groundNormal, sunDirection), 0.0);
          float groundIllumination = 0.025 + 0.975 * groundNdotL;
          radiance +=
            COLOR_2_LINEAR(material_GroundTint) * viewTransmittance * groundIllumination * groundMask;
        }
      }

      float getSunDiskMask(vec3 lightPos, vec3 ray, float edgeFraction) {
        float radius = max(material_SunSize, 1.0e-5);
        float edgeWidth = max(radius * edgeFraction, 1.0e-5);
        float angularChord = length(normalize(lightPos) - normalize(ray));
        float disk = 1.0 - smoothstep(max(radius - edgeWidth, 0.0), radius + edgeWidth, angularChord);
        return disk * step(1.0e-5, material_SunSize);
      }

      float calcSunAttenuation(vec3 lightPos, vec3 ray) {
        #ifdef MATERIAL_SUN_HIGH_QUALITY
          float convergence = clamp(material_SunSizeConvergence / 20.0, 0.0, 1.0);
          return getSunDiskMask(lightPos, ray, mix(0.18, 0.02, convergence));
        #else //MATERIAL_SUN_SIMPLE
          return getSunDiskMask(lightPos, ray, 0.08);
        #endif
      }

      float hashStarCell(vec2 cell) {
        vec3 p = fract(vec3(cell.xyx) * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      vec3 rotateAroundAxis(vec3 direction, vec3 axis, float angle) {
        float sine = sin(angle);
        float cosine = cos(angle);
        return direction * cosine + cross(axis, direction) * sine + axis * dot(axis, direction) * (1.0 - cosine);
      }

      void getStarChart(vec3 direction, out float face, out vec2 uv) {
        vec3 axis = abs(direction);
        if (axis.x >= axis.y && axis.x >= axis.z) {
          if (direction.x >= 0.0) {
            face = 0.0;
            uv = vec2(-direction.z, direction.y) / axis.x;
          } else {
            face = 1.0;
            uv = vec2(direction.z, direction.y) / axis.x;
          }
        } else if (axis.y >= axis.z) {
          if (direction.y >= 0.0) {
            face = 2.0;
            uv = vec2(direction.x, -direction.z) / axis.y;
          } else {
            face = 3.0;
            uv = vec2(direction.x, direction.z) / axis.y;
          }
        } else if (direction.z >= 0.0) {
          face = 4.0;
          uv = vec2(direction.x, direction.y) / axis.z;
        } else {
          face = 5.0;
          uv = vec2(-direction.x, direction.y) / axis.z;
        }
      }

      vec3 getStarDirection(float face, vec2 uv) {
        if (face == 0.0) return normalize(vec3(1.0, uv.y, -uv.x));
        if (face == 1.0) return normalize(vec3(-1.0, uv.y, uv.x));
        if (face == 2.0) return normalize(vec3(uv.x, 1.0, -uv.y));
        if (face == 3.0) return normalize(vec3(uv.x, -1.0, uv.y));
        if (face == 4.0) return normalize(vec3(uv.x, uv.y, 1.0));
        return normalize(vec3(-uv.x, uv.y, -1.0));
      }

      void canonicalizeStarCell(
        float chartFace,
        vec2 chartCell,
        float starGridSize,
        out float canonicalFace,
        out vec2 canonicalCell
      ) {
        canonicalFace = chartFace;
        canonicalCell = chartCell;
        if (
          chartCell.x < 0.0 || chartCell.y < 0.0 || chartCell.x >= starGridSize ||
          chartCell.y >= starGridSize
        ) {
          vec2 sampleUV = (chartCell + 0.5) * (2.0 / starGridSize) - 1.0;
          vec3 sampleDirection = getStarDirection(chartFace, sampleUV);
          vec2 canonicalUV;
          getStarChart(sampleDirection, canonicalFace, canonicalUV);
          canonicalCell = clamp(
            floor((canonicalUV * 0.5 + 0.5) * starGridSize),
            vec2(0.0),
            vec2(starGridSize - 1.0)
          );
        }
      }

      vec3 getProceduralStarCandidate(
        vec3 direction,
        float chartFace,
        vec2 chartCell,
        float starGridSize,
        float starSize,
        float starCount,
        float pixelFootprintVariance
      ) {
        float face;
        vec2 cell;
        canonicalizeStarCell(chartFace, chartCell, starGridSize, face, cell);
        vec2 hashCell = cell + vec2(face * 83.17, face * 47.53);
        float occurrenceSeed = hashStarCell(hashCell);
        float occurrence = smoothstep(1.0 - 0.1 * starCount, 1.0 - 0.025 * starCount, occurrenceSeed);
        if (occurrence <= 0.0) return vec3(0.0);

        vec2 starPosition = vec2(hashStarCell(hashCell + 19.17), hashStarCell(hashCell + 73.91));
        starPosition = 0.25 + 0.5 * starPosition;
        vec2 starUV = (cell + starPosition) * (2.0 / starGridSize) - 1.0;
        vec3 starDirection = getStarDirection(face, starUV);
        float starRadius =
          mix(0.035, 0.085, hashStarCell(hashCell + 41.73)) * (0.5 * 3.14159265 / starGridSize) * starSize;
        vec3 starDelta = direction - starDirection;
        float squaredAngularDistance = dot(starDelta, starDelta);
        // The authored profile remains defined in celestial angular space. The visible sky passes zero variance;
        // only environment capture supplies an energy-compensated pixel-footprint variance for sub-pixel stars.
        float coreVariance = max(starRadius * starRadius * 0.65 * 0.65, 1.0e-12);
        float haloVariance = coreVariance * 2.2 * 2.2;
        float filteredCoreVariance = coreVariance + pixelFootprintVariance;
        float filteredHaloVariance = haloVariance + pixelFootprintVariance;
        float captureEnergyNormalization = 1.0;
        #ifdef MATERIAL_STAR_PIXEL_FOOTPRINT_FILTER
          // In environment capture, starSize controls the angular point-spread width rather than radiant flux.
          // Normalize by area so shrinking an unresolved star does not remove its energy from the IBL signal.
          captureEnergyNormalization = 1.0 / max(starSize * starSize, 1.0e-4);
        #endif
        // Convolving a 2D Gaussian with the pixel footprint widens its variance. The original-to-filtered variance
        // ratio compensates the peak so that the integrated angular radiance remains unchanged.
        float core =
          captureEnergyNormalization * (coreVariance / filteredCoreVariance) *
          exp(-0.5 * squaredAngularDistance / filteredCoreVariance);
        float halo =
          captureEnergyNormalization * (haloVariance / filteredHaloVariance) *
          exp(-0.5 * squaredAngularDistance / filteredHaloVariance);
        float point = core * 0.82 + halo * 0.18;

        float brightnessSeed = hashStarCell(hashCell + 151.67);
        float brightness = mix(0.35, 2.6, pow(brightnessSeed, 3.0));
        float twinklePhase = hashStarCell(hashCell + 227.31) * 6.2831853;
        float twinkleSpeed = mix(1.6, 3.8, hashStarCell(hashCell + 263.17)) * material_StarTwinkleSpeed;
        float primaryTwinkle = sin(scene_ElapsedTime.x * twinkleSpeed + twinklePhase);
        float secondaryTwinkle = sin(scene_ElapsedTime.x * twinkleSpeed * 1.73 + twinklePhase * 1.91);
        float twinkleWave = primaryTwinkle * 0.72 + secondaryTwinkle * 0.28;
        float twinkleAmplitude = material_StarTwinkleIntensity * mix(0.35, 1.0, brightnessSeed);
        float twinkle = max(1.0 + twinkleWave * twinkleAmplitude, 0.0);
        float temperature = hashStarCell(hashCell + 113.29);
        vec3 warmColor = vec3(1.0, 0.58, 0.32);
        vec3 neutralColor = vec3(1.0, 0.9, 0.78);
        vec3 coolColor = vec3(0.55, 0.72, 1.0);
        vec3 starColor = mix(warmColor, neutralColor, smoothstep(0.0, 0.5, temperature));
        starColor = mix(starColor, coolColor, smoothstep(0.5, 1.0, temperature));
        return starColor * point * occurrence * brightness * twinkle;
      }

      vec3 getProceduralStars(vec3 viewDirection, float pixelFootprintVariance) {
        float starSize = clamp(material_StarSize, 0.0, 4.0);
        float starCount = clamp(material_StarCount, 0.0, 4.0);
        if (starSize <= 0.0 || starCount <= 0.0) return vec3(0.0);
        vec3 axis = material_StarAxis / max(length(material_StarAxis), 1.0e-5);
        vec3 direction = rotateAroundAxis(viewDirection, axis, material_StarRotation);
        float face;
        vec2 chartUV;
        // Cube charts avoid the pole singularity of an equirectangular star grid
        getStarChart(direction, face, chartUV);
        float starGridSize = 108.0;
        vec2 starGridPosition = (chartUV * 0.5 + 0.5) * starGridSize;
        vec2 cell = floor(starGridPosition);
        vec3 stars = vec3(0.0);
        for (int cellY = -1; cellY <= 1; cellY++) {
          for (int cellX = -1; cellX <= 1; cellX++) {
            stars += getProceduralStarCandidate(
              direction,
              face,
              cell + vec2(float(cellX), float(cellY)),
              starGridSize,
              starSize,
              starCount,
              pixelFootprintVariance
            );
          }
        }
        return stars;
      }

      vec3 getTwilightAndNightRadiance(
        vec3 viewDirection,
        vec3 viewTransmittance,
        float starPixelFootprintVariance
      ) {
        vec3 sunDirection = -material_SunDirection;
        float sunElevation = asin(clamp(sunDirection.y, -1.0, 1.0)) * (180.0 / 3.14159265);
        float solarDepression = max(-sunElevation, 0.0);
        float afterSunset = smoothstep(0.0, 0.75, solarDepression);
        float civilTwilight = afterSunset * (1.0 - smoothstep(0.0, 6.0, solarDepression));
        float nauticalTwilight =
          smoothstep(0.0, 6.0, solarDepression) * (1.0 - smoothstep(6.0, 12.0, solarDepression));
        float astronomicalTwilight =
          smoothstep(6.0, 12.0, solarDepression) * (1.0 - smoothstep(12.0, 18.0, solarDepression));
        float astronomicalNight = smoothstep(12.0, 18.0, solarDepression);

        float skyMask = smoothstep(-0.02, 0.03, viewDirection.y);
        float horizon = pow(1.0 - clamp(viewDirection.y, 0.0, 1.0), 2.0);
        vec3 viewHorizontal = vec3(viewDirection.x, 0.0, viewDirection.z);
        vec3 sunHorizontal = vec3(sunDirection.x, 0.0, sunDirection.z);
        viewHorizontal /= max(length(viewHorizontal), 1.0e-5);
        sunHorizontal /= max(length(sunHorizontal), 1.0e-5);
        float sunward = pow(max(dot(viewHorizontal, sunHorizontal), 0.0), 3.0);

        vec3 civilColor =
          vec3(0.006, 0.012, 0.035) * (0.3 + 0.7 * horizon) +
          vec3(0.18, 0.05, 0.008) * horizon * sunward;
        vec3 nauticalColor =
          vec3(0.003, 0.009, 0.035) * (0.25 + 0.75 * horizon) +
          vec3(0.016, 0.008, 0.028) * horizon * sunward;
        vec3 astronomicalColor = vec3(0.001, 0.003, 0.012) * (0.35 + 0.65 * horizon);
        vec3 twilight =
          civilColor * civilTwilight + nauticalColor * nauticalTwilight + astronomicalColor * astronomicalTwilight;

        float airglowHorizon = pow(horizon, 3.0);
        vec3 airglow =
          (vec3(0.0004, 0.0008, 0.0018) + vec3(0.0014, 0.0035, 0.0012) * airglowHorizon) *
          astronomicalNight *
          material_AirglowIntensity;
        float starVisibility = smoothstep(4.0, 16.0, solarDepression) * skyMask;
        vec3 stars =
          getProceduralStars(viewDirection, starPixelFootprintVariance) * starVisibility * material_StarIntensity *
          clamp(viewTransmittance, vec3(0.0), vec3(1.0));
        return (twilight * material_TwilightIntensity + airglow + stars) * skyMask;
      }

      vec3 getMoonAtmosphereRadiance(vec3 viewDirection) {
        vec3 moonDirection = material_MoonDirection / max(length(material_MoonDirection), 1.0e-5);
        float moonAboveHorizon = smoothstep(-0.02, 0.08, moonDirection.y);
        float skyMask = smoothstep(-0.02, 0.03, viewDirection.y);
        float horizon = pow(1.0 - clamp(viewDirection.y, 0.0, 1.0), 2.0);
        float moonward = max(dot(viewDirection, moonDirection), 0.0);
        float broadHalo = pow(moonward, 512.0);
        float forwardHalo = pow(moonward, 4096.0);
        vec3 rayleighColor = vec3(0.28, 0.48, 1.0);
        float scatteredRadiance = 0.008 + 0.025 * horizon + 0.04 * broadHalo + 0.14 * forwardHalo;
        return
          material_MoonColor *
          rayleighColor *
          material_MoonAtmosphereIntensity *
          scatteredRadiance *
          moonAboveHorizon *
          skyMask;
      }

      vec4 getMoonDisk(vec3 viewDirection) {
        vec3 moonDirection = material_MoonDirection / max(length(material_MoonDirection), 1.0e-5);
        vec3 referenceUp = abs(moonDirection.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        vec3 diskRight = normalize(cross(referenceUp, moonDirection));
        vec3 diskUp = cross(moonDirection, diskRight);
        float sineAngularRadius = max(sin(material_MoonAngularRadius), 1.0e-5);
        vec2 diskPosition =
          vec2(dot(viewDirection, diskRight), dot(viewDirection, diskUp)) / sineAngularRadius;
        float radialDistance = length(diskPosition);
        float edgeWidth = 0.08;
        #ifdef GRAPHICS_API_WEBGL2
          edgeWidth = max(fwidth(radialDistance), 0.015);
        #endif
        float diskMask = 1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, radialDistance);
        diskMask *= step(1.0e-5, material_MoonDiskIntensity);

        float surfaceDepth = sqrt(max(1.0 - radialDistance * radialDistance, 0.0));
        vec3 surfaceNormal = normalize(
          diskRight * diskPosition.x + diskUp * diskPosition.y - moonDirection * surfaceDepth
        );
        vec3 sunDirection = normalize(-material_SunDirection);
        float lunarDiffuse = max(dot(surfaceNormal, sunDirection), 0.0);
        float earthshine = 0.002;
        vec3 diskRadiance = material_MoonColor * material_MoonDiskIntensity * (earthshine + lunarDiffuse);
        return vec4(diskRadiance, diskMask);
      }

      vec3 applyCustomSkyTint(vec3 radiance, vec3 viewDirection, float skyVisibility) {
        float zenithBlend = smoothstep(0.0, 1.0, clamp(viewDirection.y, 0.0, 1.0));
        vec3 gradientTint = mix(material_CustomSkyHorizonTint, material_CustomSkyZenithTint, zenithBlend);
        float strength = clamp(material_CustomSkyTintStrength, 0.0, 1.0) * skyVisibility;
        return radiance * mix(vec3(1.0), gradientTint, strength);
      }

      Varyings SkyProceduralVertex(Attributes attributes) {
        Varyings varyings;

        gl_Position = camera_VPMat * vec4(attributes.POSITION.xyz, 1.0);

        vec3 skyTintInGammaSpace = COLOR_2_GAMMA(material_SkyTint);
        vec3 scatteringWavelength = mix(
          c_DefaultScatteringWavelength - c_VariableRangeForScatteringWavelength,
          c_DefaultScatteringWavelength + c_VariableRangeForScatteringWavelength,
          vec3(1.0) - skyTintInGammaSpace
        );
        vec3 invWavelength = 1.0 / pow(scatteringWavelength, vec3(4.0));
        vec3 cameraPos = vec3(0.0, innerRadius + cameraHeight, 0.0);
        vec3 eyeRay = normalize(attributes.POSITION.xyz);
        vec3 sunDirection = normalize(-material_SunDirection);
        vec3 atmosphereRadiance;
        vec3 viewTransmittance;
        float groundMask;
        integrateAtmosphere(
          cameraPos,
          eyeRay,
          sunDirection,
          invWavelength,
          atmosphereRadiance,
          viewTransmittance,
          groundMask
        );
        varyings.v_ViewRay = eyeRay;
        varyings.v_ViewTransmittance = viewTransmittance;
        varyings.v_GroundMask = groundMask;
        varyings.v_AtmosphereColor = material_Exposure * atmosphereRadiance;

        float lightColorIntensity = clamp(length(material_SunAtmosphereColor), 0.25, 1.0);

        #ifdef MATERIAL_SUN_HIGH_QUALITY
          varyings.v_SunColor =
            HDSundiskIntensityFactor * viewTransmittance * material_SunAtmosphereColor / lightColorIntensity;
        #elif defined(MATERIAL_SUN_SIMPLE)
          float sunScale = 400.0 * material_ScatteringIntensity;
          varyings.v_SunColor =
            simpleSundiskIntensityFactor * clamp(viewTransmittance * sunScale, 0.0, 1.0) *
            material_SunAtmosphereColor / lightColorIntensity;
        #endif

        return varyings;
      }

      void SkyProceduralFragment(Varyings varyings) {
        vec3 col = varyings.v_AtmosphereColor;
        vec3 viewRay = normalize(varyings.v_ViewRay);
        float skyVisibility = 1.0 - clamp(varyings.v_GroundMask, 0.0, 1.0);

        col = applyCustomSkyTint(col, viewRay, skyVisibility);

        float starPixelFootprintVariance = 0.0;
        #ifdef MATERIAL_STAR_PIXEL_FOOTPRINT_FILTER
          vec3 starDirectionDx = dFdx(viewRay);
          vec3 starDirectionDy = dFdy(viewRay);
          // A box pixel has variance width^2 / 12 on each axis. Average the two tangent-plane axes to obtain the
          // isotropic Gaussian variance used by the procedural-star convolution above.
          starPixelFootprintVariance =
            (dot(starDirectionDx, starDirectionDx) + dot(starDirectionDy, starDirectionDy)) / 24.0;
        #endif

        #if defined(MATERIAL_SUN_HIGH_QUALITY) || defined(MATERIAL_SUN_SIMPLE)
          col +=
            varyings.v_SunColor * calcSunAttenuation(-material_SunDirection, viewRay) * skyVisibility;
        #endif

        col +=
          material_Exposure *
          (getTwilightAndNightRadiance(viewRay, varyings.v_ViewTransmittance, starPixelFootprintVariance) +
            getMoonAtmosphereRadiance(viewRay));

        vec4 moonDisk = getMoonDisk(viewRay);
        col = mix(col, moonDisk.rgb * varyings.v_ViewTransmittance, moonDisk.a * skyVisibility);

        #ifdef MATERIAL_VOLUMETRIC_CLOUDS
          vec4 cloud = sampleVolumetricCloudComposition(viewRay);
          col = col * (1.0 - cloud.a) + cloud.rgb * material_Exposure;
        #endif

        gl_FragColor = vec4(col, 1.0);
      }
    }
  }
}
