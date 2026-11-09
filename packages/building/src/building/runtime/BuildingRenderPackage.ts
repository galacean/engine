import { buildingPartKey } from "./BuildingObjectIdentity";
import { decorationStoneBounds } from "./DecorationStoneBounds";
import { decorationFrameBounds } from "./ConstructionDecorationFrames";
import { appendStoneFloorRenderPackage } from "./ConstructionStoneFloorRender";
import {
  constructionSurfaceUnitDraw,
  type ConstructionUnitRole,
  type ConstructionUnitDraw
} from "./ConstructionUnitRender";
import { packDecorationStoneFrameInstances } from "./DecorationStoneFrameInstance";
import { appendDecorationRenderPackage } from "./ConstructionDecorationRender";
import { constructionSupportParts } from "./ConstructionSupportRender";
import { appendPlasterRenderPackage } from "./ConstructionPlasterRender";
import type { BuildingAssets } from "../resources/BuildingAssetKit";
import {
  ConstructionPackageBuilder,
  type ConstructionBindings,
  type ConstructionDrawInput
} from "./ConstructionPackage";
import { packDecorationStoneInstances } from "./DecorationStoneInstance";
import { addWoodArchPillarDraws, appendWoodArchRenderPackage } from "./ConstructionWoodArchRender";
import type { CompiledConstructionDecorations } from "./ConstructionDecorations";
import type { ConstructionPreviewPart } from "./ProfilePreview";
import type { encodeConstructionDormerBins } from "./DormerBins";
import type { MaterialUnit } from "./UnitPlacementStyle";
import type { SupportCell } from "./PlacementSupport";
import type { buildDecorationWindowCutBuffer } from "./DecorationWindowCutBuffer";

export interface BuildingUnitDrawGroup {
  id: number;
  binding_id: string;
  ownerId: string;
  role: ConstructionUnitRole;
  cells: SupportCell[];
  units: Record<MaterialUnit, Uint8Array>;
  materialUnits?: MaterialUnit[];
  decorationId?: string;
  woodDraw?: ConstructionUnitDraw;
  wallRoofJoint?: ConstructionDrawInput["wallRoofJoint"];
  roofApertures?: boolean;
  gravity?: NonNullable<ConstructionDrawInput["feedback"]>["steps"];
  windowCuts?: ReturnType<typeof buildDecorationWindowCutBuffer>;
}
/** Transient implementation output. All ownership and backing choices are
 * explicit; the renderer never discovers a house or interprets geometry names. */
export interface BuildingRenderInput {
  paletteSlots: import("./BuildingGlobals").BuildingPaletteSlot[];
  rawDraws: (ConstructionDrawInput & { pickId?: string })[];
  groups: BuildingUnitDrawGroup[];
  decorations: CompiledConstructionDecorations[];
  dormerBins: ReturnType<typeof encodeConstructionDormerBins>;
  colorOwners: { id: string; seed: number }[];
  backingParts: ConstructionPreviewPart[];
  surfaceParts: ConstructionPreviewPart[];
  placementDocument: { version: number; geometries: any[]; bindings: any[]; overrides: any[] };
  plans: any[];
}

