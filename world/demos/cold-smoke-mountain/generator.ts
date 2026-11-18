import type {
  ColdSmokeMountainRecipe,
  ColdSmokeMountainResult,
  FeatureKind,
  GullyValleyFeature,
  MountainGuideOBB,
  StrataSettings,
  V2,
  V3
} from "./model";

const PI = Math.PI;
const TAU = Math.PI * 2;
const HOME_SEED = 261111;

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function smooth(a: number, b: number, x: number): number {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function smoother(a: number, b: number, x: number): number {
  const t = sat((x - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function hashU(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}

export function hash2U(x: number, y: number): number {
  return hashU(Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca77));
}

function createKeyedNoise(seed: number) {
  const normalized = Math.floor(Math.abs(seed)) || HOME_SEED;
  const key = hashU(normalized) ^ hashU(HOME_SEED);
  const kz = Math.imul(key, 0x9e3779b1);

  const hash2 = (x: number, y: number, s: number): number => {
    const h = hashU(Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s ^ key, 1442695041));
    return (h & 0xffffff) / 0x800000 - 1;
  };

  const vnoise1 = (x: number, s: number): number => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    const sKey = s ^ key;
    const a = (hashU(Math.imul(i, 374761393) ^ sKey) & 0xffffff) / 0x800000 - 1;
    const b = (hashU(Math.imul(i + 1, 374761393) ^ sKey) & 0xffffff) / 0x800000 - 1;
    return a + (b - a) * u;
  };

  const vnoise2 = (x: number, y: number, s: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, s);
    const b = hash2(ix + 1, iy, s);
    const c = hash2(ix, iy + 1, s);
    const d = hash2(ix + 1, iy + 1, s);
    return a + (b - a) * ux + (c - a + (a - b - c + d) * ux) * uy;
  };

  return { key, kz, vnoise1, vnoise2 };
}

/**
 * Cold Smoke's 3D folded rock bedding scalar field (`Course.strata` / `strataAt`).
 * Shared term-for-term between CPU bench carving and the fragment shader.
 */
export function strataAt(x: number, y: number, z: number, settings: StrataSettings): number {
  const bed = Math.max(16, settings.bedThickness);
  const fold = settings.foldStrength;
  const k = TAU / 1024;
  const u =
    y / bed +
    fold *
      (0.84 * Math.sin(k * (x + z) + 1.1 * Math.sin(k * (x - z) + 0.7)) +
        0.32 * Math.sin(2 * k * x + 1.7 * Math.sin(k * z)) +
        0.2 * Math.sin(3 * k * z + 1.3 * Math.sin(k * x) + 1.1) +
        0.09 * Math.sin(4 * k * (x - z) + 2.0 * Math.sin(k * (x + z))));
  const ph = 2.1 * Math.sin(k * (x - z) + 0.4) + 1.3 * Math.sin(2 * k * z + 1.1 * Math.sin(k * x));
  return u + 0.22 * Math.sin(1.9634954 * u + 1.7 + ph) + 0.035 * Math.sin(5.1050881 * u + 0.6 - 0.8 * ph);
}

/**
 * Cold Smoke's jittered-grid slope-perpendicular cosine wave (`gullies()`).
 * Writes [value (-1..1), d/dx, d/dz] into `out`.
 * Feeding `(d/dx, d/dz)` into the next finer octave bends small runnels so they join main couloirs like tributaries.
 */
function sampleGullyWave(
  px: number,
  pz: number,
  dx: number,
  dz: number,
  seed: number,
  key: number,
  out: [number, number, number]
): void {
  const ix = Math.floor(px);
  const iz = Math.floor(pz);
  const fx = px - ix - 0.5;
  const fz = pz - iz - 0.5;
  let v = 0;
  let gx = 0;
  let gz = 0;
  let wt = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      let n = Math.imul(ix + i, 374761393) ^ Math.imul(iz + j, 668265263) ^ seed ^ key;
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      n ^= n >>> 16;
      const qx = fx - i - ((n & 0xffff) / 65536 - 0.5) * 0.5;
      const qz = fz - j - ((n >>> 16) / 65536 - 0.5) * 0.5;
      const d = 1 - (qx * qx + qz * qz) / 1.5625;
      if (d <= 0) continue;
      const wgt = d * d * d;
      const ph = (qx * dx + qz * dz) * TAU;
      const sn = Math.sin(ph);
      v += Math.cos(ph) * wgt;
      gx -= sn * dx * wgt;
      gz -= sn * dz * wgt;
      wt += wgt;
    }
  }
  const invW = wt > 1e-8 ? 1 / wt : 0;
  out[0] = v * invW;
  out[1] = gx * invW;
  out[2] = gz * invW;
}

