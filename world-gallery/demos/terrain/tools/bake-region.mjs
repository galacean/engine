// Bake a terrain region's data files (heightmap + controlmap) from PCG parameters.
//
// WHAT: this is the offline PCG tool that produces the two binary blobs the runtime reads at load
// time. It's the ONLY place procedural terrain generation lives — the runtime loader just parses
// bytes. Replace this script's output with real DEM data (e.g. Tangram Heightmapper PNG16 →
// converted to .r16 + a matching controlmap) and the demo runs unchanged.
//
// USAGE:
//   node world-gallery/demos/terrain/tools/bake-region.mjs
//     ⇒ regenerates data/regions/heightmap_0_0.r16 + controlmap_0_0.bin from the PCG params below.
//     ⇒ prints a manifest snippet you should paste back into data/manifest.json if dims/range change.
//
// OUTPUTS (data/regions/):
//   heightmap_0_0.r16   · raw Uint16 unorm little-endian, one sample per pixel
//   controlmap_0_0.bin  · raw Uint32 little-endian bitfield (see bit layout in generator body)
//
// The manifest carries the semantic metadata (width, height, minMetres, maxMetres, format tag) —
// same convention as Unity TerrainData / T3D Region.res / UE Landscape .uasset. No standalone
// .meta.json files.

import { mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../data/regions");
mkdirSync(OUT, { recursive: true });

// ---------- noise ----------
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 1274126177;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}
const smoothstep = (t) => t * t * (3 - 2 * t);
function valueNoise2D(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  const u = smoothstep(fx);
  const v = smoothstep(fy);
  return (((a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v) * 2 - 1);
}
function fbm2D(x, y, seed, octaves = 5, lacunarity = 2, gain = 0.5) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise2D(x * freq, y * freq, seed + o * 131) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

// ---------- island heightmap ----------
// Single-island PCG. Domain-warped radial dome centred on the tile, with ridged detail on top.
// Not "cover the whole tile with random archipelago" — one clean island that renders like a landmass.
const ISLAND = {
  resolution: 1024,
  seed: 12345,
  ridgeFreq: 3.5,       // primary ridge scale
  detailFreq: 12,       // fine detail on top of ridge
  radius: 0.42,         // island radius as fraction of tile (0.5 = touches edge)
  domeSteepness: 2.2,   // how sharply the dome falls off past `radius`
  reliefStrength: 0.55, // 0 = flat pancake, 1 = pure ridge (no dome shape)
  minHeight: -18,
  maxHeight: 220,
  seaLevel: 0.14
};
function generateIslandHeights(cfg) {
  const N = cfg.resolution;
  const out = new Float32Array(N * N);
  const invN = 1 / (N - 1);
  // NO underwater compression. The old code pinched anything below seaLevel into [0, seaLevel/2],
  // leaving a heightmap gap of ~7% between the highest seabed texel and the lowest land texel.
  // Shader vertex bilinear interpolation across the coastline then produced vertices whose Y sat
  // *inside* that gap → the coastline appeared to slide under the water plane. Keeping the raw
  // domain-warped fbm ensures max(water texel) ≈ min(land texel) ≈ seaLevel → water plane and
  // land surface meet cleanly.
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x * invN;
      const v = y * invN;
      // Domain-warp so the island outline isn't a perfect circle.
      const warpX = fbm2D(u * 2.3, v * 2.3, cfg.seed + 91, 3, 2, 0.5) * 0.12;
      const warpY = fbm2D(u * 2.3, v * 2.3, cfg.seed + 173, 3, 2, 0.5) * 0.12;
      const du = (u + warpX) - 0.5;
      const dv = (v + warpY) - 0.5;
      const r = Math.sqrt(du * du + dv * dv) / cfg.radius;
      const dome = Math.max(0, 1 - Math.pow(Math.min(r, 1), cfg.domeSteepness));
      const ridge = fbm2D(u * cfg.ridgeFreq, v * cfg.ridgeFreq, cfg.seed, 5, 2, 0.5) * 0.5 + 0.5;
      const detail = fbm2D(u * cfg.detailFreq, v * cfg.detailFreq, cfg.seed + 1000, 3, 2, 0.5) * 0.5 + 0.5;
      const relief = ridge * 0.7 + detail * 0.3;
      const shape = dome * ((1 - cfg.reliefStrength) + cfg.reliefStrength * relief);
      out[y * N + x] = Math.max(0, Math.min(1, shape));
    }
  }
  return out;
}

