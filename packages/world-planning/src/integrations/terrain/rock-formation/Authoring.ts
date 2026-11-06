import type { IslandPlan, PlanRockBox } from "../../../semantic-study/IslandPlanModel.ts";
import type { PlanningDocument } from "../../../spatial/PlanningDocument.ts";
import { resolveComponent } from "../../../spatial/SpatialDocument.ts";
import { envelope } from "../../../semantic-study/IslandPlanAtoms.ts";
import { rockFormationRegistry } from "./Settings.ts";
import { DEFAULT_ROCK_HEIGHT_MODE, DEFAULT_ROCK_HEIGHT_VARIATION } from "@galacean/engine-terrain/rock-formation/types";
import { readRockGenerationProfile, rockGenerationKind, rockGenerationShape } from "./GenerationProfile.ts";
import { planningRegistry } from "../../../spatial/PlanningComponents.ts";
import { DEFAULT_ROCK_SLOPE_VARIATION } from "@galacean/engine-terrain/rock-formation/Slope";

export const rockObbId = (owner: string, box: string) => `${owner}:obb:${box}`;

function validateSlope(id: string, slopeMode: unknown, slopeRate: unknown, slopeVariation: unknown): void {
  if (slopeMode !== undefined && slopeMode !== "auto" && slopeMode !== "manual")
    throw new Error(`Invalid rock OBB slope mode: ${id}`);
  if (slopeRate !== undefined && (typeof slopeRate !== "number" || !Number.isFinite(slopeRate) || slopeRate <= 0))
    throw new Error(`Invalid rock OBB slope rate: ${id}`);
  if (
    slopeVariation !== undefined &&
    (typeof slopeVariation !== "number" || !Number.isFinite(slopeVariation) || slopeVariation < 0 || slopeVariation > 1)
  )
    throw new Error(`Invalid rock OBB slope variation: ${id}`);
}

