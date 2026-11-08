// Adapter: core design result → the existing render input. Rendering itself
// (packing, preview, shaders, LOD) is reused unchanged.
//
// COMPAT(online-parity): the target, BuildingRenderInput, is the online render
// contract. After the migration, laid units feed unit renderers directly (record
// layout per unit, optional GPU pass, unit shader); this adapter, its render plan and
// the casts below go away with the online path. See ../MIGRATION.md.
import {
  expandPart,
  laidUnit,
  layingContext,
  quatFromEuler,
  rotation,
  transformPoint,
  unitNominal,
  type BuildingDesignResult,
  type BuildingRegistry,
  type BuildingUnit,
  type LaidUnit,
  type Vec3
} from "../core";
import type { BuildingRenderInput, BuildingUnitDrawGroup } from "../runtime/BuildingRenderPackage";
import type { SupportCell } from "../runtime/PlacementSupport";
import type { TerrainHeight } from "../runtime/PublishedWallProfile";
import type { BuildingUnitAssets } from "../runtime/BuildingUnitAssets";
import { packConstructionUnits, type ConstructionUnitRole } from "../runtime/ConstructionUnitRender";
import { resolvedArrangement, type UnitPlacementBinding } from "../runtime/UnitPlacement";
import { profilePreview } from "../runtime/ProfilePreview";
import { encodeCompleteConstructionDormerBins } from "../runtime/DormerBins";

/** One colour/palette owner, as the renderer understands it. */
export interface CoreRenderOwner {
  readonly id: string;
  readonly slot: number;
  readonly seed: number;
  readonly palette: { readonly wallColor: number; readonly woodColor: number; readonly roofColor: number };
}
// COMPAT(online-parity): online cell ids, anchors and draw order.
/** Renderer identity of one laid unit. `order` sorts the units of one draw. */
export interface CoreCellName {
  readonly id: string;
  readonly anchor_uv: readonly [number, number];
  readonly order: readonly number[];
}
/** One strip draw: several core parts can share one binding, such as fence posts and rails. */
export interface CoreStripDraw {
  readonly owner: string;
  readonly binding: UnitPlacementBinding;
  readonly geometry: { readonly id: string; readonly type: "strip"; readonly source: Record<string, unknown> };
  readonly role: ConstructionUnitRole;
  readonly parts: readonly { readonly key: string; name(unit: LaidUnit): CoreCellName }[];
}
export interface CoreRenderOptions {
  /** GPU prototype only: lay one cell per layout slot and use core seeds for bricks. */
  readonly slots?: boolean;
}
export interface CoreRenderPlan {
  readonly owners: readonly CoreRenderOwner[];
  readonly strips: readonly CoreStripDraw[];
}

const CENTER: Vec3 = [0, 0, 0];
/** A laid unit as the renderer's support cell: box center, axes and laid size. */
export function supportCell(unit: BuildingUnit, laid: LaidUnit, name: CoreCellName): SupportCell {
  const { min, max } = unit.bounds ?? { min: CENTER, max: CENTER };
  const center = transformPoint(
    laid.matrix as number[],
    [0, 1, 2].map((i) => (min[i] + max[i]) / 2) as unknown as Vec3
  );
  const f = laid.frame;
  let axes: Vec3[] = [f.x, f.y, f.z];
  if (unit.rotation) {
    const r = rotation(quatFromEuler(unit.rotation));
    axes = [0, 1, 2].map(
      (i) => [0, 1, 2].map((k) => f.x[k] * r[i * 4] + f.y[k] * r[i * 4 + 1] + f.z[k] * r[i * 4 + 2]) as unknown as Vec3
    );
  }
  // COMPAT(online-parity): strip cells have no surface chart; `surface_id` stays absent as online.
  return {
    id: name.id,
    logical_id: name.id,
    anchor_uv: [...name.anchor_uv],
    center: [...center],
    tangent: [...axes[0]],
    bitangent: [...axes[1]],
    normal: [...axes[2]],
    size: [...(laid.size ?? unitNominal(unit))]
  } as unknown as SupportCell;
}

