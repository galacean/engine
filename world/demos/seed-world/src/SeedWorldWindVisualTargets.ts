import { sampleSeedWorldHeight, type SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import type { SeedWorldPopulationPreview } from "@galacean/engine-world-planning/runtime/SeedWorldPopulationPlan";
import { resolveSeedWorldCameraAngles, type SeedWorldCameraBookmark } from "@galacean/engine-world-planning/world/SeedWorldCameraBookmark";

export type SeedWorldWindVisualView = "tree" | "grass" | "flower" | "shrub" | "water" | "sky";

export interface SeedWorldWindVisualTarget {
  readonly view: SeedWorldWindVisualView;
  readonly source: "exact-instance" | "density-field" | "water-field" | "sky-over-detail";
  readonly subjectPosition: readonly [x: number, y: number, z: number];
  readonly camera: SeedWorldCameraBookmark;
}

/**
 * Resolves a deterministic close-up which contains the production asset/field used by one wind consumer.
 * It never adds acceptance-only geometry to the generated world.
 */
export function resolveSeedWorldWindVisualTarget(
  fields: SeedWorldFields,
  population: SeedWorldPopulationPreview,
  view: SeedWorldWindVisualView
): SeedWorldWindVisualTarget {
  if (view === "tree" || view === "shrub") {
    const instance = population.treeInstances
      .filter((candidate) => candidate.category === view)
      .reduce<(typeof population.treeInstances)[number] | undefined>((selected, candidate) => {
        if (!selected) return candidate;
        return centrality(candidate.normalizedPosition.x, candidate.normalizedPosition.y) <
          centrality(selected.normalizedPosition.x, selected.normalizedPosition.y)
          ? candidate
          : selected;
      }, undefined);
    if (!instance) throw new Error(`Seed World wind visual target requires one ${view} instance`);
    const x = normalizedToWorld(instance.normalizedPosition.x, fields.sizeMetres);
    const z = normalizedToWorld(instance.normalizedPosition.y, fields.sizeMetres);
    const y = requireHeight(fields, x, z);
    const subjectHeight = view === "tree" ? Math.max(5, 6 * instance.scale[1]) : Math.max(0.8, 1.2 * instance.scale[1]);
    return createTarget(
      fields,
      view,
      "exact-instance",
      x,
      y,
      z,
      view === "tree" ? 17 : 4.6,
      view === "tree" ? 3.8 : 3.1,
      subjectHeight * (view === "tree" ? 0.58 : 0.9)
    );
  }

  if (view === "water") {
    const target = findWaterTarget(fields);
    return createTarget(fields, view, "water-field", target.x, target.y, target.z, 8, 2.2, 0.08);
  }

  const densityCategory = view === "sky" ? "grass" : view;
  const detail = findDensityTarget(fields, population, densityCategory);
  if (view === "sky") {
    return createTarget(fields, view, "sky-over-detail", detail.x, detail.y, detail.z, 4, 1.8, 17);
  }
  return createTarget(fields, view, "density-field", detail.x, detail.y, detail.z, 4.2, 1.65, view === "flower" ? 0.75 : 0.48);
}

function findDensityTarget(
  fields: SeedWorldFields,
  population: SeedWorldPopulationPreview,
  category: "grass" | "flower"
): Readonly<{ x: number; y: number; z: number }> {
  let selected: Readonly<{ density: number; normalizedX: number; normalizedZ: number; score: number }> | undefined;
  for (const field of population.detailDensityFields) {
    if (field.category !== category) continue;
    for (let z = 0; z < field.resolution; z++) {
      for (let x = 0; x < field.resolution; x++) {
        const density = field.samples[z * field.resolution + x]!;
        if (density === 0) continue;
        const normalizedX = (x + 0.5) / field.resolution;
        const normalizedZ = (z + 0.5) / field.resolution;
        const score = density - centrality(normalizedX, normalizedZ) * 72;
        if (!selected || score > selected.score) selected = { density, normalizedX, normalizedZ, score };
      }
    }
  }
  if (!selected) throw new Error(`Seed World wind visual target requires a non-zero ${category} density field`);
  const x = normalizedToWorld(selected.normalizedX, fields.sizeMetres);
  const z = normalizedToWorld(selected.normalizedZ, fields.sizeMetres);
  return Object.freeze({ x, y: requireHeight(fields, x, z), z });
}

function findWaterTarget(fields: SeedWorldFields): Readonly<{ x: number; y: number; z: number }> {
  const resolution = fields.surfaceResolution;
  let selected: Readonly<{ x: number; z: number; y: number; score: number }> | undefined;
  for (let z = 1; z < resolution - 1; z++) {
    for (let x = 1; x < resolution - 1; x++) {
      const index = z * resolution + x;
      if (fields.waterMask[index] === 0) continue;
      const waterLevel = fields.wetlandWaterLevelMetres[index]!;
      if (!Number.isFinite(waterLevel)) continue;
      const normalizedX = (x + 0.5) / resolution;
      const normalizedZ = (z + 0.5) / resolution;
      const score = centrality(normalizedX, normalizedZ);
      if (!selected || score < selected.score) {
        selected = {
          x: normalizedToWorld(normalizedX, fields.sizeMetres),
          z: normalizedToWorld(normalizedZ, fields.sizeMetres),
          y: waterLevel,
          score
        };
      }
    }
  }
  if (!selected) throw new Error("Seed World wind visual target requires one active water texel");
  return Object.freeze({ x: selected.x, y: selected.y, z: selected.z });
}

function createTarget(
  fields: SeedWorldFields,
  view: SeedWorldWindVisualView,
  source: SeedWorldWindVisualTarget["source"],
  subjectX: number,
  subjectY: number,
  subjectZ: number,
  distance: number,
  eyeHeight: number,
  lookHeight: number
): SeedWorldWindVisualTarget {
  let inwardX = -subjectX;
  let inwardZ = -subjectZ;
  const inwardLength = Math.hypot(inwardX, inwardZ);
  if (inwardLength < 0.001) {
    inwardX = -1;
    inwardZ = -1;
  }
  const directionLength = Math.hypot(inwardX, inwardZ);
  const cameraX = subjectX + (inwardX / directionLength) * distance;
  const cameraZ = subjectZ + (inwardZ / directionLength) * distance;
  const cameraGround = sampleSeedWorldHeight(fields, cameraX, cameraZ) ?? subjectY;
  const cameraY = Math.max(cameraGround + eyeHeight, subjectY + eyeHeight);
  const lookY = subjectY + lookHeight;
  const forward = { x: subjectX - cameraX, y: lookY - cameraY, z: subjectZ - cameraZ };
  const angles = resolveSeedWorldCameraAngles(forward);
  return Object.freeze({
    view,
    source,
    subjectPosition: Object.freeze([subjectX, subjectY, subjectZ] as const),
    camera: Object.freeze({
      position: Object.freeze([cameraX, cameraY, cameraZ] as const),
      yawDegrees: angles.yawDegrees,
      pitchDegrees: angles.pitchDegrees,
      mode: "roam"
    })
  });
}

function requireHeight(fields: SeedWorldFields, worldX: number, worldZ: number): number {
  const height = sampleSeedWorldHeight(fields, worldX, worldZ);
  if (height === undefined) throw new Error("Seed World wind visual target lies outside the generated heightfield");
  return height;
}

function normalizedToWorld(value: number, sizeMetres: number): number {
  return (value - 0.5) * sizeMetres;
}

function centrality(normalizedX: number, normalizedZ: number): number {
  return Math.hypot(normalizedX - 0.5, normalizedZ - 0.5);
}