/** Sparse per-box shape edits retain siblings and the immutable generated baseline. */
export function applyRockObbSizes(plan: IslandPlan, document: PlanningDocument): void {
  const profile = readRockGenerationProfile(document);
  plan.rocks = plan.rocks.map((rock) => {
    const boxes: PlanRockBox[] = rock.rockObbSource?.boxes ??
      rock.boxes ?? [
        {
          id: rock.id,
          label: rock.id,
          center: rock.center,
          sizeX: rock.width,
          sizeY: rock.height,
          sizeZ: rock.depth,
          yaw: rock.yaw,
          elevation: rock.baseHeight,
          collision: true,
          occlusion: true
        }
      ];
    let dimensionsChanged = false,
      footprintChanged = false,
      modeChanged = false;
    // A direct parent-solid height is author intent too; the generation profile
    // only scales the untouched layout baseline, never an explicit dimension.
    const parentHeight = document.entities[rock.id]?.components.solid
      ? resolveComponent(document, rock.id, "solid", planningRegistry).sources.height?.length
      : 0;
    const next = boxes.map((box) => {
      const id = rockObbId(rock.id, box.id);
      validateSlope(id, box.slopeMode, box.slopeRate, box.slopeVariation);
      const { values, sources } = document.entities[id]?.components.rockObb
        ? resolveComponent(document, id, "rockObb", rockFormationRegistry)
        : { values: {}, sources: {} };
      const read = (key: string, fallback: unknown) => (sources[key]?.length ? values[key] : fallback);
      const platform = rockGenerationKind(plan.parameters.seed, id, profile) === "platform";
      const shape = rockGenerationShape(platform ? "platform" : "peak", profile),
        heightScale = shape.heightScale;
      const sizeX = Number(read("width", box.sizeX)),
        sizeY = Number(read("height", box.sizeY * (parentHeight ? 1 : heightScale))),
        sizeZ = Number(read("depth", box.sizeZ));
      if (![sizeX, sizeY, sizeZ].every((value) => Number.isFinite(value) && value > 0))
        throw new Error(`Invalid rock OBB size: ${id}`);
      const originalMode = box.heightMode ?? DEFAULT_ROCK_HEIGHT_MODE;
      // Explicit source and individual fields remain authoritative over the profile.
      const heightMode = read("heightMode", box.heightMode ?? shape.heightMode);
      if (heightMode !== "random-ascent" && heightMode !== "perlin-ascent")
        throw new Error(`Invalid rock OBB height mode: ${id}`);
      const surfaceMode = read("surfaceMode", box.surfaceMode);
      if (surfaceMode !== undefined && surfaceMode !== "vertex-slabs" && surfaceMode !== "cellular-curvature")
        throw new Error(`Invalid rock OBB surface mode: ${id}`);
      const slopeMode = read("slopeMode", box.slopeMode ?? (platform ? shape.slopeMode : undefined));
      const slopeRate = read("slopeRate", box.slopeRate ?? (slopeMode === "manual" ? shape.slopeRate : undefined));
      const variation = shape.slopeVariation;
      const slopeVariation = read(
        "slopeVariation",
        box.slopeVariation ?? (variation === DEFAULT_ROCK_SLOPE_VARIATION ? undefined : variation)
      );
      const topVariation = shape.heightVariation;
      const heightVariation = read(
        "heightVariation",
        box.heightVariation ?? (topVariation === DEFAULT_ROCK_HEIGHT_VARIATION ? undefined : topVariation)
      );
      validateSlope(id, slopeMode, slopeRate, slopeVariation);
      if (
        heightVariation !== undefined &&
        (typeof heightVariation !== "number" ||
          !Number.isFinite(heightVariation) ||
          heightVariation < 0 ||
          heightVariation > 1)
      )
        throw new Error(`Invalid rock OBB top height variation: ${id}`);
      const resized = sizeX !== box.sizeX || sizeY !== box.sizeY || sizeZ !== box.sizeZ;
      const slopeChanged =
        slopeMode !== box.slopeMode ||
        slopeRate !== box.slopeRate ||
        slopeVariation !== box.slopeVariation ||
        heightVariation !== box.heightVariation;
      dimensionsChanged ||= resized;
      footprintChanged ||= sizeX !== box.sizeX || sizeZ !== box.sizeZ;
      modeChanged ||= heightMode !== originalMode || surfaceMode !== box.surfaceMode || slopeChanged;
      if (!resized && heightMode === originalMode && surfaceMode === box.surfaceMode && !slopeChanged) return box;
      const next = { ...box, sizeX, sizeY, sizeZ };
      // Default projections retain their original job/cache identity, including after reset.
      if (heightMode === DEFAULT_ROCK_HEIGHT_MODE && box.heightMode === undefined) delete next.heightMode;
      else next.heightMode = heightMode;
      // Even a choice equal to today's global default is an explicit surface override.
      if (surfaceMode === undefined) delete next.surfaceMode;
      else next.surfaceMode = surfaceMode;
      // Automatic values remain implicit; an explicit auto choice may override a manual base.
      if (slopeMode === undefined) delete next.slopeMode;
      else next.slopeMode = slopeMode as PlanRockBox["slopeMode"];
      if (slopeRate === undefined) delete next.slopeRate;
      else next.slopeRate = slopeRate as number;
      if (slopeVariation === undefined) delete next.slopeVariation;
      else next.slopeVariation = slopeVariation as number;
      if (heightVariation === undefined) delete next.heightVariation;
      else next.heightVariation = heightVariation as number;
      return next;
    });
    if (!dimensionsChanged && !modeChanged) {
      if (!rock.rockObbSource) return rock;
      const { rockObbSource, ...base } = rock;
      return { ...base, boxes, outline: rockObbSource.outline, obb: rockObbSource.obb };
    }
    if (JSON.stringify(next) === JSON.stringify(rock.boxes)) return rock;
    const source = rock.rockObbSource ?? { boxes, outline: rock.outline, obb: rock.obb };
    if (!footprintChanged)
      return { ...rock, boxes: next, outline: source.outline, obb: source.obb, rockObbSource: source };
    const points = next.flatMap((box) => envelope(box.center, box.sizeX, box.sizeZ, box.yaw));
    // The group outline is a single enclosing polygon, never concatenated box rings.
    const c = Math.cos(rock.yaw),
      s = Math.sin(rock.yaw);
    const local = points.map((p) => ({ x: p.x * c + p.z * s, z: -p.x * s + p.z * c }));
    const minX = Math.min(...local.map((p) => p.x)),
      maxX = Math.max(...local.map((p) => p.x));
    const minZ = Math.min(...local.map((p) => p.z)),
      maxZ = Math.max(...local.map((p) => p.z));
    const x = (minX + maxX) / 2,
      z = (minZ + maxZ) / 2;
    const outline = envelope({ x: x * c - z * s, z: x * s + z * c }, maxX - minX, maxZ - minZ, rock.yaw);
    return { ...rock, boxes: next, outline, obb: outline, rockObbSource: source };
  });
  applyLandscapeRockGeneration(plan, document);
}

/** Scattered landscape rocks inherit the same profile before mesh, picking and collision publication. */
export function applyLandscapeRockGeneration(plan: IslandPlan, document: PlanningDocument): void {
  if (!plan.landscapes?.length) return;
  const profile = readRockGenerationProfile(document);
  const baseline = new Map(plan.spatialLayout?.baselineLandscapes?.map((rock) => [rock.id, rock]));
  let changed = false;
  const landscapes = plan.landscapes.map((rock) => {
    if (rock.kind !== "rock") return rock;
    const kind = rockGenerationKind(plan.parameters.seed, rock.id, profile);
    const { heightScale, ...shape } = rockGenerationShape(kind, profile);
    const sourceHeight = rock.rockGeneration?.sourceHeight ?? baseline.get(rock.id)?.height ?? rock.height;
    const solid = document.entities[rock.id]?.components.solid
      ? resolveComponent(document, rock.id, "solid", planningRegistry)
      : undefined;
    const height = solid?.sources.height?.length ? Number(solid.values.height) : sourceHeight * heightScale;
    if (!Number.isFinite(height) || height <= 0) throw new Error(`Invalid landscape rock height: ${rock.id}`);
    const rockGeneration = { sourceHeight, ...shape };
    if (height === rock.height && JSON.stringify(rockGeneration) === JSON.stringify(rock.rockGeneration)) return rock;
    changed = true;
    return { ...rock, height, rockGeneration };
  });
  if (changed) plan.landscapes = landscapes;
}
