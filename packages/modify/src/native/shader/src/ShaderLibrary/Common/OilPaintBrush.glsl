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
  vec4 scene_OilPaintShadeTint;

  float oilPaintBrushHash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float oilPaintBrushNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(oilPaintBrushHash21(i), oilPaintBrushHash21(i + vec2(1.0, 0.0)), u.x),
      mix(oilPaintBrushHash21(i + vec2(0.0, 1.0)), oilPaintBrushHash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  // Dual-rotated anti-tiling winner-takes-all brushstroke sampler for horizontal planes (meadow, snow, rooftops):
  // eliminates periodic tiling while keeping each overlapping flat-brush dab sharp and unblurred.
  vec4 sampleOilPaintBrushPlanarAntiTile(vec2 xz, float scale) {
    vec2 warp = vec2(sin(xz.x * 0.14 + xz.y * 0.09), cos(xz.y * 0.15 - xz.x * 0.11)) * 0.34;
    vec2 uvA = (xz + warp) * scale;
    vec2 wB = xz - warp * 0.65;
    vec2 uvB = vec2(0.793 * wB.x - 0.609 * wB.y, 0.609 * wB.x + 0.793 * wB.y) * (scale * 0.68);
    vec4 bA = texture2D(scene_OilPaintBrushTexture, uvA);
    vec4 bB = texture2D(scene_OilPaintBrushTexture, uvB);
    float blend = smoothstep(0.25, 0.75, oilPaintBrushNoise(xz * 0.22));
    float pickB = smoothstep(-0.025, 0.025, (bB.r + blend * 0.22) - (bA.r + (1.0 - blend) * 0.22));
    vec4 brush = mix(bA, bB, pickB);
    brush.a = fract(brush.a + (pickB > 0.5 ? 0.37 : 0.0));
    return brush;
  }

  // Unified triplanar impasto brush sampler (anti-tiled on top/bottom planes, seamless on 3D faces).
  // Channels: R = thickness height, G = dH/dx, B = dH/dy, A = per-stroke pigment ID.
  vec4 sampleOilPaintBrush(vec3 samplePos, vec3 sampleNormal, float scale) {
    vec3 w = pow(max(abs(sampleNormal), vec3(1e-4)), vec3(4.0));
    w /= max(w.x + w.y + w.z, 1e-4);
    vec4 bx = texture2D(scene_OilPaintBrushTexture, samplePos.zy * scale);
    vec4 by = sampleOilPaintBrushPlanarAntiTile(samplePos.xz, scale);
    vec4 bz = texture2D(scene_OilPaintBrushTexture, samplePos.xy * scale);
    return bx * w.x + by * w.y + bz * w.z;
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
    float nLen = length(shadingNormal);
    vec3 n = nLen > 1e-5 ? shadingNormal / nLen : vec3(0.0, 1.0, 0.0);
    float sLen = length(sampleNormal);
    vec3 sn = sLen > 1e-5 ? sampleNormal / sLen : vec3(0.0, 1.0, 0.0);

    float scale = max(scene_OilPaintBrushScale, 0.05) * scaleMultiplier;
    vec4 brush = sampleOilPaintBrush(samplePos, sn, scale);
    float impasto = clamp(scene_OilPaintImpasto, 0.0, 2.0);
    float height = brush.r;
    vec2 grad = (brush.gb * 2.0 - 1.0) * (0.48 * impasto);
    float pigment = brush.a;

    // Perturb shading normal along tangent plane for physical impasto relief under real scene lighting.
    vec3 upRef = abs(n.y) < 0.92 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 tAxis = normalize(cross(upRef, n));
    vec3 bAxis = cross(n, tAxis);
    shadingNormal = normalize(n + tAxis * grad.x + bAxis * grad.y);

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
