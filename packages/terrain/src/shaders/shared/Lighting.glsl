#ifndef TERRAIN_PROJECT_LIGHTING_INCLUDED
#define TERRAIN_PROJECT_LIGHTING_INCLUDED

#include "ShaderLibrary/PBR/LightDirectPBR.glsl"
#include "ShaderLibrary/PBR/LightIndirectPBR.glsl"
#include "shared/Shadow.glsl"

struct TerrainProjectLightingResult {
  vec3 directDiffuse;
  vec3 directSpecular;
  vec3 environmentDiffuse;
  vec3 environmentSpecular;
  float shadowAttenuation;
};

#ifdef SCENE_OIL_PAINT_STYLE
  sampler2D scene_OilPaintBrushTexture;
  float scene_OilPaintImpasto;
  float scene_OilPaintBrushScale;

  float oilPaintHash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float oilPaintHash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float oilPaintValueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = oilPaintHash21(i);
    float b = oilPaintHash21(i + vec2(1.0, 0.0));
    float c = oilPaintHash21(i + vec2(0.0, 1.0));
    float d = oilPaintHash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // Rodrigues hue rotation around the (1,1,1)/sqrt(3) achromatic axis:
  // preserves luminance and leaves neutral snow/stone mathematically untouched.
  vec3 oilPaintRotateHue(vec3 col, float angle) {
    vec3 k = vec3(0.577350269, 0.577350269, 0.577350269);
    float cosA = cos(angle);
    float sinA = sin(angle);
    return max(col * cosA + cross(k, col) * sinA + k * dot(k, col) * (1.0 - cosA), vec3(0.0));
  }

  vec4 oilPaintSampleImpasto(vec2 uv) {
    return texture2D(scene_OilPaintBrushTexture, uv);
  }

  // 2-tap irrational-scale rotated + domain-warped anti-tiling ground brushstroke sampler:
  // uses crisp winner-takes-all stroke picking (ZERO grid cells!) so every individual dab holds one pure paint color.
  vec4 oilPaintSampleGroundAntiTile(vec2 worldXZ, float scale, out float macroRegion, out float microDabId) {
    float s = scale * 0.42;
    vec2 warp = vec2(
      sin(worldXZ.x * 0.14 + worldXZ.y * 0.09),
      cos(worldXZ.y * 0.15 - worldXZ.x * 0.11)
    ) * 0.34;

    vec2 uvA = (worldXZ + warp) * s;
    vec2 wB = worldXZ - warp * 0.65;
    // ~37.5 deg rotation & golden-ratio scale (0.618) so the two stroke layers never realign periodically.
    vec2 uvB = vec2(0.793 * wB.x - 0.609 * wB.y, 0.609 * wB.x + 0.793 * wB.y) * (s * 0.68);

    vec4 bA = oilPaintSampleImpasto(uvA);
    vec4 bB = oilPaintSampleImpasto(uvB);

    float blend = smoothstep(0.25, 0.75, oilPaintValueNoise(worldXZ * 0.22));
    // Ultra-crisp stroke dominance pick so each overlapping brush dab keeps its own unblurred pigment ID.
    float pickB = smoothstep(-0.025, 0.025, (bB.r + blend * 0.22) - (bA.r + (1.0 - blend) * 0.22));
    vec4 brush = mix(bA, bB, pickB);

    macroRegion = oilPaintValueNoise(worldXZ * 0.095);
    // Pure per-dab pigment ID from the winning brushstroke (ZERO square grid quantization!).
    microDabId = fract(brush.a * (pickB > 0.5 ? 1.0 : 1.0) + (pickB > 0.5 ? 0.37 : 0.0));
    return brush;
  }

  // Shared matte autumn-wood brushstroke ground palette (used by Terrain floor AND ground-covered rock tops).
  vec3 oilPaintGroundDabColor(
    vec3 baseAlbedo,
    vec3 worldPos,
    float shadowAttenuation,
    float macroRegion,
    float dab,
    float chromaGate
  ) {
    float dappleNoise = oilPaintValueNoise(worldPos.xz * 0.28 + vec2(3.7, -2.1));
    float sunPatch = smoothstep(0.32, 0.76, max(shadowAttenuation * 0.85, shadowAttenuation * 0.55 + dappleNoise * 0.45));
    float baseLuma = max(dot(baseAlbedo, vec3(0.299, 0.587, 0.114)), 0.06);
    vec3 shadeDab = dab < 0.18
      ? vec3(0.28, 0.11, 0.06)
      : (dab < 0.36
        ? vec3(0.42, 0.17, 0.07)
        : (dab < 0.54
          ? vec3(0.34, 0.21, 0.09)
          : (dab < 0.70
            ? vec3(0.18, 0.24, 0.09)
            : (dab < 0.86
              ? vec3(0.48, 0.23, 0.08)
              : vec3(0.26, 0.16, 0.14)))));
    vec3 sunDab = dab < 0.24
      ? vec3(0.95, 0.74, 0.14)
      : (dab < 0.48
        ? vec3(0.92, 0.52, 0.10)
        : (dab < 0.70
          ? vec3(0.84, 0.28, 0.09)
          : (dab < 0.86
            ? vec3(0.68, 0.46, 0.12)
            : vec3(0.36, 0.44, 0.14))));
    float substrateGain = clamp(baseLuma / 0.14, 0.75, 1.35);
    vec3 groundDab = mix(shadeDab, sunDab, sunPatch) * substrateGain;
    return mix(baseAlbedo, groundDab, chromaGate * 0.92);
  }

  void oilPaintEvaluateLighting(
    SurfaceData surfaceData,
    float shadowAttenuation,
    float leafId,
    inout TerrainProjectLightingResult result
  ) {
    vec3 N = normalize(surfaceData.normal);
    vec3 V = normalize(surfaceData.viewDir);
    vec3 P = surfaceData.position;
    float scale = max(scene_OilPaintBrushScale, 0.05);
    float smoothness = clamp(1.0 - surfaceData.roughness, 0.0, 1.0);

    vec4 brush = vec4(0.5, 0.5, 0.5, 0.5);
    float extraBrokenColor = 0.5;
    float macroRegion = 0.5;
    float isBarkStrip = 0.0;
    float rockTopGroundMask = 0.0;

    #if defined(TERRAIN_PROJECT_OIL_PAINT_FOLIAGE)
      // Each individual leaf card keeps one pure, unsplit painterly color driven by its vertex-constant leafId.
      vec2 leafUv = vec2(P.x * 0.80 + P.z * 0.60, P.y) * (1.45 * scale);
      brush = oilPaintSampleImpasto(leafUv);
      extraBrokenColor = leafId >= 0.0 ? leafId : oilPaintHash31(floor(P * 2.5));
    #elif defined(TERRAIN_PROJECT_OIL_PAINT_GRASS)
      // Grass blades: vertical brush-flick grain along blade height + per-tuft discrete pigment variation.
      vec2 grassUv = vec2((P.x * 0.7 + P.z * 0.7) * 1.35 * scale, P.y * 0.75 * scale);
      brush = oilPaintSampleImpasto(grassUv);
      extraBrokenColor = oilPaintHash31(floor(vec3(P.x * 2.2, 0.0, P.z * 2.2)));
    #elif defined(TERRAIN_PROJECT_OIL_PAINT_SURFACE)
      // Tree trunks & rocks: adapt automatically by surface slope.
      // Steep vertical faces (trunks/cliffs) get 4:1 vertical palette-knife bark strips;
      // ground-covered rock tops sample the exact same matte autumn terrain brushstroke texture as Terrain!
      vec3 w = pow(abs(N), vec3(6.0));
      w /= max(w.x + w.y + w.z, 1e-4);
      isBarkStrip = 1.0 - smoothstep(0.28, 0.65, abs(N.y));
      float sWorld = scale * 0.28;
      vec2 sVert = vec2(sWorld * 2.2, sWorld * 0.48);
      vec4 bx = oilPaintSampleImpasto(P.zy * mix(vec2(sWorld), sVert, isBarkStrip));
      vec4 by = oilPaintSampleImpasto(P.xz * sWorld);
      vec4 bz = oilPaintSampleImpasto(P.xy * mix(vec2(sWorld), sVert, isBarkStrip));
      brush = bx * w.x + by * w.y + bz * w.z;
      extraBrokenColor = mix(brush.a, oilPaintHash31(floor(vec3(P.x * 3.2, P.y * 0.55, P.z * 3.2))), isBarkStrip * 0.65);
      #if defined(MATERIAL_TERRAIN_COLOR_COVERAGE) && !defined(MATERIAL_ROCK_TOP_GRASS)
        rockTopGroundMask = smoothstep(
          material_TerrainCoverageSlope.x,
          material_TerrainCoverageSlope.x + max(material_TerrainCoverageSlope.y, 0.001),
          N.y
        );
        rockTopGroundMask = mix(rockTopGroundMask, 1.0 - rockTopGroundMask, material_TerrainCoverageInvert);
        if (rockTopGroundMask > 0.01) {
          float topMacro = 0.5;
          float topDab = 0.5;
          vec4 topBrush = oilPaintSampleGroundAntiTile(P.xz, scale, topMacro, topDab);
          brush = mix(brush, topBrush, rockTopGroundMask);
          macroRegion = mix(macroRegion, topMacro, rockTopGroundMask);
          extraBrokenColor = mix(extraBrokenColor, topDab, rockTopGroundMask);
        }
      #endif
    #else
      // Wide terrain floor: anti-tiled dual-rotated impasto brushwork + world-space macro/micro color variation.
      brush = oilPaintSampleGroundAntiTile(P.xz, scale, macroRegion, extraBrokenColor);
    #endif

    float height = brush.r;
    float gx = brush.g * 2.0 - 1.0;
    float gy = brush.b * 2.0 - 1.0;
    float pigment = mix(brush.a, extraBrokenColor, 0.58);
    float rake = 0.58 * gx - 0.80 * gy;

    vec3 sunDir = vec3(0.24, 0.42, 0.87);
    vec3 sunColor = vec3(0.0);
    float sunMax = 0.0;
    #ifdef SCENE_DIRECT_LIGHT_COUNT
      for (int i = 0; i < SCENE_DIRECT_LIGHT_COUNT; i++) {
        vec3 lc = scene_DirectLightColor[i];
        float lm = max(lc.r, max(lc.g, lc.b));
        if (lm > sunMax) {
          sunMax = lm;
          sunColor = lc;
          sunDir = normalize(-scene_DirectLightDirection[i]);
        }
      }
    #endif

    // Real scene environment irradiance drives day/dusk/night ambient brightness & color temperature.
    // Sample upward sky hemisphere (0,1,0) for direction-independent global day/night ambient energy so
    // vertical tree trunks (N.y ~= 0) and branch undersides are never misclassified as night in broad daylight!
    vec3 skyEnvIrr = getGlobalDiffuseIrradiance(vec3(0.0, 1.0, 0.0)) * scene_EnvMapLight.diffuseIntensity * RECIPROCAL_PI;
    vec3 surfEnvIrr = getGlobalDiffuseIrradiance(N) * scene_EnvMapLight.diffuseIntensity * RECIPROCAL_PI;
    vec3 envIrr = mix(skyEnvIrr, surfEnvIrr, 0.30);
    float skyEnvLum = dot(skyEnvIrr, vec3(0.2126, 0.7152, 0.0722));
    float envLum = dot(envIrr, vec3(0.2126, 0.7152, 0.0722));
    // Linear low-end response matching PBR buildings & water:
    // daytime 14:00 (sunMax ~2.4+, skyEnvLum ~0.8+) stays at 1.0, while night/moonlight dims accurately!
    float directEnergy = clamp(sunMax / 2.2, 0.0, 1.05);
    float envEnergy = clamp(skyEnvLum * 1.15, 0.025, 1.0);
    float sceneEnergy = max(directEnergy, envEnergy);

    float ndl = dot(N, sunDir);
    float backlit = pow(max(dot(-V, sunDir), 0.0), 1.9);
    float lit = clamp(shadowAttenuation * (ndl * 0.80 + 0.34 + backlit * 0.36) * directEnergy, 0.0, 1.0);

    // Measure surface chroma so seasonal/snow/rain albedo is always respected:
    // colorful autumn/spring/summer surfaces get vivid Impressionist broken color,
    // while white snow & neutral stone stay clean without warm/seasonal tint bleeding.
    vec3 albedo = surfaceData.albedoColor;
    float maxC = max(albedo.r, max(albedo.g, albedo.b));
    float minC = min(albedo.r, min(albedo.g, albedo.b));
    float chroma = (maxC - minC) / max(maxC, 1e-4);
    float chromaGate = smoothstep(0.10, 0.38, chroma);

    float bandX = lit + (pigment - 0.5) * 0.40 + (height - 0.5) * 0.15;

    // Surface-specific relative hue variation (100% weather & 4-season safe).
    #if defined(TERRAIN_PROJECT_OIL_PAINT_SURFACE)
      if (isBarkStrip > 0.05) {
        // Lift overly crushed dark bark albedo (bark texture * tint, or legacy cached dark bark) into a
        // luminous painterly chestnut/umber range without touching bright sandstone cliffs or snowy surfaces.
        float barkLuma = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
        float darkBarkLift = smoothstep(0.26, 0.02, barkLuma) * isBarkStrip * (1.0 - rockTopGroundMask);
        vec3 liftedBark = mix(
          vec3(0.24, 0.145, 0.095),
          albedo * 2.2 + vec3(0.08, 0.048, 0.032),
          smoothstep(0.01, 0.10, barkLuma)
        );
        albedo = mix(albedo, liftedBark, darkBarkLift * 0.82);

        vec3 barkPlum = albedo * vec3(0.84, 0.72, 0.96);
        vec3 barkSlate = albedo * vec3(0.88, 0.96, 1.14);
        vec3 barkOlive = albedo * vec3(1.08, 1.12, 0.78);
        vec3 barkGold = albedo * vec3(1.28, 1.12, 0.78);
        vec3 stripTint = pigment < 0.33
          ? mix(barkPlum, barkSlate, pigment * 3.0)
          : (pigment < 0.68 ? mix(barkSlate, barkOlive, (pigment - 0.33) * 2.85) : mix(barkOlive, barkGold, (pigment - 0.68) * 3.12));
        albedo = mix(albedo, stripTint, isBarkStrip * 0.65 * mix(0.25, 1.0, chromaGate));
      }
      if (rockTopGroundMask > 0.01) {
        vec3 topGroundCol = oilPaintGroundDabColor(albedo, P, shadowAttenuation, macroRegion, extraBrokenColor, chromaGate);
        albedo = mix(albedo, topGroundCol, rockTopGroundMask);
      }
    #elif defined(TERRAIN_PROJECT_OIL_PAINT_FOLIAGE)
      // True per-leaf-card discrete Autumn Wood oil-paint palette within every single tree:
      // every individual leaf quad gets one clean solid hue (gold, yellow, tangerine, crimson, olive-green, amber)
      // blended subtly with the tree's own per-tree tone — zero neon magenta, zero voxel stripes, snow stays pure white!
      float lid = extraBrokenColor;
      vec3 cardColor = lid < 0.22
        ? vec3(0.95, 0.66, 0.08)   // warm cadmium gold
        : (lid < 0.39
          ? vec3(0.98, 0.84, 0.14) // bright butter yellow
          : (lid < 0.57
            ? vec3(0.90, 0.34, 0.05) // burnt tangerine orange
            : (lid < 0.73
              ? vec3(0.76, 0.12, 0.05) // rich autumn crimson-scarlet (no magenta!)
              : (lid < 0.87
                ? vec3(0.28, 0.54, 0.11) // autumn olive-green leaf
                : vec3(0.78, 0.46, 0.09))))); // warm ochre amber
      vec3 treeHarmonized = mix(cardColor, cardColor * 0.65 + albedo * 0.55, 0.30);
      albedo = mix(albedo, treeHarmonized, chromaGate * 0.92);
    #elif defined(TERRAIN_PROJECT_OIL_PAINT_GRASS)
      float grassHue = (extraBrokenColor - 0.5) * 0.95 * chromaGate;
      albedo = oilPaintRotateHue(albedo, grassHue);
    #else
      // Original Autumn Wood matte brushstroke ground:
      // Bright, rich, velvety individual brush dabs even in canopy shade + sunlit golden/marigold/crimson pools!
      albedo = oilPaintGroundDabColor(albedo, P, shadowAttenuation, macroRegion, extraBrokenColor, chromaGate);
    #endif

    // Sun/moon hue derived from real scene light; intensity respects real day/dusk/night energy!
    vec3 normSun = sunMax > 1e-4 ? (sunColor / sunMax) : vec3(0.55, 0.68, 0.95);
    vec3 envHue = envLum > 1e-4 ? clamp(envIrr / max(envLum, 1e-4), vec3(0.45), vec3(1.45)) : vec3(0.52, 0.64, 0.96);
    float dayWeight = smoothstep(0.18, 0.65, sceneEnergy);
    vec3 warmLightMul = mix(vec3(1.12, 1.10, 1.06), vec3(1.22, 1.14, 0.92), chromaGate * dayWeight);

    #if defined(TERRAIN_PROJECT_OIL_PAINT_FOLIAGE)
      vec3 colLight = albedo * mix(vec3(1.14, 1.14, 1.16), vec3(1.26, 1.14, 0.90), chromaGate * dayWeight);
      vec3 colMid = albedo * 0.96;
      vec3 colShade = albedo * vec3(0.56, 0.52, 0.64) + vec3(0.015, 0.014, 0.024) * envEnergy;
    #else
      vec3 colLight = albedo * warmLightMul + vec3(0.018, 0.014, 0.006) * chromaGate * directEnergy;
      vec3 colMid = albedo * 0.96;
      // Warm, luminous matte shadow in daytime, deep atmospheric shadow at night (never self-glowing!).
      vec3 colShade = albedo * vec3(0.72, 0.67, 0.68) + vec3(0.016, 0.013, 0.015) * envEnergy;
    #endif

    vec3 painted = mix(colShade, colMid, smoothstep(0.18, 0.36, bandX));
    painted = mix(painted, colLight, smoothstep(0.48, 0.66, bandX));

    // Gentle warm/cool broken-color dab temperature contrast (harmonious across stone, ground & foliage).
    float dabContrast = mix(0.24, 0.62, chromaGate);
    vec3 coolDab = painted * mix(vec3(1.0), vec3(0.92, 0.95, 1.05), dabContrast);
    vec3 warmDab = painted * mix(vec3(1.0), vec3(1.10, 1.04, 0.92), dabContrast);
    painted = mix(coolDab, warmDab, smoothstep(0.26, 0.74, pigment));

    // Warm earthy bounce from forest floor (scaled by real scene energy so it vanishes cleanly at night).
    vec3 bounceTint = mix(vec3(1.00, 0.92, 0.82), vec3(1.08, 0.80, 0.48), chromaGate);
    painted += (albedo * 0.42 + vec3(0.022) * envEnergy) * bounceTint * max(-N.y * 0.5 + 0.5, 0.0) * (1.0 - lit) * 0.28 * dayWeight;
    painted = mix(painted, painted * vec3(0.95, 0.97, 1.04), (1.0 - lit) * max(N.y, 0.0) * 0.16);

    // Luminous stepped painterly illumination driven by real scene direct + ambient energy (daytime 14:00 = 0.74..1.24, night = moonlit dark).
    float shadeFloor = 0.74 * envEnergy;
    float litCeiling = max(0.80 * envEnergy, 1.24 * directEnergy);
    float lightLevel = mix(shadeFloor, litCeiling, smoothstep(0.16, 0.64, bandX));
    vec3 shadeTint = mix(envHue, vec3(0.96, 0.95, 0.98), dayWeight);
    vec3 directTint = mix(vec3(0.99) * envHue, normSun * 1.08, 0.72);
    vec3 sunTint = mix(shadeTint, directTint, smoothstep(0.20, 0.64, bandX));
    // Nocturnal Purkinje shift: at low night energy, gently desaturate warm daytime autumn pigments into cool moonlit indigo.
    float paintedLuma = dot(painted, vec3(0.2126, 0.7152, 0.0722));
    painted = mix(vec3(paintedLuma) * envHue * vec3(0.88, 0.94, 1.15), painted, mix(0.42, 1.0, dayWeight));
    painted *= lightLevel * sunTint;

    #if defined(TERRAIN_PROJECT_OIL_PAINT_FOLIAGE)
      painted += albedo * normSun * backlit * shadowAttenuation * 0.28 * directEnergy;
    #else
      painted += albedo * normSun * backlit * shadowAttenuation * (0.12 + 0.14 * chromaGate) * directEnergy;
    #endif

    // Matte creamy oil-paint thickness modulation (ZERO glossy plastic white edges!).
    float impasto = max(scene_OilPaintImpasto, 0.0);
    painted *= mix(0.92, 1.08, height);
    painted *= max(0.72, 1.0 + rake * 0.24 * impasto);
    painted += mix(vec3(1.0, 0.98, 0.94), vec3(1.0, 0.96, 0.86), chromaGate) * pow(max(rake, 0.0), 2.0) * 0.025 * impasto * sceneEnergy;

    // Include real local PointLights (e.g. cottage wall lamps at night) so warm pools illuminate nearby ground & trees.
    #ifdef SCENE_POINT_LIGHT_COUNT
      for (int i = 0; i < SCENE_POINT_LIGHT_COUNT; i++) {
        PointLight pl = getPointLight(i);
        if (dot(pl.color, pl.color) > 1e-6 && pl.distance > 1e-4) {
          vec3 lVec = pl.position - P;
          float lDist = length(lVec);
          if (lDist < pl.distance) {
            vec3 lDir = lVec / max(lDist, 1e-4);
            float atten = clamp(1.0 - pow(lDist / pl.distance, 4.0), 0.0, 1.0);
            float pNdl = max(dot(N, lDir), 0.0) * 0.85 + 0.15;
            painted += albedo * pl.color * (atten * atten * pNdl * 0.65);
          }
        }
      }
    #endif

    // Lightweight wetness specular (zero PBR/IBL cost): matte when dry, glossy oiled glint when rain wets surfaces.
    vec3 H = normalize(sunDir + V);
    float wetSpec = pow(max(dot(N, H), 0.0), mix(16.0, 96.0, smoothness)) * smoothness * smoothness * shadowAttenuation * directEnergy;

    result.directDiffuse = max(painted, vec3(0.0));
    result.directSpecular = normSun * wetSpec * 0.38;
    result.environmentDiffuse = vec3(0.0);
    result.environmentSpecular = vec3(0.0);
  }