// ---------- control map (autoshader) ----------
const CONTROL = {
  slopeThreshold: 0.35,
  slopeBlendWidth: 0.15,
  grassLayerId: 0,
  rockLayerId: 1,
  waterLayerId: 2,
  tileSizeMeter: 1024,
  // seaLevelMetres must match data/manifest.json → world.seaLevelMetres. Any texel below this
  // becomes base_id = waterLayerId (marker for the water Consumer), no bit-space needed.
  seaLevelMetres: 15
};
// Bit layout matches shaders/Terrain.shader + design.md §3.2 (T3D authoritative encode/decode):
//   31-27 base | 26-22 overlay | 21-14 blend | 13-11 uvRot | 10-8 uvScale
//   2 hole | 1 nav | 0 autoshader
//
// Water is NOT a bit — it's encoded as `base_id == waterLayerId` so the layer system carries the
// semantic. Autoshader (bit 0) matches T3D auto_shader.glsl: when set, the shader ignores the
// baked base/overlay/blend and recomputes them from world normal + material_Auto* uniforms.
// Baker sets auto=1 for every above-sealevel texel — the shader is the source of truth for
// slope-based material picking; painters would later clear the bit to lock a texel in place.
function encodeControl(base, over, blend, { nav = 0, hole = 0, auto = 0, uvRot = 0, uvScale = 0 } = {}) {
  const b = base & 0x1f;
  const o = over & 0x1f;
  const w = Math.max(0, Math.min(255, Math.round(blend * 255)));
  const rot = uvRot & 0xf;
  const scl = uvScale & 0x7;
  return (b << 27) | (o << 22) | (w << 14) | (rot << 11) | (scl << 8)
       | ((hole & 1) << 2) | ((nav & 1) << 1) | (auto & 1);
}
function deriveControlMap(heights, N, cfg, hcfg) {
  const out = new Uint32Array(N * N);
  const texelWorld = cfg.tileSizeMeter / (N - 1);
  const invDen = 1 / (2 * texelWorld);
  const range = hcfg.maxHeight - hcfg.minHeight;
  const seaLevelNorm = (cfg.seaLevelMetres - hcfg.minHeight) / range;
  // Painted-mode baker — every land texel carries its FINAL base/overlay/blend so the debug
  // panel's base_id / overlay_id / blend thumbs read the same as the rendered scene. Autoshader
  // bit stays 0 for painted texels; a future painter would clear/paint textures + optionally
  // flip bit 0 = 1 on the parts it wants the shader to autoshader-fill instead.
  //
  //   flat texel    → base = grass, overlay = grass, blend = 0     (all grass)
  //   steep texel   → base = rock,  overlay = rock,  blend = 0     (all rock)
  //   transition    → base = grass, overlay = rock,  blend ∈ (0,1) (mix by slope)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const idx = y * N + x;
      const h = heights[idx];
      if (h < seaLevelNorm) {
        // hole = 1 → terrain shader discards this texel, so the water-pcg ocean mesh underneath
        // has full pixel ownership. Without this, seabed terrain and water plane z-fight (both
        // sit at similar Y once the ocean drops to min(water)).
        out[idx] = encodeControl(cfg.waterLayerId, cfg.waterLayerId, 0, { hole: 1 });
        continue;
      }
      const l = heights[y * N + Math.max(x - 1, 0)];
      const r = heights[y * N + Math.min(x + 1, N - 1)];
      const d = heights[Math.max(y - 1, 0) * N + x];
      const u = heights[Math.min(y + 1, N - 1) * N + x];
      const dh = ((r * range) - (l * range)) * invDen;
      const dv = ((u * range) - (d * range)) * invDen;
      const slope = Math.min(1, Math.sqrt(dh * dh + dv * dv));
      // Soft slope→blend curve so both id thumbnails and the rendered surface show a real gradient
      // instead of a hard cut. Below the threshold it's grass-dominant, above rock-dominant.
      const t = (slope - cfg.slopeThreshold) / cfg.slopeBlendWidth;
      const blend01 = Math.max(0, Math.min(1, 0.5 + 0.5 * t));
      const base = blend01 < 0.5 ? cfg.grassLayerId : cfg.rockLayerId;
      const over = blend01 < 0.5 ? cfg.rockLayerId : cfg.grassLayerId;
      const shaped = blend01 < 0.5 ? blend01 * 2 : (1 - blend01) * 2;
      const rot = ((x * 374761393 + y * 668265263) ^ 0x9e3779b9) & 0xf;
      // Split-mode demo: left half of the tile stays painted (auto=0 → uses baked base/overlay/blend
      // literally). Right half opts into autoshader (auto=1 → shader recomputes blend from world
      // normal + material_AutoSlope). Dragging the "Autoshader auto slope" slider now visibly
      // changes ONLY the right half of the island — a live comparison of the two modes.
      const useAuto = x >= N / 2;
      out[idx] = encodeControl(base, over, shaped, { uvRot: rot, auto: useAuto ? 1 : 0 });
    }
  }
  return out;
}

