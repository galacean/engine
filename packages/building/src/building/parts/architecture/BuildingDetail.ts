import { retainBuildingResource } from "../../resources/BuildingAssetKit";
import type { BuildingCpuHandle } from "./BuildingCpuClient";
import { renderBuilding } from "./BuildingRender";
import { resolveDocument } from "../../runtime/PlacementDocument.js";
import { inspectMasonrySurface } from "../../runtime/MasonrySurfaceInspection";

/** A hidden detail candidate for an already-solved Worker snapshot. The host
 * owns residency, entrance, terrain publication and stale-candidate checks. */
export async function prepareBuildingDetail(cpu: BuildingCpuHandle, options: Parameters<typeof renderBuilding>[1]) {
  options.signal.throwIfAborted();
  retainBuildingResource(options.assets, 1);
  try {
    const { renderInput, grounding } = await cpu.compile(options.signal);
    const document = renderInput.placementDocument;
    options.signal.throwIfAborted();
    const rendered = await renderBuilding(renderInput, { ...options, bounds: grounding.localBounds });
    let state: "prepared" | "published" | "disposed" = "prepared";
    return {
      ...rendered,
      unitCount: renderInput.groups.reduce((sum, group) => sum + group.cells.length, 0),
      grounding,
      inspectSurface(id: string, polygon?: number[][]) {
        if (state !== "published") throw Error("Building surface is not published");
        if (!document.bindings.some((b) => b.id === id)) throw Error("Unknown building binding: " + id);
        const resolved = resolveDocument(rendered.package, document);
        return inspectMasonrySurface(resolved.cells, id, polygon);
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
