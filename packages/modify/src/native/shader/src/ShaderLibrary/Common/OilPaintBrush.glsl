#ifndef OIL_PAINT_BRUSH_INCLUDED
#define OIL_PAINT_BRUSH_INCLUDED

#ifdef SCENE_OIL_PAINT_STYLE
  sampler2D scene_OilPaintBrushTexture;
  float scene_OilPaintImpasto;
  float scene_OilPaintBrushScale;
  // CPU-published seasonal oil-paint palette (smoothly interpolated by scene_SeasonState; zero hardcoded season RGB).
  // Dab0.a = palette blend strength, Dab1.a = chroma gate threshold (negative in winter so white snow receives snow dabs).
  vec4 scene_OilPaintDab0;
  vec4 scene_OilPaintDab1;
  vec4 scene_OilPaintDab2;
  vec4 scene_OilPaintDab3;
  vec4 scene_OilPaintCoolTint;
  vec4 scene_OilPaintWarmTint;

  #ifdef OIL_PAINT_BRUSH_PLANAR_ANTI_TILE
    // Lightweight dual-rotated height-blend anti-tiling for large horizontal terrain planes (zero sin/cos, zero noise ALU).
    vec4 sampleOilPaintBrushPlanarAntiTile(vec2 xz, float scale) {
      vec2 uvA = xz * scale;
      vec2 uvB = vec2(0.793 * xz.x - 0.609 * xz.y, 0.609 * xz.x + 0.793 * xz.y) * (scale * 0.67);
      vec4 bA = texture2D(scene_OilPaintBrushTexture, uvA);
      vec4 bB = texture2D(scene_OilPaintBrushTexture, uvB);
      float pickB = smoothstep(-0.04, 0.04, bB.r - bA.r);
      vec4 brush = mix(bA, bB, pickB);
      brush.a = fract(brush.a + (pickB > 0.5 ? 0.37 : 0.0));
      return brush;
    }
  #endif

  // Conditional triplanar impasto brush sampler: 2-tap planar anti-tile on Terrain only, 1-tap elsewhere, skips zero-weight axes.
  // Channels: R = thickness height, G = dH/dx, B = dH/dy, A = per-stroke pigment ID.
  vec4 sampleOilPaintBrush(vec3 samplePos, vec3 sampleNormal, float scale) {
    vec3 a = max(abs(sampleNormal), vec3(1e-4));
    vec3 a2 = a * a;
    vec3 w = a2 * a2;
    w /= max(w.x + w.y + w.z, 1e-4);

    vec4 acc = vec4(0.0);
    if (w.x > 0.05) {
      acc += texture2D(scene_OilPaintBrushTexture, samplePos.zy * scale) * w.x;
    }
    if (w.y > 0.05) {
      #ifdef OIL_PAINT_BRUSH_PLANAR_ANTI_TILE
        acc += sampleOilPaintBrushPlanarAntiTile(samplePos.xz, scale) * w.y;
      #else
        acc += texture2D(scene_OilPaintBrushTexture, samplePos.xz * scale) * w.y;
      #endif
    }
    if (w.z > 0.05) {
      acc += texture2D(scene_OilPaintBrushTexture, samplePos.xy * scale) * w.z;
    }
    return acc;
  }

  vec3 sampleOilPaintSeasonDab(float pigment) {
    return pigment < 0.27
      ? scene_OilPaintDab0.rgb
      : (pigment < 0.54
        ? scene_OilPaintDab1.rgb
        : (pigment < 0.78 ? scene_OilPaintDab2.rgb : scene_OilPaintDab3.rgb));
  }

  void applyOilPaintBrushSurface(
    vec3 samplePos,
    vec3 sampleNormal,
    float scaleMultiplier,
    float seasonalPaletteStrength,
    inout vec3 albedo,
    inout vec3 shadingNormal,
    inout float roughness
  ) {
    float scale = max(scene_OilPaintBrushScale, 0.05) * scaleMultiplier;
    vec4 brush = sampleOilPaintBrush(samplePos, sampleNormal, scale);
    float impasto = clamp(scene_OilPaintImpasto, 0.0, 2.0);
    float height = brush.r;
    vec2 grad = (brush.gb * 2.0 - 1.0) * (0.48 * impasto);
    float pigment = brush.a;

    // Seasonal brushstroke palette modulation (100% CPU-driven via scene_OilPaintDab0..3; 0 on animals/buildings/stone/bark).
    float maxC = max(albedo.r, max(albedo.g, albedo.b));
    float minC = min(albedo.r, min(albedo.g, albedo.b));
    float chroma = (maxC - minC) / max(maxC, 1e-4);
    if (seasonalPaletteStrength > 0.001 && scene_OilPaintDab0.a > 0.001) {
      float chromaMask = smoothstep(scene_OilPaintDab1.a, scene_OilPaintDab1.a + 0.28, chroma);
      float palWeight = clamp(seasonalPaletteStrength * scene_OilPaintDab0.a * chromaMask, 0.0, 0.92);
      float baseLuma = max(dot(albedo, vec3(0.2126, 0.7152, 0.0722)), 0.05);
      vec3 seasonDab = sampleOilPaintSeasonDab(pigment);
      float dabLuma = max(dot(seasonDab, vec3(0.2126, 0.7152, 0.0722)), 0.08);
      float lumaGain = clamp(sqrt(baseLuma / dabLuma), 0.78, 1.35);
      albedo = mix(albedo, seasonDab * lumaGain, palWeight);
    }

    // Seasonal warm/cool broken-color brushstroke temperature & tactile impasto height/rake relief.
    // Tangent-space normal reconstruction is intentionally omitted (matte roughness >= 0.84; albedo height+rake provides relief).
    float dabMix = mix(0.26, 0.68, smoothstep(0.08, 0.36, chroma));
    vec3 coolDab = mix(vec3(1.0), scene_OilPaintCoolTint.rgb, dabMix);
    vec3 warmDab = mix(vec3(1.0), scene_OilPaintWarmTint.rgb, dabMix);
    float rake = 0.55 * grad.x - 0.78 * grad.y;
    float relief = mix(0.84, 1.16, height) * max(0.72, 1.0 + rake * 0.78);
    albedo *= mix(coolDab, warmDab, smoothstep(0.22, 0.78, pigment)) * relief;

    roughness = max(roughness, 0.84);
  }

  void applyOilPaintBrushSurface(
    vec3 samplePos,
    vec3 sampleNormal,
    float scaleMultiplier,
    inout vec3 albedo,
    inout vec3 shadingNormal
  ) {
    float dummyRoughness = 0.84;
    applyOilPaintBrushSurface(samplePos, sampleNormal, scaleMultiplier, 0.0, albedo, shadingNormal, dummyRoughness);
  }
#endif

#endif
