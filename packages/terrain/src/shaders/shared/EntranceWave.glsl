#ifndef TERRAIN_PROJECT_ENTRANCE_WAVE_INCLUDED
#define TERRAIN_PROJECT_ENTRANCE_WAVE_INCLUDED

#ifdef TERRAIN_PROJECT_ENTRANCE_WAVE
  vec3 scene_EntranceWaveCenter;
  vec3 scene_EntranceWaveDirection;
  float scene_EntranceWaveSweep;
  float scene_EntranceWaveBand;
  float scene_EntranceWaveLift;
  float scene_EntranceWaveHeightSweep;
  float scene_EntranceWaveHeightBand;
  float scene_EntranceWaveHeightMin;
  float scene_EntranceWaveHeightMax;

  float terrainProjectEntranceWaveCoordinate(vec3 worldPosition) {
    vec2 offset = worldPosition.xz - scene_EntranceWaveCenter.xz;
    return length(offset);
  }

  float terrainProjectEntranceWaveCellNoise(vec2 cell) {
    return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float terrainProjectEntranceWaveNoise(vec2 position) {
    vec2 cell = floor(position);
    vec2 local = fract(position);
    local = local * local * (3.0 - 2.0 * local);
    float lowerLeft = terrainProjectEntranceWaveCellNoise(cell);
    float lowerRight = terrainProjectEntranceWaveCellNoise(cell + vec2(1.0, 0.0));
    float upperLeft = terrainProjectEntranceWaveCellNoise(cell + vec2(0.0, 1.0));
    float upperRight = terrainProjectEntranceWaveCellNoise(cell + vec2(1.0, 1.0));
    return mix(mix(lowerLeft, lowerRight, local.x), mix(upperLeft, upperRight, local.x), local.y);
  }

  float terrainProjectEntranceWaveReveal(vec3 worldPosition) {
    if (scene_EntranceWaveHeightBand < 0.0) return 1.0;
    float coordinate = terrainProjectEntranceWaveCoordinate(worldPosition);
    float band = max(scene_EntranceWaveBand, 1.0);
    float edgeJitter = (terrainProjectEntranceWaveNoise(worldPosition.xz * 1.8) - 0.5) * band * 0.85;
    return 1.0 - smoothstep(
      scene_EntranceWaveSweep - band + edgeJitter,
      scene_EntranceWaveSweep + band + edgeJitter,
      coordinate
    );
  }

  vec3 terrainProjectEntranceWaveSpectrum(float phase) {
    vec3 raw = clamp(abs(mod(fract(phase) * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return pow(raw, vec3(2.2));
  }

  vec3 applyTerrainProjectEntranceWave(vec3 color, vec3 worldPosition) {
    float coordinate = terrainProjectEntranceWaveCoordinate(worldPosition);
    float band = max(scene_EntranceWaveBand, 1.0);
    float dist = abs(coordinate - scene_EntranceWaveSweep);
    float edge = 1.0 - smoothstep(0.0, band * 0.95, dist);
    float core = 1.0 - smoothstep(0.0, band * 0.45, dist);
    float waveFade = scene_EntranceWaveHeightBand < 0.0 ? clamp(-scene_EntranceWaveHeightBand, 0.0, 1.0) : 1.0;
    float cellNoise = terrainProjectEntranceWaveNoise(worldPosition.xz * 0.85);
    float bandNorm = (coordinate - scene_EntranceWaveSweep) / band;
    float sweepPhase = bandNorm * 0.92 + coordinate * 0.055 + (worldPosition.x - worldPosition.z) * 0.018 + cellNoise * 0.22;
    vec3 crestColor = terrainProjectEntranceWaveSpectrum(sweepPhase);
    float glowMask = clamp(edge * waveFade, 0.0, 1.0);
    vec3 prism = crestColor * (2.6 + core * 1.4 + cellNoise * 0.45);
    return mix(color, color * 0.22 + prism, clamp(glowMask * 0.92, 0.0, 0.92));
  }

  vec3 terrainProjectApplyEntranceWavePosition(vec3 worldPosition) {
    float coordinate = terrainProjectEntranceWaveCoordinate(worldPosition);
    float band = max(scene_EntranceWaveBand, 1.0);
    float normalizedCoordinate = (coordinate - scene_EntranceWaveSweep) / band;
    float envelope = 1.0 - smoothstep(0.08, 1.0, abs(normalizedCoordinate));
    float phase = normalizedCoordinate * 10.0 + sin(worldPosition.x * 0.045) * 0.7;
    float verticalOffset = sin(phase) * envelope * scene_EntranceWaveLift;
    return worldPosition + vec3(0.0, verticalOffset, 0.0);
  }

  float terrainProjectEntranceWaveHeightReveal(float sourceWorldY) {
    if (scene_EntranceWaveHeightBand < 0.0) return 1.0;
    float band = max(scene_EntranceWaveHeightBand, 1.0);
    return 1.0 - smoothstep(
      scene_EntranceWaveHeightSweep - band,
      scene_EntranceWaveHeightSweep + band,
      sourceWorldY
    );
  }

  vec3 terrainProjectApplyEntranceWaveHeightPosition(vec3 worldPosition, float sourceWorldY) {
    float amount = terrainProjectEntranceWaveHeightReveal(sourceWorldY);
    float crest = amount * (1.0 - amount) * 4.0;
    return worldPosition + vec3(0.0, crest * scene_EntranceWaveLift * 0.24, 0.0);
  }
#endif

#if defined(RENDERER_GENERATION_REVEAL) && !defined(TERRAIN_PROJECT_CLIPMAP_GEOMETRY)
  #ifdef MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION
    // Linear tint + spectrum blend; relative width, minimum metres, intensity, cycles/metre.
    vec4 material_TreeDissolveColor;
    vec4 material_TreeDissolveShape;
    vec4 material_TreeDissolveSpectrum;
    vec3 material_TreeDissolvePhase;
  #endif
  float renderer_GenerationRevealLift;
  #if defined(RENDERER_COMPACT_GENERATION_REVEAL) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE) && !defined(RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE)
    vec3 renderer_GenerationRevealLocalCenter;
    vec3 renderer_GenerationRevealLocalExtent;
  #endif
  #if !(defined(RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE) && !defined(RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE) && !defined(RENDERER_ASSET_ASSEMBLY_COMPACT_INSTANCE))
    float renderer_GenerationRevealProgress;
    float renderer_GenerationRevealOriginY;
    float renderer_GenerationRevealHeight;
  #endif

  vec4 terrainProjectGenerationRevealData(float sourceWorldY, Attributes attributes) {
    #if defined(RENDERER_COMPACT_GENERATION_REVEAL) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE) && !defined(RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE)
      vec3 center = terrainProjectAssetAssemblyRotate(attributes.ASSEMBLY_ROTATION,
        renderer_GenerationRevealLocalCenter * attributes.ASSEMBLY_SCALE.xyz);
      vec3 extent = renderer_GenerationRevealLocalExtent * abs(attributes.ASSEMBLY_SCALE.xyz);
      float radiusY = abs(terrainProjectAssetAssemblyRotate(attributes.ASSEMBLY_ROTATION, vec3(extent.x, 0.0, 0.0)).y)
        + abs(terrainProjectAssetAssemblyRotate(attributes.ASSEMBLY_ROTATION, vec3(0.0, extent.y, 0.0)).y)
        + abs(terrainProjectAssetAssemblyRotate(attributes.ASSEMBLY_ROTATION, vec3(0.0, 0.0, extent.z)).y);
      return vec4(sourceWorldY, attributes.ASSEMBLY_SCALE.w,
        attributes.ASSEMBLY_POSITION.y + center.y - radiusY, max(radiusY * 2.0, 0.001));
    #elif defined(RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE) && !defined(RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE) && !defined(RENDERER_ASSET_ASSEMBLY_COMPACT_INSTANCE)
      vec4 data = vec4(sourceWorldY, attributes.ASSEMBLY_COLOR.yzw);
      #if defined(MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION) && defined(RENDERER_PROCEDURAL_TREE_GPU_VARIATION)
        if (data.y <= 1.5) {
          float densityProgress = terrainProjectProceduralTreeDensityReveal(attributes);
          float elementDistance = attributes.TREE_VARIATION_DATA.w;
          #ifndef RENDERER_PROCEDURAL_TREE_GPU_BRANCH_VARIATION
            // Append the leaf's own root-to-tip length to its supporting branch path.
            float leafLength = attributes.TEXCOORD_1.y * 2.0;
            elementDistance += clamp(attributes.TEXCOORD_0.y, 0.0, 1.0) * leafLength;
          #endif
          // Evaluate the independent whole-instance entrance before changing coordinates.
          float entranceBand = max(data.w * material_TreeDissolveShape.x, material_TreeDissolveShape.y);
          float entranceThreshold = mix(-entranceBand, data.w + entranceBand, clamp(data.y, 0.0, 1.0));
          float entranceAmount = 1.0 - smoothstep(entranceThreshold - entranceBand,
            entranceThreshold + entranceBand, sourceWorldY - data.z);
          data.x = elementDistance;
          data.w = max(attributes.TREE_VARIATION_ROOT.w, 0.000001);
          data.z = 0.0;
          data.y = min(densityProgress, entranceAmount);
        }
      #endif
      return data;
    #elif defined(RENDERER_INSTANCE_GENERATION_REVEAL) && defined(RENDERER_ASSET_ASSEMBLY_INSTANCE)
      return vec4(
        sourceWorldY,
        mix(1.0, renderer_GenerationRevealProgress, attributes.GENERATION_REVEAL.x),
        attributes.GENERATION_REVEAL.yz
      );
    #else
      return vec4(
        sourceWorldY,
        renderer_GenerationRevealProgress,
        renderer_GenerationRevealOriginY,
        renderer_GenerationRevealHeight
      );
    #endif
  }

  float terrainProjectGenerationRevealAmountFromHeight(float sourceHeight, float progress, float height) {
    // Values >= 1.0 (including [2.0, 3.0] non-clipping update sweep) keep geometry unconditionally visible.
    if (progress >= 1.0) return 1.0;
    progress = clamp(progress, 0.0, 1.0);
    #ifdef MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION
      float band = max(height * material_TreeDissolveSpectrum.w, material_TreeDissolveShape.y);
    #else
      float band = max(height * 0.11, 0.24);
    #endif
    float threshold = mix(-band, height + band, progress);
    return 1.0 - smoothstep(threshold - band, threshold + band, sourceHeight);
  }

  float terrainProjectGenerationRevealAmount(vec4 revealData) {
    return terrainProjectGenerationRevealAmountFromHeight(
      revealData.x - revealData.z,
      revealData.y,
      revealData.w
    );
  }

  vec3 terrainProjectApplyGenerationRevealPosition(vec3 worldPosition, vec4 revealData) {
    float sourceHeight = revealData.x - revealData.z;
    float crest = 0.0;
    if (revealData.y > 1.5) {
      float sweepProgress = clamp(revealData.y - 2.0, 0.0, 1.0);
      float sweepBand = max(revealData.w * 0.16, 0.28);
      float sweep = mix(-sweepBand, revealData.w + sweepBand, sweepProgress);
      crest = (1.0 - smoothstep(0.0, sweepBand, abs(sourceHeight - sweep))) * sin(sweepProgress * 3.14159265);
    } else {
      float amount = terrainProjectGenerationRevealAmountFromHeight(sourceHeight, revealData.y, revealData.w);
      crest = amount * (1.0 - amount) * 4.0;
    }
    #ifdef MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION
      float requestedLift = crest * material_TreeDissolveSpectrum.z;
    #else
      float requestedLift = crest * renderer_GenerationRevealLift * 0.26;
    #endif
    // Keep presentation-only deformation inside the semantic reveal interval used by CPU culling.
    // The entrance may lift a vertex toward the interval ceiling, but never beyond it.
    float conservativeLift = min(requestedLift, max(revealData.w - sourceHeight, 0.0));
    return worldPosition + vec3(0.0, conservativeLift, 0.0);
  }

  vec3 terrainProjectVividRainbow(float phase) {
    vec3 raw = clamp(abs(mod(fract(phase) * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return pow(raw, vec3(2.2));
  }

  vec3 terrainProjectApplyGenerationRevealTint(vec3 color, vec4 revealData, vec3 tint) {
    float edge = 0.0;
    float relY = revealData.x - revealData.z;
    float normY = clamp(relY / max(revealData.w, 0.001), 0.0, 1.0);
    float sweepShift = 0.0;
    if (revealData.y > 1.5) {
      float sweepProgress = clamp(revealData.y - 2.0, 0.0, 1.0);
      float sweepBand = max(revealData.w * 0.26, 0.55);
      float sweep = mix(-sweepBand, revealData.w + sweepBand, sweepProgress);
      edge = (1.0 - smoothstep(0.0, sweepBand, abs(relY - sweep))) *
        sin(sweepProgress * 3.14159265);
      sweepShift = sweepProgress * 1.45;
    } else {
      #ifdef MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION
        float sweepBand = max(revealData.w * material_TreeDissolveSpectrum.w, material_TreeDissolveShape.y);
        float edgeBand = max(revealData.w * max(material_TreeDissolveShape.x, 0.20), max(material_TreeDissolveShape.y, 0.45));
        float sweep = mix(-sweepBand, revealData.w + sweepBand, clamp(revealData.y, 0.0, 1.0));
        edge = (1.0 - smoothstep(0.0, edgeBand, abs(relY - sweep))) *
          step(0.000001, revealData.y) * (1.0 - step(1.0, revealData.y));
        sweepShift = revealData.y * 1.2;
      #else
        float amount = terrainProjectGenerationRevealAmount(revealData);
        edge = amount * (1.0 - amount) * 4.0;
        sweepShift = revealData.y * 1.2;
      #endif
    }
    if (edge <= 0.001) return color;
    float heightPhase = fract(normY * 1.65 + relY * 0.22 - sweepShift);
    vec3 prism = terrainProjectVividRainbow(heightPhase);
    float mask = clamp(edge, 0.0, 1.0);
    return mix(color, color * 0.22 + prism * 2.75, clamp(mask * 0.90, 0.0, 0.90));
  }
  vec3 terrainProjectApplyGenerationRevealColor(vec3 color, vec4 revealData) {
    #ifdef MATERIAL_PROCEDURAL_TREE_DENSITY_TRANSITION
      return terrainProjectApplyGenerationRevealTint(color, revealData, material_TreeDissolveColor.rgb);
    #else
      return terrainProjectApplyGenerationRevealTint(color, revealData, vec3(1.0));
    #endif
  }

#endif

#endif