#endif

#ifndef TERRAIN_PROJECT_PREPARE_ALBEDO
  #define TERRAIN_PROJECT_PREPARE_ALBEDO(viewDirection, albedoColor, shadowAttenuation) albedoColor
#endif

vec3 terrainProjectEvaluateSpecularIBL(SurfaceData surfaceData, BSDFData bsdfData, vec3 radiance) {
  float specularAO = evaluateSpecularOcclusion(surfaceData.dotNV, bsdfData.diffuseAO, bsdfData.roughness);
  return specularAO * radiance *
    envBRDFApprox(bsdfData.resolvedSpecularF0, bsdfData.specularF90, bsdfData.roughness, surfaceData.dotNV) *
    bsdfData.energyCompensation;
}

TerrainProjectLightingResult evaluateTerrainProjectLightingWithShadow(Varyings varyings, SurfaceData surfaceData, float shadowAttenuation) {
  TerrainProjectLightingResult result;
  result.directDiffuse = vec3(0.0);
  result.directSpecular = vec3(0.0);
  result.environmentDiffuse = vec3(0.0);
  result.environmentSpecular = vec3(0.0);
  result.shadowAttenuation = shadowAttenuation;
  surfaceData.albedoColor = TERRAIN_PROJECT_PREPARE_ALBEDO(
    surfaceData.viewDir,
    surfaceData.albedoColor,
    result.shadowAttenuation
  );

  float directShadowAttenuation = result.shadowAttenuation;
  #if (defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME) || defined(RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION)) && defined(MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION)
    // Shadow maps own resolved near-field visibility. As their engine-authored fade
    // reaches one, the main directional light transfers to the generator's conserved
    // canopy proxy instead of letting distant crowns become uniformly sunlit.
    float canopyDirectFallbackWeight = 1.0;
    #ifdef NEED_CALCULATE_SHADOWS
      canopyDirectFallbackWeight = getShadowFade(varyings.positionWS);
    #endif
    float canopyDirectVisibility = mix(
      1.0,
      clamp(surfaceData.ambientOcclusion, 0.0, 1.0),
      canopyDirectFallbackWeight
    );
    #ifdef NEED_CALCULATE_SHADOWS
      directShadowAttenuation *= canopyDirectVisibility;
    #endif
  #endif
  #ifdef SCENE_OIL_PAINT_STYLE
    // Short-circuit full PBR + IBL evaluation when oil-paint shading owns the substrate diffuse.
    #if (defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME) || defined(RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION)) && \
      defined(MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION) && !defined(NEED_CALCULATE_SHADOWS)
      directShadowAttenuation *= canopyDirectVisibility;
    #endif
    #ifdef TERRAIN_PROJECT_HAS_OIL_PAINT_LEAF_ID
      float oilLeafId = terrainProjectOilPaintLeafId(varyings);
    #else
      float oilLeafId = -1.0;
    #endif
    oilPaintEvaluateLighting(surfaceData, directShadowAttenuation, oilLeafId, result);
  #else
    BSDFData bsdfData;
    initBSDFData(surfaceData, bsdfData);
    evaluateDirectRadiance(
      varyings,
      surfaceData,
      bsdfData,
      directShadowAttenuation,
      result.directDiffuse,
      result.directSpecular
    );
    #if (defined(RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME) || defined(RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION)) && \
      defined(MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION) && !defined(NEED_CALCULATE_SHADOWS)
      result.directDiffuse *= canopyDirectVisibility;
      result.directSpecular *= canopyDirectVisibility;
    #endif
    #ifdef TERRAIN_PROJECT_WATER_LAYER
      // Terrain owns a separated water-film layer; sample SSR exclusively on the water film, not the substrate.
      evaluateDiffuseIBL(varyings, surfaceData, bsdfData, result.environmentDiffuse);
      vec3 substrateRadiance = getLightProbeRadiance(surfaceData, surfaceData.normal, bsdfData.roughness);
      result.environmentSpecular += terrainProjectEvaluateSpecularIBL(surfaceData, bsdfData, substrateRadiance);
    #else
      evaluateIBL(
        varyings,
        surfaceData,
        bsdfData,
        result.environmentDiffuse,
        result.environmentSpecular
      );
    #endif
  #endif
  return result;
}

