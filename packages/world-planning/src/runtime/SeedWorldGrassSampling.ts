import {
  createSeedWorldHeightSampler,
  seedWorldOriginX,
  seedWorldOriginZ,
  type SeedWorldFields
} from "./SeedWorldFields";
import { resolveSeedWorldGrassSurfaceWeight } from "./SeedWorldSurfaceIntent";

export function sampleTerrestrialGrassSurfaceWeights(
  fields: SeedWorldFields,
  worldX: number,
  worldZ: number,
  out: [grass: number, road: number, remaining: number]
): void {
  const resolution = fields.surfaceResolution;
  // Match Terrain's endpoint-aligned alphamap grid for grass density and clump scale.
  const x = clamp((worldX - seedWorldOriginX(fields)) / fields.sizeMetres, 0, 1) * (resolution - 1);
  const z = clamp((worldZ - seedWorldOriginZ(fields)) / fields.sizeMetres, 0, 1) * (resolution - 1);
  const x0 = clamp(Math.floor(x), 0, resolution - 1);
  const z0 = clamp(Math.floor(z), 0, resolution - 1);
  const x1 = Math.min(resolution - 1, x0 + 1);
  const z1 = Math.min(resolution - 1, z0 + 1);
  const fractionX = clamp(x - x0, 0, 1);
  const fractionZ = clamp(z - z0, 0, 1);
  const index00 = z0 * resolution + x0;
  const index10 = z0 * resolution + x1;
  const index01 = z1 * resolution + x0;
  const index11 = z1 * resolution + x1;
  const grass00 = resolveSeedWorldGrassSurfaceWeight(fields, index00);
  const grass10 = resolveSeedWorldGrassSurfaceWeight(fields, index10);
  const grass01 = resolveSeedWorldGrassSurfaceWeight(fields, index01);
  const grass11 = resolveSeedWorldGrassSurfaceWeight(fields, index11);
  const road00 = fields.materialWeights[index00 * 4 + 3]!;
  const road10 = fields.materialWeights[index10 * 4 + 3]!;
  const road01 = fields.materialWeights[index01 * 4 + 3]!;
  const road11 = fields.materialWeights[index11 * 4 + 3]!;
  const nearGrass = grass00 * (1 - fractionX) + grass10 * fractionX;
  const farGrass = grass01 * (1 - fractionX) + grass11 * fractionX;
  const nearRoad = road00 * (1 - fractionX) + road10 * fractionX;
  const farRoad = road01 * (1 - fractionX) + road11 * fractionX;
  const nearRemaining =
    Math.max(0, 255 - grass00 - road00) * (1 - fractionX) + Math.max(0, 255 - grass10 - road10) * fractionX;
  const farRemaining =
    Math.max(0, 255 - grass01 - road01) * (1 - fractionX) + Math.max(0, 255 - grass11 - road11) * fractionX;
  out[0] = (nearGrass * (1 - fractionZ) + farGrass * fractionZ) / 255;
  out[1] = (nearRoad * (1 - fractionZ) + farRoad * fractionZ) / 255;
  out[2] = (nearRemaining * (1 - fractionZ) + farRemaining * fractionZ) / 255;
}

const grassNormalHeightSamplers = new WeakMap<
  SeedWorldFields,
  { sample: Float64Array; read: ReturnType<typeof createSeedWorldHeightSampler> }
>();

export function sampleSeedWorldTerrainNormal(
  fields: SeedWorldFields,
  worldX: number,
  worldZ: number,
  out: [x: number, y: number, z: number]
): void {
  const originX = seedWorldOriginX(fields),
    originZ = seedWorldOriginZ(fields);
  const metresPerTexel = fields.sizeMetres / fields.heightResolution;
  let context = grassNormalHeightSamplers.get(fields);
  if (!context) {
    context = { sample: new Float64Array(3), read: createSeedWorldHeightSampler(fields) };
    grassNormalHeightSamplers.set(fields, context);
  }
  const sample = context.sample;
  sample[0] = Math.max(originX, worldX - metresPerTexel);
  sample[1] = worldZ;
  let valid = context.read(sample);
  const left = sample[2]!;
  sample[0] = Math.min(originX + fields.sizeMetres, worldX + metresPerTexel);
  valid = context.read(sample) && valid;
  const right = sample[2]!;
  sample[0] = worldX;
  sample[1] = Math.max(originZ, worldZ - metresPerTexel);
  valid = context.read(sample) && valid;
  const down = sample[2]!;
  sample[1] = Math.min(originZ + fields.sizeMetres, worldZ + metresPerTexel);
  valid = context.read(sample) && valid;
  const up = sample[2]!;
  if (!valid) {
    out[0] = out[2] = 0;
    out[1] = 1;
    return;
  }
  const normalX = left - right;
  const normalY = metresPerTexel * 2;
  const normalZ = down - up;
  const inverseLength =
    1 / Math.max(Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ), Number.EPSILON);
  out[0] = normalX * inverseLength;
  out[1] = normalY * inverseLength;
  out[2] = normalZ * inverseLength;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