// ---------- bake ----------
console.log("Generating heightmap…");
const heights = generateIslandHeights(ISLAND);
const heightsU16 = new Uint16Array(heights.length);
let hmin = Infinity, hmax = -Infinity;
for (let i = 0; i < heights.length; i++) {
  hmin = Math.min(hmin, heights[i]);
  hmax = Math.max(hmax, heights[i]);
  heightsU16[i] = Math.max(0, Math.min(65535, Math.round(heights[i] * 65535)));
}
writeFileSync(resolve(OUT, "heightmap_0_0.r16"), Buffer.from(heightsU16.buffer));
console.log(`  heightmap_0_0.r16 · ${ISLAND.resolution}² · [${hmin.toFixed(3)}, ${hmax.toFixed(3)}]`);

console.log("Deriving controlmap…");
const control = deriveControlMap(heights, ISLAND.resolution, CONTROL, ISLAND);
let water = 0, grassBase = 0, rockBase = 0, auto = 0;
for (let i = 0; i < control.length; i++) {
  const base = (control[i] >>> 27) & 0x1f;
  if ((control[i] & 1) === 1) auto++;
  if (base === CONTROL.waterLayerId) water++;
  else if (base === CONTROL.grassLayerId) grassBase++;
  else if (base === CONTROL.rockLayerId) rockBase++;
}
writeFileSync(resolve(OUT, "controlmap_0_0.bin"), Buffer.from(control.buffer));
const total = control.length;
console.log(
  `  controlmap_0_0.bin · ${ISLAND.resolution}² · water=${(water / total * 100).toFixed(1)}% · grass-base=${(grassBase / total * 100).toFixed(1)}% · rock-base=${(rockBase / total * 100).toFixed(1)}% · auto=${(auto / total * 100).toFixed(1)}%`
);

console.log(`\nWrote fixtures to ${OUT}`);
console.log("\nPaste into data/manifest.json → regions[0]:\n");
console.log(JSON.stringify({
  heightmap: {
    url: "./regions/heightmap_0_0.r16",
    format: "r16-unorm-le",
    width: ISLAND.resolution,
    height: ISLAND.resolution,
    minMetres: ISLAND.minHeight,
    maxMetres: ISLAND.maxHeight
  },
  controlmap: {
    url: "./regions/controlmap_0_0.bin",
    format: "uint32-bitfield-le",
    width: ISLAND.resolution,
    height: ISLAND.resolution,
    bits: "31-27 base | 26-22 overlay | 21-14 blend | 13-11 uvRot | 10-8 uvScale | 2 hole | 1 nav | 0 autoshader"
  }
}, null, 2));