#ifndef TERRAIN_PROJECT_GROUND_SHADOW_PCF
TerrainProjectLightingResult evaluateTerrainProjectLighting(Varyings varyings, SurfaceData surfaceData) {
  return evaluateTerrainProjectLightingWithShadow(varyings, surfaceData, sampleTerrainProjectShadow(varyings));
}
#endif

TerrainProjectLightingResult terrainProjectCreateLightingResult() {
  TerrainProjectLightingResult result;
  result.directDiffuse = vec3(0.0);
  result.directSpecular = vec3(0.0);
  result.environmentDiffuse = vec3(0.0);
  result.environmentSpecular = vec3(0.0);
  result.shadowAttenuation = 1.0;
  return result;
}

void terrainProjectAccumulateLighting(
  inout TerrainProjectLightingResult total,
  TerrainProjectLightingResult contribution,
  float weight
) {
  total.directDiffuse += contribution.directDiffuse * weight;
  total.directSpecular += contribution.directSpecular * weight;
  total.environmentDiffuse += contribution.environmentDiffuse * weight;
  total.environmentSpecular += contribution.environmentSpecular * weight;
  total.shadowAttenuation = contribution.shadowAttenuation;
}

#ifdef TERRAIN_PROJECT_WATER_LAYER
  void terrainProjectApplyWaterFilmLighting(
    Varyings varyings,
    SurfaceData substrate,
    TerrainProjectWaterFilm waterFilm,
    float ssrDepthSlope,
    inout TerrainProjectLightingResult result
  ) {
    if (waterFilm.coverage > 0.0) {
      // The water interface transmits the remaining energy to the already evaluated substrate.
      // Terrain owns this water-film interface explicitly and evaluates it with the standard BSDF.
      float waterFresnel = F_Schlick(terrainProjectWaterF0(), 1.0, waterFilm.dotNV);
      float substrateTransmission = 1.0 - waterFilm.coverage * waterFresnel;
      result.directDiffuse *= substrateTransmission;
      result.directSpecular *= substrateTransmission;
      result.environmentDiffuse *= substrateTransmission;
      result.environmentSpecular *= substrateTransmission;

      SurfaceData waterSurface = terrainProjectBuildWaterFilmSurface(substrate, waterFilm);
      BSDFData waterBsdfData;
      initBSDFData(waterSurface, waterBsdfData);
      vec3 unusedDiffuse = vec3(0.0);
      vec3 directSpecular = vec3(0.0);
      float shadowAttenuation = result.shadowAttenuation;
      evaluateDirectRadiance(
        varyings,
        waterSurface,
        waterBsdfData,
        shadowAttenuation,
        unusedDiffuse,
        directSpecular
      );
      vec3 radiance = getLightProbeRadiance(waterSurface, waterSurface.normal, waterBsdfData.roughness);
      #ifdef CAMERA_ENABLE_SSR
        float ssrMix = saturate(scene_TerrainWaterCoverageParams.w);
        if (ssrMix > 0.0 && waterFilm.coverage > 0.005) {
          float ssrFragEyeDepth = remapDepthBufferEyeDepth(gl_FragCoord.z);
          vec3 ssrRadiance = evaluateScreenSpaceReflectionWithDepth(
            varyings.positionCS,
            waterSurface.normal,
            waterBsdfData.roughness,
            radiance,
            ssrFragEyeDepth,
            ssrDepthSlope
          );
          radiance = mix(radiance, ssrRadiance, ssrMix);
        }
      #endif
      vec3 environmentSpecular = terrainProjectEvaluateSpecularIBL(waterSurface, waterBsdfData, radiance);
      float reflectionIntensity = scene_TerrainWaterCoverageParams.z;
      result.directSpecular += directSpecular * waterFilm.coverage * reflectionIntensity;
      result.environmentSpecular += environmentSpecular * waterFilm.coverage * reflectionIntensity;
    }
  }
#endif

vec3 terrainProjectFinalLighting(TerrainProjectLightingResult result) {
  return result.directDiffuse + result.directSpecular + result.environmentDiffuse + result.environmentSpecular;
}

#endif
