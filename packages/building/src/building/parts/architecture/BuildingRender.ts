import type { Camera, Entity, PrefabResource } from "@galacean/engine";
import { buildingAssets, retainBuildingResource } from "../../resources/BuildingAssetKit";
import { EngineResidentScene } from "../../runtime/EngineResidentScene";
import { buildBuildingRenderPackage, type BuildingRenderInput } from "../../runtime/BuildingRenderPackage";
import { buildingGlobals } from "../../runtime/BuildingGlobals";

/** Rendering is shared with dev/2.0: same assets, shaders, clip ABI and tile feedback. */
export async function renderBuilding(
  input: BuildingRenderInput,
  options: {
    parent: Entity;
    camera: Camera;
    assets: PrefabResource;
    signal: AbortSignal;
    bounds?: { min: number[]; max: number[] };
    rigidDecorations?: { poses: ReadonlyMap<string, readonly number[]>; resolve(id: string): Entity | undefined };
  }
) {
  const { parent, camera, assets, signal } = options;
  signal.throwIfAborted();
  retainBuildingResource(assets, 1);
  let runtime: EngineResidentScene | undefined;
  try {
    const library = buildingAssets(assets);
    const built = buildBuildingRenderPackage(
      input,
      library,
      buildingGlobals(input.paletteSlots, library.frame),
      options.rigidDecorations?.poses,
      library.compilation.stoneGeometry
    );
    runtime = new EngineResidentScene(parent.engine, parent, built.asset, options.bounds);
    runtime.root.isActive = false;
    await runtime.load(built.package);
    if (options.rigidDecorations) runtime.bindRigidDecorations(options.rigidDecorations.resolve);
    signal.throwIfAborted();
    runtime.applyDocument(input.placementDocument);
    runtime.bindCamera(camera);
    return { runtime, package: built.package, destroy: () => runtime!.destroy() };
  } catch (error) {
    runtime?.destroy();
    throw error;
  } finally {
    retainBuildingResource(assets, -1);
  }
}