interface CompiledGuide {
  guide: MountainGuideOBB;
  cosYaw: number;
  sinYaw: number;
  halfW: number;
  halfD: number;
}

function compileGuides(guides: MountainGuideOBB[]): CompiledGuide[] {
  return guides
    .filter((g) => g.enabled)
    .map((guide) => {
      const rad = (guide.yawDegrees * PI) / 180;
      return {
        guide,
        cosYaw: Math.cos(rad),
        sinYaw: Math.sin(rad),
        halfW: Math.max(8, guide.size[0] * 0.5),
        halfD: Math.max(8, guide.size[2] * 0.5)
      };
    });
}

function evaluateGuidesAndCorridor(
  x: number,
  z: number,
  recipe: ColdSmokeMountainRecipe,
  compiledGuides: CompiledGuide[],
  noise: ReturnType<typeof createKeyedNoise>
): { baseHeight: number; wallDistance: number; mountainWeight: number; reliefBoost: number } {
  const s = -z;
  let corridorCenter = 0;
  let corridorEdgeDist = 180;
  let corridorHeight = 0;

  if (recipe.corridor.enabled) {
    const sinuosity = recipe.corridor.sinuosity;
    corridorCenter =
      sinuosity * (135 * noise.vnoise1(s / 1100 + 3.7, recipe.seed) + 42 * noise.vnoise1(s / 370 + 11.3, recipe.seed + 5));
    const u = x - corridorCenter;
    const au = Math.abs(u);
    const hw = Math.max(10, recipe.corridor.halfWidth);
    const e = au - hw;
    corridorEdgeDist = e;
    // Gently sloping valley floor dropping toward -Z (looking out into the panoramic vista) + Cold Smoke's dish and apron -> valley walls
    const baseFall = (z - recipe.domain.minZ - recipe.domain.depth * 0.5) * recipe.corridor.baseSlope;
    const r = au / hw;
    const r1 = r - 1;
    const dish = 1.6 * (r1 < 0 ? r * r : r1 < 0.6 ? 1 + 2 * r1 - (r1 * r1) / 0.6 : 1.6);
    corridorHeight = baseFall + dish;
    if (e > 0) {
      const apron = Math.max(0, recipe.corridor.apronWidth);
      const ea = Math.max(0, e - apron);
      if (apron > 0) corridorHeight += 0.05 * Math.min(e, apron);
      const t = ea / 55;
      const rise = 55 * ((t * t) / (1 + t));
      const near = 150 * (1 - Math.exp(-rise / 150));
      const wallScale = recipe.corridor.wallHeight / 145;
      corridorHeight += wallScale * (0.34 * near + 0.36 * (rise - near));
    }
  }

  // Evaluate OBB Guides:
  // Massif / Wall / Ridge guides raise smooth structural mountain volumes; Basin guides carve bowls/valleys.
  let guideRise = 0;
  let basinCut = 0;
  let guideWallProxy = 0;
  let weightedBoost = 1.0;
  let boostWeightSum = 0;

  for (let i = 0; i < compiledGuides.length; i++) {
    const { guide, cosYaw, sinYaw, halfW, halfD } = compiledGuides[i];
    const dx = x - guide.center[0];
    const dz = z - guide.center[2];
    const lu = dx * cosYaw - dz * sinYaw;
    const lw = dx * sinYaw + dz * cosYaw;

    // Rounded OBB norm: blends box footprint with smooth corner rounding so adjacent guides join naturally
    const nx = Math.abs(lu) / halfW;
    const nz = Math.abs(lw) / halfD;
    const boxNorm = Math.max(nx, nz);
    const ellNorm = Math.hypot(nx, nz);
    const q = guide.role === "ridge" ? lerp(boxNorm, ellNorm, 0.35) : lerp(boxNorm, ellNorm, 0.65);

    // Slope apron extends outside the box footprint based on slopeRate
    const minSpan = Math.min(halfW, halfD);
    const heightM = Math.max(1, guide.size[1]);
    const slopeRunM = heightM / Math.max(0.25, guide.slopeRate);
    const outerQ = 1 + slopeRunM / minSpan;

    if (q >= outerQ) continue;

    // Normalized ascent profile from outer skirt (q = outerQ) to top cap (q <= 1)
    const tIn = sat((outerQ - q) / Math.max(0.15, outerQ - 0.25));
    const smoothAscent = tIn * tIn * (3 - 2 * tIn);

    // Crown shaping: ridge has a sharp spine along local Z (`lw`), massif has a dome/peak, negative has a bowl dish
    let crownFactor = 1;
    if (guide.role === "ridge") {
      const spine = Math.pow(sat(1 - nx / Math.max(0.35, outerQ * 0.75)), 1.35);
      const along = smooth(outerQ, 0.45, nz);
      crownFactor = spine * along * (0.85 + 0.3 * guide.crownShape);
    } else if (guide.crownShape >= 0) {
      const dome = Math.pow(sat(1 - (q / outerQ) ** 2), 1.15);
      crownFactor = lerp(smoothAscent, dome, guide.crownShape * 0.65);
    } else {
      const bowl = smoothAscent * (1 + guide.crownShape * 0.45 * Math.pow(sat(1 - q), 2));
      crownFactor = bowl;
    }

    const localH = guide.center[1] + heightM * crownFactor;
    if (guide.role === "basin") {
      basinCut = Math.max(basinCut, heightM * smoothAscent);
    } else {
      // Smooth maximum (log-sum-exp style polynomial smoothmax) so neighboring OBB guides fuse without sharp creases
      const kSmooth = 28;
      const hDiff = Math.max(0, kSmooth - Math.abs(guideRise - localH)) / kSmooth;
      guideRise = Math.max(guideRise, localH) + hDiff * hDiff * kSmooth * 0.25;
      const guideInfluence = smooth(outerQ, 0.55, q);
      guideWallProxy = Math.max(guideWallProxy, guideInfluence * (120 + heightM * 1.65));
      weightedBoost += guide.reliefBoost * guideInfluence;
      boostWeightSum += guideInfluence;
    }
  }

  const reliefBoost = boostWeightSum > 0 ? weightedBoost / (1 + boostWeightSum) : 1.0;
  const baseHeight = corridorHeight + guideRise - basinCut;
  const effectiveWallDist = recipe.corridor.enabled
    ? Math.max(corridorEdgeDist, guideWallProxy * smooth(8, 42, corridorEdgeDist))
    : Math.max(35, guideWallProxy);
  const mountainWeight = sat(
    Math.max(smooth(30, 620, effectiveWallDist), smooth(25, 220, guideRise - basinCut * 0.6))
  );

  return {
    baseHeight,
    wallDistance: effectiveWallDist,
    mountainWeight,
    reliefBoost
  };
}