/** `registry` and `terrain` must be the ones the design ran with: units are laid again here. */
export async function coreRenderInput(
  result: BuildingDesignResult,
  plan: CoreRenderPlan,
  registry: BuildingRegistry,
  terrain: TerrainHeight,
  assets: BuildingUnitAssets,
  options: CoreRenderOptions = {}
): Promise<BuildingRenderInput> {
  if (result.diagnostics.length) throw Error(result.diagnostics.map((d) => d.source + ": " + d.message).join("\n"));
  const parts = new Map(result.parts.map((p) => [p.key, p]));
  const owners = new Map(plan.owners.map((o) => [o.id, o]));
  const groups: BuildingUnitDrawGroup[] = [];
  const plans: { binding_id: string; cells: SupportCell[]; dependencies: string[] }[] = [];
  const surfaces: Parameters<typeof profilePreview>[0]["surfaces"][number][] = [];
  for (const strip of plan.strips) {
    const owner = owners.get(strip.owner);
    if (!owner) throw Error("Unknown render owner " + strip.owner);
    const cells: SupportCell[] = [];
    strip.parts.forEach((ref) => {
      const part = parts.get(ref.key);
      if (!part?.unit) throw Error("Render plan refers to a part without units: " + ref.key);
      if (options.slots) {
        cells.push(...slotCells(part, registry, terrain, ref.name, strip.owner));
        return;
      }
      const units = [...expandPart(part, registry, { environment: { ground: terrain } })];
      const named = units.map((laid) => ({ laid, name: ref.name(laid) }));
      named.sort((a, b) => compareOrder(a.name.order, b.name.order));
      for (const { laid, name } of named) cells.push(withoutUndefined(supportCell(part.unit, laid, name)));
    });
    const units = await packConstructionUnits({ cells, slot: owner.slot, role: strip.role, source: {} });
    groups.push({
      id: groups.length,
      binding_id: strip.binding.id,
      role: strip.role,
      cells,
      units,
      ownerId: owner.id,
      wallRoofJoint: undefined
    } as unknown as BuildingUnitDrawGroup);
    plans.push({ binding_id: strip.binding.id, cells, dependencies: [] });
    surfaces.push({
      kind: "strip",
      id: owner.id,
      seed: owner.seed,
      palette: owner.palette,
      binding: strip.binding,
      cells
    });
  }
  const preview = profilePreview(
    { surfaces, overrides: [], junctions: [], hostTerrain: true, spires: [], woodPillar: undefined },
    terrain,
    { preparedRoofs: new Map(), assets }
  );
  const backedBindings = new Set(
    plan.strips.filter((s) => resolvedArrangement(s.binding) !== "overlap_rows").map((s) => s.binding.id)
  );
  return {
    rawDraws: [],
    groups,
    decorations: [],
    dormerBins: encodeCompleteConstructionDormerBins([]),
    paletteSlots: plan.owners.map(({ seed, palette }) => ({ seed, ...palette })),
    colorOwners: plan.owners.map(({ id, seed }) => ({ id, seed })),
    backingParts: preview.parts.filter(
      (p) =>
        p.placement !== "unit" &&
        !p.stonePaving &&
        !p.plaster &&
        !p.decoration &&
        !p.junction &&
        !p.dormer &&
        p.backing !== false &&
        backedBindings.has(p.bindingId!)
    ),
    surfaceParts: preview.parts,
    placementDocument: {
      version: 2,
      geometries: plan.strips.map((s) => s.geometry),
      bindings: plan.strips.map((s) => s.binding),
      overrides: []
    },
    plans
  };
}

/** GPU prototype: one cell per layout slot, so the renderer's record index equals the slot.
 * Empty slots become zero-size cells, and bricks use the core seed, which the GPU kernel
 * reproduces. */
function slotCells(
  part: BuildingDesignResult["parts"][number],
  registry: BuildingRegistry,
  terrain: TerrainHeight,
  name: (unit: LaidUnit) => CoreCellName,
  owner: string
): SupportCell[] {
  const algorithm = registry.algorithms.get(part.algorithm.type)!;
  const context = layingContext(part, part.unit!, part.layout!.params, registry, { ground: terrain });
  const cells: SupportCell[] = [];
  for (let i = 0; i < part.layout!.count; i++) {
    const spec = algorithm.unitAt(context, part.layout!.data, i);
    if (!spec) {
      cells.push({
        id: `${owner}/slot-${i}`,
        logical_id: `${owner}/slot-${i}`,
        anchor_uv: [0, 0],
        center: [0, 0, 0],
        tangent: [1, 0, 0],
        bitangent: [0, 1, 0],
        normal: [0, 0, 1],
        size: [0, 0, 0]
      } as unknown as SupportCell);
      continue;
    }
    const laid = laidUnit(context, spec);
    cells.push({
      ...withoutUndefined(supportCell(part.unit!, laid, name(laid))),
      brick_seed: laid.seed & 0x7fffffff
    });
  }
  return cells;
}
function compareOrder(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -Infinity) - (b[i] ?? -Infinity);
    if (d) return d;
  }
  return 0;
}
function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
