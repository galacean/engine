import { buildEuropeanSteps } from "./Steps";
import {
  normalizeProfileFootprint,
  normalizeProfileHeight,
  normalizeProfileRoof,
  normalizeProfileFoundation,
  normalizeProfileFinish,
  normalizeProfileFloors,
  type ProfileRoofParameters,
  type ProfileFoundationParameters,
  type ProfileFinishParameters,
  type ProfileFloorParameters
} from "../../runtime/ProfileParameters";
import type { ConstructionDecorationSpec } from "../../runtime/ConstructionDecorations";
import { buildAttachment, buildFoundation, buildRoof, buildWalls, buildWallStrip } from "./BuildingGenerators";
import {
  combineBuildingDrafts,
  validateBuildingDraft,
  type BuildingDraft,
  type BuildingFootprint,
  type SurfaceStyle
} from "./BuildingDraft";
export interface EuropeanHouseParameters extends BuildingFootprint {
  id: string;
  seed?: number;
  height?: number;
  roof?: Partial<ProfileRoofParameters>;
  wallColor?: number;
  woodColor?: number;
  wall?: SurfaceStyle;
  wallStructure?: "masonry" | "timber";
  roofStyle?: SurfaceStyle;
  foundation?: ProfileFoundationParameters;
  foundationStyle?: SurfaceStyle;
  plaster?: ProfileFinishParameters;
  floors?: ProfileFloorParameters;
  attachments?: ConstructionDecorationSpec[];
}
/** Style entry: plan + sketch only, no connection solver or unit placement. */
export function buildEuropeanHouses(
  input: EuropeanHouseParameters | readonly EuropeanHouseParameters[]
): BuildingDraft {
  if (Array.isArray(input)) return combineBuildingDrafts(...input.map((p) => buildEuropeanHouses(p)));
  const p = input as EuropeanHouseParameters;
  const shape = normalizeProfileFootprint(
    p.circle ? { circle: p.circle } : { rectangle: p.rectangle ?? { center: [0, 0], size: [8, 6], rotation: 0 } }
  );
  const wall = p.id + "-wall",
    roof = p.id + "-roof";
  const draft: BuildingDraft = {
    groups: [{ id: p.id, seed: p.seed ?? 17, wallColor: p.wallColor ?? 0, woodColor: p.woodColor ?? 0 }],
    parts: [
      ...buildWalls({
        id: wall,
        group: p.id,
        shape,
        height: normalizeProfileHeight(p.height ?? 4),
        plaster: p.plaster ? normalizeProfileFinish(p.plaster) : undefined,
        floors: p.floors ? normalizeProfileFloors(p.floors) : undefined,
        structureMaterial: p.wallStructure,
        style: { unit: "brick", algorithm: { type: "staggered_rows" }, ...p.wall }
      }),
      ...buildRoof({
        id: roof,
        group: p.id,
        roof: normalizeProfileRoof(p.roof ?? {}),
        style: { unit: "roof_tile", algorithm: { type: "overlap_rows" }, ...p.roofStyle }
      })
    ],
    relations: [
      {
        id: p.id + "/roof-wall",
        from: { part: wall, boundary: "top" },
        to: { part: roof, boundary: "base" },
        rule: "wallRoofJoint"
      }
    ]
  };
  if (p.foundation) {
    const id = p.id + "-foundation";
    draft.parts.push(
      ...buildFoundation({
        id,
        group: p.id,
        foundation: normalizeProfileFoundation(p.foundation),
        style: { unit: "brick", ...p.foundationStyle }
      })
    );
    draft.relations.push({
      id: p.id + "/foundation-wall",
      from: { part: id, boundary: "top" },
      to: { part: wall, boundary: "base" },
      rule: "foundationContact"
    });
  }
  for (const spec of p.attachments ?? []) {
    const id = p.id + "/" + spec.id;
    draft.parts.push(buildAttachment({ id, group: p.id, spec }));
    draft.relations.push({
      id: id + "/host",
      from: { part: id, boundary: "mount" },
      to: { part: spec.host === "roof" ? roof : wall, boundary: "surface" },
      rule: "opening"
    });
  }
  validateBuildingDraft(draft);
  return draft;
}
export function buildEuropeanTower(p: EuropeanHouseParameters): BuildingDraft {
  return buildEuropeanHouses({
    ...p,
    height: p.height ?? 10,
    ...(p.rectangle || p.circle ? {} : { circle: { center: [0, 0], radius: 2.5, phase: 0 } })
  });
}
export function buildEuropeanWall(p: {
  id: string;
  seed?: number;
  length?: number;
  depth?: number;
  height?: number;
  center?: [number, number];
  rotation?: number;
  style?: SurfaceStyle;
}): BuildingDraft {
  return {
    groups: [{ id: p.id, seed: p.seed ?? 17, wallColor: 0, woodColor: 0 }],
    relations: [],
    parts: buildWallStrip({
      id: p.id + "-surface",
      group: p.id,
      height: p.height ?? 1.5,
      rectangle: { center: p.center ?? [0, 0], size: [p.length ?? 8, p.depth ?? 0.45], rotation: p.rotation ?? 0 },
      style: { unit: "brick", algorithm: { type: "staggered_rows" }, ...p.style }
    })
  };
}
/** Same strip generator as a wall; the style chooses posts/rails and timber. */
export function buildEuropeanFence(p: Parameters<typeof buildEuropeanWall>[0]): BuildingDraft {
  const draft = buildEuropeanWall({
    ...p,
    depth: p.depth ?? 0.15,
    style: { unit: "wooden_plank", algorithm: { type: "posts_and_rails" }, ...p.style }
  });
  draft.parts[0].type = "fence";
  return draft;
}
export const European = {
  buildHouses: buildEuropeanHouses,
  buildTower: buildEuropeanTower,
  buildWall: buildEuropeanWall,
  buildFence: buildEuropeanFence,
  buildSteps: buildEuropeanSteps
};