/**
 * Cold Smoke's 3-octave squared ridged multifractal (`relief(x, z, e, cell)`).
 */
function sampleColdSmokeRelief(
  x: number,
  z: number,
  wallDistance: number,
  mountainWeight: number,
  reliefBoost: number,
  recipe: ColdSmokeMountainRecipe,
  noise: ReturnType<typeof createKeyedNoise>
): number {
  if (!recipe.relief.enabled || recipe.relief.amplitude <= 0 || mountainWeight <= 1e-4) return 0;
  const scale = Math.max(250, recipe.relief.scaleMetres);
  const mx = x / scale;
  const mz = z / scale;
  const r1 = 1 - Math.abs(noise.vnoise2(mx, mz, 71));
  const r2 = recipe.relief.octaves >= 2 ? 1 - Math.abs(noise.vnoise2(mx * 2.3 + 5.1, mz * 2.3, 72)) : 0;
  const r3 = recipe.relief.octaves >= 3 ? 1 - Math.abs(noise.vnoise2(mx * 5.1, mz * 5.1 + 2.2, 73)) : 0;
  const farMod = 0.35 + 0.65 * smooth(0, 1200, wallDistance + 320 * noise.vnoise2(mz * 0.7, mx * 0.7, 74));
  const raw = (r1 * r1 * 210 + r2 * r2 * 78 + r3 * r3 * 28) * farMod;
  return mountainWeight * mountainWeight * raw * recipe.relief.amplitude * reliefBoost;
}

