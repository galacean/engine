import { buildingPartKey, buildingGroupKey } from "../../runtime/BuildingObjectIdentity";
import type { RuntimePickVisitor } from "@galacean/engine-modify/rendering/runtime-pick-source";
import type { Camera, Entity, PrefabResource } from "@galacean/engine";
import { BuildingPartDraft } from "../BuildingParts";
import { retainBuildingResources } from "../BuildingAlgorithms";
import { buildingAssets, retainBuildingResource } from "../../resources/BuildingAssetKit";
import type { TerrainHeight } from "../../runtime/PublishedWallProfile";
import type { BuildingDraft } from "./BuildingDraft";
import { designBuilding } from "./BuildingDesign";
import { buildingFocusPoses } from "./BuildingPublication";
import { implementBuilding } from "./BuildingImplementation";
import { buildingAlgorithmContext, renderInstanceParts } from "./BuildingInstanceRender";
import { renderBuilding } from "./BuildingRender";

/** One unpublished candidate for all part render backends. Author components and
 * Scene lifetime stay with the manager; algorithms and their resources stay here. */
export async function prepareBuilding(
  draft: BuildingDraft,
  options: {
    parent: Entity;
    camera: Camera;
    terrain: TerrainHeight;
    assets?: PrefabResource;
    signal: AbortSignal;
  }
) {
  const { parent, camera, terrain, assets, signal } = options;
  signal.throwIfAborted();
  retainBuildingResources(draft, 1);
  if (assets) retainBuildingResource(assets, 1);
  let resources: BuildingPartDraft | undefined;
  let native: Awaited<ReturnType<typeof renderBuilding>> | undefined;
  try {
    const design = designBuilding(draft, terrain, assets ? buildingAssets(assets).compilation : undefined);
    if (design.diagnostics.length) throw Error(design.diagnostics.map((d) => d.part + ": " + d.reason).join("\n"));
    resources = new BuildingPartDraft(parent, "Building instance units");
    const context = buildingAlgorithmContext(parent, resources);
    const result = await implementBuilding(design, { context, signal });
    signal.throwIfAborted();
    const instances = await renderInstanceParts(
      result.instanceParts,
      { parent, camera, assets, signal },
      resources,
      context
    );
    if (result.construction.owners.length) {
      if (!assets) throw Error("Profile rendering requires a building asset library");
      native = await renderBuilding(result.renderInput, {
        parent,
        camera,
        assets,
        signal,
        bounds: result.preview.bounds
      });
    }
    signal.throwIfAborted();
    const generated = resources,
      profile = native;
    let state: "prepared" | "published" | "disposed" = "prepared";
    return {
      result,
      design,
      focus: [...buildingFocusPoses(design, result.preview.parts), ...instances.focus],
      metrics: {
        profileUnits: result.groups.reduce((n, g) => n + g.cells.length, 0),
        flatUnits: instances.count,
        entityInstances: instances.entityInstances
      },
      visitPickBatches(visitor: RuntimePickVisitor) {
        instances.visitPickBatches(visitor);
        for (const draw of profile?.runtime.draws.values() ?? [])
          for (const renderer of [draw.renderer, draw.lodRenderer]) {
            if (!renderer.enabled || !renderer.entity.isActiveInHierarchy) continue;
            const ids = draw.pickIds ?? [
              draw.objectBinding?.id ??
                (draw.pickId !== undefined ? buildingPartKey(draw.pickId) : buildingGroupKey(draw.ownerId!))
            ];
            visitor({
              renderer,
              count: ids.length,
              resolve: (index) => ids[index],
              prepare: () => {
                if (draw.pickIds) renderer.shaderData.setFloat("renderer_MasonryPickObjects", 1);
              },
              restore: () => renderer.shaderData.setFloat("renderer_MasonryPickObjects", 0)
            });
          }
      },
      publish() {
        signal.throwIfAborted();
        if (state !== "prepared" || parent.destroyed) throw Error("Building candidate is no longer publishable");
        // This synchronous publication cannot expose half a candidate between frames.
        generated.publish();
        if (profile) profile.runtime.root.isActive = true;
        state = "published";
      },
      destroy() {
        if (state === "disposed") return;
        state = "disposed";
        profile?.destroy();
        generated.dispose();
      }
    };
  } catch (error) {
    native?.destroy();
    resources?.dispose();
    throw error;
  } finally {
    retainBuildingResources(draft, -1);
    if (assets) retainBuildingResource(assets, -1);
  }
}
export type PreparedBuilding = Awaited<ReturnType<typeof prepareBuilding>>;