export function buildBuildingRenderPackage(
  input: BuildingRenderInput,
  assets: BuildingAssets,
  globals: ConstructionBindings,
  whiteBase = false,
  rigidPoses?: ReadonlyMap<string, readonly number[]>,
  stoneGeometry?: import("./ConstructionGeometryAssets").ConstructionStoneGeometry
) {
  const stones = input.decorations.flatMap((d) => d.stones);
  const frames = input.decorations.flatMap((d) => d.frames);
  const counts = new Uint8Array(
    input.dormerBins.counts.buffer,
    input.dormerBins.counts.byteOffset,
    input.dormerBins.counts.byteLength
  );
  const holes = input.dormerBins.holes;
  const builder = new ConstructionPackageBuilder(assets, {
    ...globals,
    roofCounts: counts,
    roofHoles: holes,
    domainCounts: counts,
    domainHoles: holes
  });
  for (const stone of stones) {
    const draw = builder.addDraw({
      id: stone.id,
      ownerId: stone.ownerId,
      template: stone.template,
      instances: packDecorationStoneInstances([stone.instance]),
      geometryScale: stone.geometryScale
    });
    if (rigidPoses) {
      const inverseBind = rigidPoses.get(buildingPartKey(stone.decorationId));
      if (!inverseBind) throw Error("Missing stone decoration binding " + stone.decorationId);
      draw.objectBinding = {
        id: buildingPartKey(stone.decorationId),
        inverseBind: [...inverseBind],
        ...decorationStoneBounds(stoneGeometry, stone)
      };
    }
  }
  for (const frame of frames) {
    const draw = builder.addDraw({
      id: frame.id,
      ownerId: frame.ownerId,
      template: frame.template,
      instances: packDecorationStoneFrameInstances([frame.instance])
    });
    if (rigidPoses) {
      const inverseBind = rigidPoses.get(buildingPartKey(frame.decorationId));
      if (!inverseBind) throw Error("Missing frame decoration binding " + frame.decorationId);
      draw.objectBinding = {
        id: buildingPartKey(frame.decorationId),
        inverseBind: [...inverseBind],
        ...decorationFrameBounds(stoneGeometry, frame)
      };
    }
  }
  addWoodArchPillarDraws(
    builder,
    input.decorations.flatMap((d) => d.woodArchPillars ?? []),
    globals
  );
  for (const { pickId, ...source } of input.rawDraws) {
    const draw = builder.addDraw(source);
    if (pickId !== undefined) draw.pickId = pickId;
  }
  for (const group of input.groups) {
    const ownerId = group.ownerId;
    if (!ownerId) throw Error("Unit draw group requires an explicit owner");
    const wallRoofJoint = group.wallRoofJoint;
    // Native wood groups are already partitioned by their 80/96-byte ABI and
    // gable mesh. Repacking them as generic units loses skew bounds and breaks
    // the correspondence between material selections and window-cut lists.
    if (group.woodDraw) {
      builder.addDraw({
        id: "enclosure-" + group.id + "-wooden_plank",
        ownerId,
        ...constructionSurfaceUnitDraw("wooden_plank", group.woodDraw.instances, { sourceDraw: group.woodDraw }),
        wallRoofJoint,
        variant: "wooden_plank",
        group: group.id
      });
      continue;
    }
    if (!["layout", "connections", "dormer_roof"].includes(group.role) && !group.roofApertures) {
      for (const variant of ["brick", "wooden_plank", "roof_tile"] as const) {
        if (group.materialUnits && !group.materialUnits.includes(variant)) continue;
        builder.addDraw({
          id: "enclosure-" + group.id + "-" + variant,
          ownerId,
          ...constructionSurfaceUnitDraw(variant, group.units[variant], { windowCuts: group.windowCuts }),
          wallRoofJoint,
          variant,
          group: group.id
        });
      }
      continue;
    }
    const id = "generic-" + group.id,
      domainRoof = group.units.roof_tile;
    // Replacement materials consume the packed plane@16, slot@40 and main-body
    // flag@60. All survive gravity unchanged; no settled-position shadow buffer.
    if (!group.materialUnits || group.materialUnits.includes("roof_tile"))
      builder.addDraw({
        id,
        ownerId,
        template: "roof",
        instances: domainRoof,
        variant: "roof_tile",
        group: group.id,
        ...(group.gravity ? { feedback: { steps: group.gravity } } : {})
      });
    if (!group.materialUnits || group.materialUnits.includes("brick"))
      builder.addDraw({
        id: id + "-brick",
        ownerId,
        template: "brick_roof",
        instances: group.units.brick,
        variant: "brick",
        group: group.id,
        bindings: { domainRoof }
      });
    if (!group.materialUnits || group.materialUnits.includes("wooden_plank"))
      builder.addDraw({
        id: id + "-wooden_plank",
        ownerId,
        template: "wood_roof",
        instances: group.units.wooden_plank,
        variant: "wooden_plank",
        group: group.id,
        bindings: { domainRoof }
      });
  }
  const result = builder.build();
  for (const draw of result.package.draws) {
    const group = input.groups.find((group) => group.id === draw.group);
    if (group?.decorationId !== undefined) draw.pickId = group.decorationId;
  }
  result.package.whiteBase = whiteBase;
  if (whiteBase) result.package.colorOwners = input.colorOwners.map((o) => ({ ...o }));
  result.package.dormerGrid = [...input.dormerBins.grid];
  result.package.document = structuredClone(input.placementDocument);
  result.package.groups = input.groups.map(({ id, binding_id, role, cells, materialUnits }) => ({
    id,
    binding_id,
    role,
    cells: structuredClone(cells),
    ...(materialUnits ? { materialUnits: [...materialUnits] } : {})
  }));
  result.package.plans = structuredClone(input.plans);
  const decorated = appendPlasterRenderPackage(
    appendDecorationRenderPackage(
      result,
      [
        ...constructionSupportParts(input.backingParts),
        ...input.decorations.flatMap((d) => d.parts),
        ...input.surfaceParts
          .filter((p) => p.roofSpire)
          .map((p) => ({
            id: p.owner + "/roof-spire",
            ownerId: p.owner,
            kind: "roof-spire",
            positions: p.positions,
            indices: p.indices,
            normals: p.normals!,
            colors: p.colors!,
            emission: p.emission!,
            uvs: p.uvs
          }))
      ],
      rigidPoses
    ),
    input.surfaceParts
  );
  const rendered = appendWoodArchRenderPackage(
    appendStoneFloorRenderPackage(decorated, input.surfaceParts),
    input.decorations.flatMap((d) => d.woodArchFrames ?? []),
    globals
  );
  for (const draw of rendered.package.draws)
    if (draw.count > 0 && draw.ownerId === undefined)
      throw Error("Construction draw requires an explicit owner: " + draw.id);
  return rendered;
}
