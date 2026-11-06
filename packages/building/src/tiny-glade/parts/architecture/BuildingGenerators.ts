import { copyBuildingValue } from "../BuildingAlgorithms";
import type {
  ProfileRoofParameters,
  ProfileFoundationParameters,
  ProfileFinishParameters,
  ProfileFloorParameters
} from "../../runtime/ProfileParameters";
import type { ConstructionDecorationSpec } from "../../runtime/ConstructionDecorations";
import type { BuildingBasePart, BuildingFootprint, SurfaceStyle } from "./BuildingDraft";
import type { WallConnectionShape } from "../../runtime/WallConnectionTypes";
import { wallMountCurve, projectWallMount } from "../../runtime/WallMountGeometry";

function surfacePart(
  id: string,
  group: string,
  type: BuildingBasePart["type"],
  generator: BuildingBasePart["support"]["generator"],
  geometry: Record<string, any>,
  style: SurfaceStyle
): BuildingBasePart {
  return copyBuildingValue({
    id,
    group,
    type,
    support: { generator, params: geometry },
    algorithm: style.algorithm ?? { type: "auto" },
    unit: style.unit ?? "brick",
    ...(style.appearance ? { appearance: style.appearance } : {}),
    ...(style.regions ? { regions: style.regions } : {}),
    params: {
      ...(style.variationKey !== undefined ? { variationKey: style.variationKey } : {}),
      footprint: style.footprint ?? { width: 0.5, height: 0.4375, depth: 0.1 },
      seed: style.seed ?? "source"
    }
  });
}
/** Common geometry builders do not choose a building style or tile/brick asset. */
export function buildWalls(
  p:
    | {
        id: string;
        group: string;
        shape: BuildingFootprint;
        height: number;
        structureMaterial?: "masonry" | "timber";
        style: SurfaceStyle;
        plaster?: ProfileFinishParameters;
        floors?: ProfileFloorParameters;
      }
    | { id: string; group: string; support: BuildingBasePart["support"]; style: SurfaceStyle }
): BuildingBasePart[] {
  if ("support" in p) return [surfacePart(p.id, p.group, "wall", p.support.generator, p.support.params, p.style)];
  return [
    surfacePart(
      p.id,
      p.group,
      "wall",
      "wallProfile",
      {
        ...p.shape,
        height: p.height,
        structureMaterial: p.structureMaterial ?? (p.style.unit === "wooden_plank" ? "timber" : "masonry"),
        ...(p.plaster ? { plaster: p.plaster } : {}),
        ...(p.floors ? { floors: p.floors } : {})
      },
      p.style
    )
  ];
}
export function buildRoof(
  p:
    | { id: string; group: string; roof: ProfileRoofParameters; style: SurfaceStyle }
    | { id: string; group: string; support: BuildingBasePart["support"]; style: SurfaceStyle }
): BuildingBasePart[] {
  if ("support" in p) return [surfacePart(p.id, p.group, "roof", p.support.generator, p.support.params, p.style)];
  return [surfacePart(p.id, p.group, "roof", "roofProfile", { roof: p.roof }, p.style)];
}
export function buildFoundation(p: {
  id: string;
  group: string;
  foundation: ProfileFoundationParameters;
  style: SurfaceStyle;
}): BuildingBasePart[] {
  return [surfacePart(p.id, p.group, "foundation", "foundationProfile", p.foundation, p.style)];
}
export function buildWallStrip(p: {
  id: string;
  group: string;
  rectangle: NonNullable<BuildingFootprint["rectangle"]>;
  height: number;
  style: SurfaceStyle;
}): BuildingBasePart[] {
  return [surfacePart(p.id, p.group, "wall", "wallStrip", { rectangle: p.rectangle, height: p.height }, p.style)];
}
export function buildAttachment(p: { id: string; group: string; spec: ConstructionDecorationSpec }): BuildingBasePart {
  const type =
    p.spec.type?.includes("window") || p.spec.type?.includes("dormer")
      ? "window"
      : p.spec.type?.includes("door")
        ? "door"
        : p.spec.type?.includes("opening")
          ? "opening"
          : "attachment";
  const { kind, type: assetType, rank, frameMaterial, ...mount } = p.spec;
  return {
    id: p.id,
    group: p.group,
    type,
    support: { generator: "attachmentMount", params: { spec: mount } },
    algorithm: { type: "mountAttachment" },
    unit: { nativeAttachment: { kind, type: assetType, rank, frameMaterial } },
    params: {}
  };
}
/** Resolve the chosen asset explicitly; no placeholder brick Unit on window parts. */
export function attachmentSpecification(
  part: BuildingBasePart,
  wallShape?: WallConnectionShape
): ConstructionDecorationSpec {
  if (typeof part.unit !== "object" || !("nativeAttachment" in part.unit))
    throw Error("Native attachment supports require an explicit nativeAttachment Unit");
  const { point, spec: authored } = part.support.params;
  const spec = { ...authored, id: part.id, variationKey: authored.variationKey ?? authored.id };
  if (point !== undefined) {
    if (!wallShape || spec.host === "roof" || spec.u !== undefined || spec.bottom !== undefined)
      throw Error("Wall point mounting requires a wall host and no second u/bottom position");
    const { u, bottom } = projectWallMount(wallMountCurve(wallShape), point);
    return { ...spec, u, bottom, ...part.unit.nativeAttachment };
  }
  return { ...spec, ...part.unit.nativeAttachment };
}
