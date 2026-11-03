import type { buildDecorationWindowCutBuffer } from "./DecorationWindowCutBuffer";
import type { ConstructionDrawInput } from "./ConstructionPackage";
import { concatenateRecords } from "./ConstructionCompiler";
import type { PublishedConstructionOwner } from "./ConstructionContacts";
import type { SupportCell } from "./PlacementSupport";
import type { MaterialUnit, MasonryBinding, MasonryOverride } from "./MasonryDocument";
import { contains } from "./PlacementDocument.js";

/** A distance facade cannot flatten units that protrude through the finish
 * envelope. Keep their original material renderer (including its unit LOD),
 * rather than baking a second plaster mask or approximating the brick bevel. */
export interface RetainedWallUnits {
  /** Optional attachment ownership for retained structural trim. */
  pickId?: string;
  ownerId: string;
  slot: number;
  material: MaterialUnit;
  cells: SupportCell[];
  brickRecords?: Uint8Array[];
  windowCuts?: ReturnType<typeof buildDecorationWindowCutBuffer>;
  sourceDraw?: Pick<ConstructionDrawInput, "template" | "instances" | "bindings">;
  wallRoofJoint?: PublishedConstructionOwner["wallRoofJoint"];
}

/** Conservative containment in the finished wall volume, in the producer's
 * unwarped frame. Both plaster and native masonry apply the shared spatial warp.
 * This tests geometry, not corner IDs or a particular arrangement/house type. */
export function wallUnitNeedsVolume(cell: SupportCell, owner: PublishedConstructionOwner): boolean {
  const { shape, wallEnvelope } = owner;
  for (const x of [-0.5, 0.5])
    for (const y of [-0.5, 0.5])
      for (const z of [-0.5, 0.5]) {
        const px =
          cell.center[0] +
          x * cell.size[0] * cell.tangent[0] +
          y * cell.size[1] * cell.bitangent[0] +
          z * cell.size[2] * cell.normal[0] -
          shape.center[0];
        const pz =
          cell.center[2] +
          x * cell.size[0] * cell.tangent[2] +
          y * cell.size[1] * cell.bitangent[2] +
          z * cell.size[2] * cell.normal[2] -
          shape.center[1];
        if (shape.type === "circle") {
          if (Math.hypot(px, pz) > shape.radius + wallEnvelope.finishOuter) return true;
        } else {
          const [c, s] = shape.orientation;
          if (
            Math.abs(c * px + s * pz) > shape.width / 2 + wallEnvelope.finishOuter ||
            Math.abs(-s * px + c * pz) > shape.depth / 2 + wallEnvelope.finishOuter
          )
            return true;
        }
      }
  return false;
}

export function retainWallUnits(
  owner: PublishedConstructionOwner,
  binding: MasonryBinding,
  overrides: readonly MasonryOverride[],
  cells: readonly SupportCell[],
  material: MaterialUnit,
  brickRecords?: ReadonlyMap<string, Uint8Array>
): RetainedWallUnits | undefined {
  const edits = overrides.filter((e) => e.binding_id === binding.id);
  const retained = cells.filter((cell) => {
    let selected = binding.unit_id,
      hidden = false;
    for (const edit of edits)
      if (contains(edit.region.polygon, cell.anchor_uv)) {
        selected = edit.effect.unit_id ?? selected;
        hidden ||= edit.effect.hidden === true;
      }
    return !hidden && selected === material && wallUnitNeedsVolume(cell, owner);
  });
  if (!retained.length) return;
  return {
    ownerId: owner.building.id,
    slot: owner.slot,
    material,
    cells: retained,
    wallRoofJoint: owner.wallRoofJoint,
    ...(material === "brick" && brickRecords
      ? {
          brickRecords: retained.map((c) => {
            const bytes = brickRecords.get(c.id);
            if (!bytes) throw Error("Retained wall unit lost its source record: " + c.id);
            return bytes;
          })
        }
      : {})
  };
}

/** Filtering copies complete records but preserves their cut-list offsets and
 * the original template/ABI. In particular, gable boards are not generic boxes. */
export function retainWallDraws(
  batch: RetainedWallUnits,
  groups: readonly {
    cells: readonly SupportCell[];
    woodDraw: NonNullable<RetainedWallUnits["sourceDraw"]>;
  }[]
): RetainedWallUnits[] {
  const selected = new Set(batch.cells.map((c) => c.id));
  return groups.flatMap((group) => {
    const stride = group.woodDraw.instances.byteLength / group.cells.length;
    const cells: SupportCell[] = [],
      records: Uint8Array[] = [];
    group.cells.forEach((cell, i) => {
      if (!selected.has(cell.id)) return;
      cells.push(cell);
      records.push(group.woodDraw.instances.subarray(i * stride, (i + 1) * stride));
    });
    return cells.length
      ? [{ ...batch, cells, sourceDraw: { ...group.woodDraw, instances: concatenateRecords(records) } }]
      : [];
  });
}
