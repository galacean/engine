/** Seeded 2D gradient Perlin noise with quintic interpolation and octave summation. */
export interface NoiseSettings {
  seed: number;
  frequency: number;
  octaves: number;
  lacunarity: number;
  persistence: number;
}

export interface HeightmapRecipe extends NoiseSettings {
  schema: "perlin-heightmap/v1";
  resolution: number;
  normalization: "local" | "fixed";
  /** World-space height multiplier; omitted v1 recipes use 30 metres. */
  heightAmplitude?: number;
}

export const defaultRecipe = (): HeightmapRecipe => ({
  schema: "perlin-heightmap/v1",
  seed: 18,
  frequency: 4,
  octaves: 5,
  lacunarity: 2,
  persistence: 0.5,
  resolution: 512,
  normalization: "local",
  heightAmplitude: 30
});

function bounded(value: number, min: number, max: number, name: string, integer = false) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value)))
    throw new RangeError(`${name} must be ${integer ? "an integer " : ""}from ${min} to ${max}.`);
}

export function validateNoise(settings: NoiseSettings): void {
  bounded(settings.seed, 0, 0xffffffff, "Seed", true);
  bounded(settings.frequency, 0.25, 32, "Base frequency");
  bounded(settings.octaves, 1, 8, "Octaves", true);
  bounded(settings.lacunarity, 1, 4, "Lacunarity");
  bounded(settings.persistence, 0, 1, "Persistence");
}

export function validateRecipe(recipe: HeightmapRecipe): void {
  if (!recipe || recipe.schema !== "perlin-heightmap/v1") throw Error("Expected a perlin-heightmap/v1 recipe.");
  validateNoise(recipe);
  bounded(recipe.resolution, 2, 1024, "Resolution", true);
  if (recipe.normalization !== "local" && recipe.normalization !== "fixed") throw Error("Unknown normalization.");
  resolveHeightAmplitude(recipe.heightAmplitude);
}

export function resolveHeightAmplitude(value: number | undefined): number {
  const amplitude = value === undefined ? 30 : value;
  bounded(amplitude, 0, 100, "Height amplitude");
  return amplitude;
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const diagonal = Math.SQRT1_2;
// Eight unit gradients. Unlike value noise, lattice hashes select directions,
// whose dot products with the sample displacement are interpolated.
const gradients = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [diagonal, diagonal],
  [-diagonal, diagonal],
  [diagonal, -diagonal],
  [-diagonal, -diagonal]
];

export function createPerlin2D(seed: number): (x: number, z: number) => number {
  bounded(seed, 0, 0xffffffff, "Seed", true);
  const rng = random(seed),
    permutation = new Uint8Array(512);
  for (let i = 0; i < 256; i++) permutation[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
  }
  permutation.set(permutation.subarray(0, 256), 256);
  const dot = (ix: number, iz: number, x: number, z: number) => {
    const g = gradients[permutation[permutation[ix] + iz] & 7];
    return g[0] * x + g[1] * z;
  };
  return (x, z) => {
    const ix = Math.floor(x),
      iz = Math.floor(z),
      dx = x - ix,
      dz = z - iz,
      gx = ix & 255,
      gz = iz & 255;
    const lower = mix(dot(gx, gz, dx, dz), dot(gx + 1, gz, dx - 1, dz), fade(dx));
    const upper = mix(dot(gx, gz + 1, dx, dz - 1), dot(gx + 1, gz + 1, dx - 1, dz - 1), fade(dx));
    // Unit-gradient 2D noise has bound sqrt(2)/2; expose a signed unit range.
    return mix(lower, upper, fade(dz)) * Math.SQRT2;
  };
}

/** Samples a fixed logical domain. Resolution does not alter the field or octave phases. */
export function createFractalPerlin(settings: NoiseSettings): (x: number, z: number) => number {
  validateNoise(settings);
  const noise = createPerlin2D(settings.seed),
    rng = random(settings.seed ^ 0x9e3779b9);
  const layers: { frequency: number; amplitude: number; x: number; z: number }[] = [];
  let frequency = settings.frequency,
    amplitude = 1,
    weight = 0;
  for (let i = 0; i < settings.octaves; i++) {
    layers.push({ frequency, amplitude, x: rng() * 256, z: rng() * 256 });
    weight += amplitude;
    frequency *= settings.lacunarity;
    amplitude *= settings.persistence;
  }
  return (x, z) => {
    let total = 0;
    for (const layer of layers)
      if (layer.amplitude > 0)
        total += noise(x * layer.frequency + layer.x, z * layer.frequency + layer.z) * layer.amplitude;
    return total / weight;
  };
}

export function generateHeightmap(recipe: HeightmapRecipe): {
  heights: Float32Array;
  pixels: Uint8ClampedArray;
  rawMin: number;
  rawMax: number;
} {
  validateRecipe(recipe);
  const n = recipe.resolution,
    sample = createFractalPerlin(recipe),
    heights = new Float32Array(n * n);
  let rawMin = Infinity,
    rawMax = -Infinity;
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const k = x + z * n;
      heights[k] = sample(x / (n - 1), z / (n - 1));
      rawMin = Math.min(rawMin, heights[k]);
      rawMax = Math.max(rawMax, heights[k]);
    }
  const pixels = new Uint8ClampedArray(n * n * 4),
    range = rawMax - rawMin;
  for (let i = 0; i < heights.length; i++) {
    const value =
      recipe.normalization === "local" ? (range > 1e-12 ? (heights[i] - rawMin) / range : 0.5) : (heights[i] + 1) * 0.5;
    heights[i] = Math.max(0, Math.min(1, value));
    const gray = Math.round(heights[i] * 255);
    pixels.set([gray, gray, gray, 255], i * 4);
  }
  return { heights, pixels, rawMin, rawMax };
}
