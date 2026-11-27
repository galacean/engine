import { retainBuildingResource } from "../../resources/BuildingAssetKit";
import type { BuildingCpuHandle } from "./BuildingCpuClient";
import { renderBuilding } from "./BuildingRender";
import { resolveDocument, units as MATERIAL_UNITS } from "../../runtime/PlacementDocument.js";
import { inspectMasonrySurface } from "../../runtime/MasonrySurfaceInspection";
import type { BuildingRenderInput } from "../../runtime/BuildingRenderPackage";
import type { MaterialUnit } from "../../runtime/UnitPlacementStyle";

function narrowActiveMaterialUnits(input: BuildingRenderInput): BuildingRenderInput {
  const doc = input.placementDocument;
  if (!doc || (doc.overrides && doc.overrides.length > 0)) return input;
  const bindings = new Map<string, any>(doc.bindings.map((b: any) => [b.id, b]));
  const geometries = new Map<string, any>(doc.geometries.map((g: any) => [g.id, g]));
  let changed = false;
  const groups = input.groups.map((group) => {
    if (group.materialUnits || group.woodDraw) return group;
    const binding = bindings.get(group.binding_id);
    if (!binding) return group;
    let unitId = binding.unit_id;
    if (unitId === "source") {
      const geom = geometries.get(binding.geometry_id);
      const parentId = geom?.source?.type === "connection" ? geom.source.bindings?.[0] : undefined;
      if (parentId) unitId = bindings.get(parentId)?.unit_id;
    }
    if (!unitId || !MATERIAL_UNITS.has(unitId)) return group;
    changed = true;
    return { ...group, materialUnits: [unitId as MaterialUnit] };
  });
  return changed ? { ...input, groups } : input;
}

/** A hidden detail candidate for an already-solved Worker snapshot. The host
 * owns residency, entrance, terrain publication and stale-candidate checks. */
export async function prepareBuildingDetail(cpu: BuildingCpuHandle, options: Parameters<typeof renderBuilding>[1]) {
  options.signal.throwIfAborted();
  retainBuildingResource(options.assets, 1);
  try {
    const { renderInput, grounding } = await cpu.compile(options.signal, { omitEmptyCells: true });
    const unitCount = renderInput.groups.reduce((sum, group) => sum + (group.cellCount ?? group.cells.length), 0);
    options.signal.throwIfAborted();
    const renderSource = narrowActiveMaterialUnits(renderInput);
    const rendered = await renderBuilding(renderSource, {
      ...options,
      bounds: grounding.localBounds,
      releasePackageAfterApply: true
    });
    let state: "prepared" | "published" | "disposed" = "prepared";
    return {
      ...rendered,
      unitCount,
      grounding,
      inspectSurface(id: string, polygon?: number[][]) {
        if (state !== "published") throw Error("Building surface is not published");
        return cpu.compile(new AbortController().signal).then(({ renderInput: fresh }) => {
          const freshDoc = fresh.placementDocument;
          if (!freshDoc.bindings.some((b) => b.id === id)) throw Error("Unknown building binding: " + id);
          const resolved = resolveDocument({ document: freshDoc, plans: fresh.plans, groups: fresh.groups }, freshDoc);
          return inspectMasonrySurface(resolved.cells, id, polygon);
        });
      },
      commit() {
        options.signal.throwIfAborted();
        if (state === "disposed" || !cpu.valid || options.parent.destroyed)
          throw Error("Building detail candidate expired");
        rendered.runtime.root.isActive = true;
        state = "published";
      },
      destroy() {
        if (state !== "disposed") {
          state = "disposed";
          rendered.destroy();
        }
      }
    };
  } finally {
    retainBuildingResource(options.assets, -1);
  }
}