interface CompiledFeature {
  feature: GullyValleyFeature;
  segments: { a: V2; dx: number; dz: number; len: number; cumLen: number }[];
  totalLength: number;
  bounds: [number, number, number, number];
}

export function shapeCurvePoint(points: [V2, V2, V2], t: number): V2 {
  const [a, b, c] = points;
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]];
}

function compileFeatures(features: GullyValleyFeature[]): CompiledFeature[] {
  const STEPS = 48;
  return features
    .filter((f) => f.enabled && f.depth > 0 && f.width > 1)
    .map((feature) => {
      const samples = Array.from({ length: STEPS + 1 }, (_, i) => shapeCurvePoint(feature.points, i / STEPS));
      const segments: CompiledFeature["segments"] = [];
      let totalLength = 0;
      let minX = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxZ = -Infinity;
      for (let i = 0; i < STEPS; i++) {
        const a = samples[i];
        const b = samples[i + 1];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const len = Math.hypot(dx, dz);
        segments.push({ a, dx, dz, len, cumLen: totalLength });
        totalLength += len;
        minX = Math.min(minX, a[0], b[0]);
        minZ = Math.min(minZ, a[1], b[1]);
        maxX = Math.max(maxX, a[0], b[0]);
        maxZ = Math.max(maxZ, a[1], b[1]);
      }
      const pad = feature.width * (feature.tributaries ? 2.4 : 1.35);
      return {
        feature,
        segments,
        totalLength: Math.max(1, totalLength),
        bounds: [minX - pad, minZ - pad, maxX + pad, maxZ + pad]
      };
    });
}

function evaluateAuthoredFeatures(
  x: number,
  z: number,
  compiledFeatures: CompiledFeature[],
  noise: ReturnType<typeof createKeyedNoise>
): number {
  let deltaY = 0;
  for (let fIdx = 0; fIdx < compiledFeatures.length; fIdx++) {
    const { feature, segments, totalLength, bounds } = compiledFeatures[fIdx];
    if (x < bounds[0] || z < bounds[1] || x > bounds[2] || z > bounds[3]) continue;

    let bestDist = Infinity;
    let bestAlong = 0;
    let bestSigned = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.len < 1e-6) continue;
      const t = sat(((x - seg.a[0]) * seg.dx + (z - seg.a[1]) * seg.dz) / (seg.len * seg.len));
      const px = x - seg.a[0] - t * seg.dx;
      const pz = z - seg.a[1] - t * seg.dz;
      const d = Math.hypot(px, pz);
      if (d < bestDist) {
        bestDist = d;
        bestAlong = seg.cumLen + t * seg.len;
        bestSigned = (seg.dx * pz - seg.dz * px) / seg.len;
      }
    }

    const maxReach = feature.width * (feature.tributaries ? 2.2 : 1.15);
    if (bestDist >= maxReach) continue;

    const uNorm = bestAlong / totalLength;
    const endFade = smooth(0, 0.14, uNorm) * smooth(1, 0.84, uNorm);
    const dNorm = bestDist / feature.width;

    if (feature.kind === "ridge") {
      if (dNorm < 1) {
        const rounded = (1 - dNorm * dNorm) ** 2;
        const pointed = (1 - dNorm) ** 2.2;
        const profile = lerp(rounded, pointed, feature.sharpness);
        deltaY += feature.depth * profile * endFade;
      }
      continue;
    }

    // Gully or Valley incision
    if (dNorm < 1.15) {
      const uShape = dNorm < 1 ? (1 - dNorm * dNorm) ** 2 : 0;
      // Cold Smoke gully floor profile: rounded floor with steep walls and subtle flanking ribs
      const vShape = dNorm < 1 ? (1 - dNorm) ** (1.35 + feature.sharpness * 1.65) : 0;
      const mainProfile = lerp(uShape, vShape, feature.sharpness);
      const leveeRib =
        feature.kind === "gully"
          ? 0.12 * feature.sharpness * Math.exp(-(((dNorm - 0.92) / 0.22) ** 2))
          : 0;
      deltaY -= feature.depth * (mainProfile - leveeRib) * endFade;
    }

    // Cold Smoke tributary side-runnels: oblique chutes on the gully flanks that bend into the main channel
    if (feature.tributaries && feature.tributaryStrength > 0.01 && dNorm > 0.18 && dNorm < 2.1) {
      const spacing = Math.max(25, feature.tributarySpacing);
      // Bend the tributary phase with lateral distance so side runnels angle down-valley into the main trough
      const bentAlong = bestAlong - Math.abs(bestSigned) * 0.68 + 14 * noise.vnoise2(x / 55, z / 55, 401 + fIdx);
      const phase = (bentAlong / spacing) * TAU;
      const wave = Math.cos(phase);
      // Sharp ridges between rounded tributary chutes: 1 - sqrt((1 - cos)/2)
      const chute = Math.pow(sat(0.5 + 0.5 * wave), 2.4);
      const flankMask = smooth(0.18, 0.52, dNorm) * (1 - smooth(1.25, 2.05, dNorm));
      deltaY -= feature.depth * feature.tributaryStrength * 0.42 * chute * flankMask * endFade;
    }
  }
  return deltaY;
}

