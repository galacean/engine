import type { IslandPlan, PlanRockBox } from "../../../semantic-study/IslandPlanModel.ts";
import type { PlanningDocument } from "../../../spatial/PlanningDocument.ts";
import { resolveComponent } from "../../../spatial/SpatialDocument.ts";
import { envelope } from "../../../semantic-study/IslandPlanAtoms.ts";
import { rockFormationRegistry } from "./Settings.ts";
import { readRockGenerationProfile, rockGenerationKind, rockGenerationShape } from "./GenerationProfile.ts";
import { planningRegistry } from "../../../spatial/PlanningComponents.ts";

export const rockObbId = (owner: string, box: string) => `${owner}:obb:${box}`;

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
      footprintChanged = false;
    // A direct parent-solid height is author intent too; the generation profile
    // only scales the untouched layout baseline, never an explicit dimension.
    const parentHeight = document.entities[rock.id]?.components.solid
      ? resolveComponent(document, rock.id, "solid", planningRegistry).sources.height?.length
      : 0;
    const next = boxes.map((box) => {
      const id = rockObbId(rock.id, box.id);
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
      const resized = sizeX !== box.sizeX || sizeY !== box.sizeY || sizeZ !== box.sizeZ;
      dimensionsChanged ||= resized;
      footprintChanged ||= sizeX !== box.sizeX || sizeZ !== box.sizeZ;
      return resized ? { ...box, sizeX, sizeY, sizeZ } : box;
    });
    if (!dimensionsChanged) {
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
    const { heightScale } = rockGenerationShape(kind, profile);
    const sourceHeight = rock.rockGeneration?.sourceHeight ?? baseline.get(rock.id)?.height ?? rock.height;
    const solid = document.entities[rock.id]?.components.solid
      ? resolveComponent(document, rock.id, "solid", planningRegistry)
      : undefined;
    const height = solid?.sources.height?.length ? Number(solid.values.height) : sourceHeight * heightScale;
    if (!Number.isFinite(height) || height <= 0) throw new Error(`Invalid landscape rock height: ${rock.id}`);
    const rockGeneration = { sourceHeight };
    if (height === rock.height && JSON.stringify(rockGeneration) === JSON.stringify(rock.rockGeneration)) return rock;
    changed = true;
    return { ...rock, height, rockGeneration };
  });
  if (changed) plan.landscapes = landscapes;
}