/**
 * Evaluates the complete Cold Smoke + OBB Guided mountain height at world (x, z).
 */
export function createMountainEvaluator(recipe: ColdSmokeMountainRecipe) {
  const noise = createKeyedNoise(recipe.seed);
  const compiledGuides = compileGuides(recipe.guides);
  const compiledFeatures = compileFeatures(recipe.features);
  const er: [number, number, number] = [0, 0, 0];

  const macroHeight = (x: number, z: number) => {
    const base = evaluateGuidesAndCorridor(x, z, recipe, compiledGuides, noise);
    const hm = sampleColdSmokeRelief(
      x,
      z,
      base.wallDistance,
      base.mountainWeight,
      base.reliefBoost,
      recipe,
      noise
    );
    return {
      height: base.baseHeight + hm,
      wallDistance: base.wallDistance,
      mountainWeight: base.mountainWeight,
      reliefBoost: base.reliefBoost
    };
  };

  const evaluateAt = (x: number, z: number): { height: number; mountainWeight: number } => {
    const macro = macroHeight(x, z);
    let h = macro.height;
    const m = macro.mountainWeight;
    const wGully = smooth(0.08, 0.55, m);

    // Cold Smoke's 4-octave slope-aligned tributary gullies (`course.ts#L658-L669`)
    if (recipe.proceduralGullies.enabled && recipe.proceduralGullies.strength > 0 && wGully > 0.01) {
      const D = 24;
      const gx = (macroHeight(x + D, z).height - macro.height) / D;
      const gz = (macroHeight(x, z + D).height - macro.height) / D;
      const sl = Math.hypot(gx, gz);
      const K = 1.7 * Math.min(1, 1.4 / (sl + 1e-6));
      // Turn the slope gradient a quarter turn so wave crests run straight down the fall line
      const dx = gz * K;
      const dz = -gx * K;
      const wScale = Math.max(0.4, recipe.proceduralGullies.wavelengthScale);
      const bend = recipe.proceduralGullies.tributaryBend;
      const octaves = recipe.proceduralGullies.octaves;

      // Octave 1: Great couloirs and buttresses (700 m)
      sampleGullyWave(x / (700 * wScale) + 3.9, z / (700 * wScale) + 8.2, dx, dz, 1213, noise.key, er);
      let g = 42 * m * (1.27 - 2 * Math.sqrt(Math.max(0, 0.5 - 0.5 * er[0])));
      let ex = er[1] * 0.5;
      let ez = er[2] * 0.5;

      // Octave 2: Main gullies bent by octave 1 (260 m)
      if (octaves >= 2) {
        sampleGullyWave(x / (260 * wScale), z / (260 * wScale), dx + ez * bend, dz - ex * bend, 911, noise.key, er);
        g += 19 * (1.27 - 2 * Math.sqrt(Math.max(0, 0.5 - 0.5 * er[0])));
        ex += er[1];
        ez += er[2];
      }

      // Octave 3: Tributary chutes bent by octaves 1+2 (124 m)
      if (octaves >= 3) {
        sampleGullyWave(
          x / (124 * wScale) + 17.3,
          z / (124 * wScale) - 5.1,
          dx + ez * bend,
          dz - ex * bend,
          577,
          noise.key,
          er
        );
        g += 9.5 * (1.27 - 2 * Math.sqrt(Math.max(0, 0.5 - 0.5 * er[0])));
        ex += er[1] * 1.05;
        ez += er[2] * 1.05;
      }

      // Octave 4: Fine snow runnels bent by octaves 1+2+3 (59 m)
      if (octaves >= 4) {
        sampleGullyWave(
          x / (59 * wScale) - 8.7,
          z / (59 * wScale) + 31.9,
          dx + ez * bend,
          dz - ex * bend,
          353,
          noise.key,
          er
        );
        g += 4.2 * (1.27 - 2 * Math.sqrt(Math.max(0, 0.5 - 0.5 * er[0])));
      }

      h += wGully * smooth(0.16, 0.68, sl) * (0.35 + 0.65 * m) * g * recipe.proceduralGullies.strength;
    }

    // Medium natural mountain undulation (`course.ts#L670, L700-L702`)
    if (m > 0.04) {
      h += m * 11 * noise.vnoise2(x / 90, z / 90, 75) + m * 3.2 * noise.vnoise2(x / 25, z / 25, 76);
    }
    h += 1.5 * noise.vnoise2(x / 61, z / 61, 3) + 0.65 * noise.vnoise2(x / 27, z / 27, 4);

    // User-authored Gullies, Valleys & Ridges
    if (compiledFeatures.length > 0) {
      h += evaluateAuthoredFeatures(x, z, compiledFeatures, noise);
    }

    // Interactive 3D Sculpt Stamps (Raise Peak / Carve Gully / Smooth)
    if (recipe.sculptStamps && recipe.sculptStamps.length > 0) {
      for (let sIdx = 0; sIdx < recipe.sculptStamps.length; sIdx++) {
        const st = recipe.sculptStamps[sIdx];
        const d = Math.hypot(x - st.x, z - st.z);
        if (d < st.radius) {
          const t = 1 - d / st.radius;
          const falloff = t * t * (3 - 2 * t);
          h += st.deltaHeight * falloff;
        }
      }
    }

    // Cold Smoke's 3D Rock Strata Benches (`course.ts#L671-L678`)
    if (recipe.strata.enabled && recipe.strata.benchCarving > 0 && wGully > 0.01) {
      const t = strataAt(x, h, z, recipe.strata);
      const ft = Math.floor(t);
      const fr = t - ft;
      const bedStrength =
        wGully *
        (0.1 + 0.74 * smooth(-0.3, 0.3, noise.vnoise2((x + z) / 260 + ft * 3.31, (x - z) / 700 + ft * 1.73, 79)));
      h += (smooth(0.22, 0.78, fr) - fr) * recipe.strata.bedThickness * bedStrength * recipe.strata.benchCarving;
    }

    return { height: h, mountainWeight: m };
  };

  return {
    macroHeight,
    evaluateAt
  };
}

/**
 * Traces the steepest fall-line downhill from `(clickX, clickZ)` on the macro guide surface
 * so the user can click any mountain wall to automatically add a fall-line Gully, Valley, or Ridge.
 */
export function traceFallLineFeature(
  recipe: ColdSmokeMountainRecipe,
  clickX: number,
  clickZ: number,
  kind: FeatureKind,
  index: number
): GullyValleyFeature {
  const { macroHeight } = createMountainEvaluator(recipe);
  const stepDist = 16;
  const trace = (startX: number, startZ: number, sign: 1 | -1, steps: number): V2 => {
    let px = startX;
    let pz = startZ;
    const d = 12;
    for (let i = 0; i < steps; i++) {
      const h0 = macroHeight(px, pz).height;
      const gx = (macroHeight(px + d, pz).height - h0) / d;
      const gz = (macroHeight(px, pz + d).height - h0) / d;
      const len = Math.hypot(gx, gz);
      if (len < 1e-3) break;
      // Downhill is (-gx, -gz); uphill is (+gx, +gz)
      px = clamp(
        px + (sign * gx * stepDist) / len,
        recipe.domain.minX + 40,
        recipe.domain.minX + recipe.domain.width - 40
      );
      pz = clamp(
        pz + (sign * gz * stepDist) / len,
        recipe.domain.minZ + 40,
        recipe.domain.minZ + recipe.domain.depth - 40
      );
    }
    return [Math.round(px), Math.round(pz)];
  };

  const highPoint = trace(clickX, clickZ, 1, 5);
  const midPoint: V2 = [Math.round(clickX), Math.round(clickZ)];
  const lowPoint = trace(clickX, clickZ, -1, 10);

  // If the clicked spot was nearly flat, create a sensible default span toward the valley center
  if (Math.hypot(lowPoint[0] - highPoint[0], lowPoint[1] - highPoint[1]) < 45) {
    const towardCenter = clickX >= 0 ? -1 : 1;
    highPoint[0] = Math.round(clickX - towardCenter * 90);
    highPoint[1] = Math.round(clickZ - 60);
    lowPoint[0] = Math.round(clickX + towardCenter * 140);
    lowPoint[1] = Math.round(clickZ + 70);
  }

  const labelMap: Record<FeatureKind, string> = {
    gully: `Couloir #${index} · 雪槽`,
    valley: `Valley #${index} · 山谷`,
    ridge: `Ridge #${index} · 山脊`
  };

  return {
    id: `${kind}-${Date.now().toString(36)}-${index}`,
    name: labelMap[kind],
    kind,
    enabled: true,
    points: [highPoint, midPoint, lowPoint],
    depth: kind === "gully" ? 46 : kind === "valley" ? 40 : 38,
    width: kind === "gully" ? 64 : kind === "valley" ? 110 : 62,
    sharpness: kind === "gully" ? 0.8 : kind === "valley" ? 0.35 : 0.85,
    tributaries: kind !== "ridge",
    tributarySpacing: 72,
    tributaryStrength: kind === "gully" ? 0.55 : kind === "valley" ? 0.38 : 0
  };
}

/**
 * Generates the heightfield mesh and bakes Cold Smoke's terrain channels:
 * - Central-difference slopes `(sx, sz)` and normals
 * - Multi-scale Laplacian concavity (`lapNear - 0.75 * lapFar`, from `04_terrain.js#L200-L207`)
 * - Cavity ambient occlusion `ao` (`1 - 0.5 * clamp(conc, -0.5, 0.6) * min(1, mw * 4)`)
 * - Ray-marched sun-horizon tangent `hz` (`horizon()` from `04_terrain.js#L95-L111`)
 */
export function generateColdSmokeMountain(recipe: ColdSmokeMountainRecipe): ColdSmokeMountainResult {
  const startMs = performance.now();
  const { domain } = recipe;
  const n = domain.resolution;
  const totalVertices = n * n;
  const dx = domain.width / (n - 1);
  const dz = domain.depth / (n - 1);

  const heights = new Float32Array(totalVertices);
  const mountainWeights = new Float32Array(totalVertices);
  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const channels = new Float32Array(totalVertices * 4);
  const slopes = new Float32Array(totalVertices * 2);
  const indices = new Uint32Array((n - 1) * (n - 1) * 6);

  const evaluator = createMountainEvaluator(recipe);

  let minHeight = Infinity;
  let maxHeight = -Infinity;

  for (let row = 0; row < n; row++) {
    const z = domain.minZ + row * dz;
    for (let col = 0; col < n; col++) {
      const x = domain.minX + col * dx;
      const idx = row * n + col;
      const sample = evaluator.evaluateAt(x, z);
      heights[idx] = sample.height;
      mountainWeights[idx] = sample.mountainWeight;
      if (sample.height < minHeight) minHeight = sample.height;
      if (sample.height > maxHeight) maxHeight = sample.height;

      const pOffset = idx * 3;
      positions[pOffset] = x;
      positions[pOffset + 1] = sample.height;
      positions[pOffset + 2] = z;
    }
  }

  // Build triangle indices
  let triOffset = 0;
  for (let row = 0; row < n - 1; row++) {
    for (let col = 0; col < n - 1; col++) {
      const a = row * n + col;
      const b = a + n;
      const c = a + 1;
      const d = b + 1;
      indices[triOffset] = a;
      indices[triOffset + 1] = b;
      indices[triOffset + 2] = c;
      indices[triOffset + 3] = c;
      indices[triOffset + 4] = b;
      indices[triOffset + 5] = d;
      triOffset += 6;
    }
  }

  const heightAtGrid = (col: number, row: number): number => {
    const c = clamp(col, 0, n - 1);
    const r = clamp(row, 0, n - 1);
    return heights[r * n + c];
  };

  // Multi-scale Laplacian radii (~64 m and ~192 m in world space, matching 04_terrain.js#L200-L207)
  const stepNear = Math.max(2, Math.round(56 / dx));
  const stepFar = Math.max(stepNear * 2, Math.round(168 / dx));
  const normNear = (stepNear * dx) ** 2;
  const normFar = (stepFar * dx) ** 2;

  // Sun direction in horizontal plane for horizon tangent ray-marching (`horizon()` in 04_terrain.js#L95-L111)
  const sunAzRad = (recipe.vista.sunAzimuthDegrees * PI) / 180;
  const sunStepX = Math.sin(sunAzRad);
  const sunStepZ = -Math.cos(sunAzRad);

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const idx = row * n + col;
      const hc = heights[idx];
      const mw = mountainWeights[idx];

      // Central difference slopes
      const hL = heightAtGrid(col - 1, row);
      const hR = heightAtGrid(col + 1, row);
      const hU = heightAtGrid(col, row - 1);
      const hD = heightAtGrid(col, row + 1);
      const sx = (hR - hL) / ((col > 0 && col < n - 1 ? 2 : 1) * dx);
      const sz = (hD - hU) / ((row > 0 && row < n - 1 ? 2 : 1) * dz);

      const invLen = 1 / Math.hypot(sx, 1, sz);
      const nOffset = idx * 3;
      normals[nOffset] = -sx * invLen;
      normals[nOffset + 1] = invLen;
      normals[nOffset + 2] = -sz * invLen;

      slopes[idx * 2] = sx;
      slopes[idx * 2 + 1] = sz;

      // Multi-scale Laplacian concavity: positive in gullies/couloirs, negative on sharp ribs/crests
      const lapNear =
        (heightAtGrid(col - stepNear, row) +
          heightAtGrid(col + stepNear, row) +
          heightAtGrid(col, row - stepNear) +
          heightAtGrid(col, row + stepNear) -
          4 * hc) /
        normNear;
      const lapFar =
        (heightAtGrid(col - stepFar, row) +
          heightAtGrid(col + stepFar, row) +
          heightAtGrid(col, row - stepFar) +
          heightAtGrid(col, row + stepFar) -
          4 * hc) /
        normFar;
      const conc = clamp((lapNear - 0.72 * lapFar) * 24, -1.2, 1.4);
      const ao = clamp(1 - 0.48 * clamp(conc, -0.45, 0.65) * Math.min(1, mw * 3.5), 0.32, 1.22);

      // Horizon self-shadow tangent toward the sun (`horizon()` in 04_terrain.js)
      let hz = -0.25;
      let dist = dx * 1.5;
      for (let step = 0; step < 20 && dist < 950; step++, dist *= 1.24) {
        const sampleCol = col + (sunStepX * dist) / dx;
        const sampleRow = row + (sunStepZ * dist) / dz;
        if (sampleCol < 0 || sampleCol >= n - 1 || sampleRow < 0 || sampleRow >= n - 1) break;
        const ic = Math.floor(sampleCol);
        const ir = Math.floor(sampleRow);
        const fx = sampleCol - ic;
        const fz = sampleRow - ir;
        const h00 = heights[ir * n + ic];
        const h10 = heights[ir * n + ic + 1];
        const h01 = heights[(ir + 1) * n + ic];
        const h11 = heights[(ir + 1) * n + ic + 1];
        const hSun = lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
        const tanAngle = (hSun - hc) / dist;
        if (tanAngle > hz) hz = tanAngle;
      }

      const cOffset = idx * 4;
      channels[cOffset] = mw;
      channels[cOffset + 1] = conc;
      channels[cOffset + 2] = ao;
      channels[cOffset + 3] = clamp(hz, -0.5, 4.0);
    }
  }

  return {
    recipe: structuredClone(recipe),
    positions,
    normals,
    channels,
    slopes,
    indices,
    heights,
    diagnostics: {
      generationMs: performance.now() - startMs,
      minHeight,
      maxHeight,
      activeGuides: recipe.guides.filter((g) => g.enabled).length,
      activeFeatures: recipe.features.filter((f) => f.enabled).length,
      triangles: indices.length / 3
    }
  };
}
