import type { Camera, Entity, PrefabResource } from "@galacean/engine";
import { buildingAssets, retainBuildingResource } from "../../resources/BuildingAssetKit";
import { EngineResidentScene } from "../../runtime/EngineResidentScene";
import { buildBuildingRenderPackage, type BuildingRenderInput } from "../../runtime/BuildingRenderPackage";
import { buildingGlobals } from "../../runtime/BuildingGlobals";
import type { ConstructionTerrainGrid } from "../../runtime/TerrainField";

/** Rendering is shared with dev/2.0: same assets, shaders, clip ABI and tile feedback. */
export async function renderBuilding(
  input: BuildingRenderInput,
  options: {
    parent: Entity;
    camera: Camera;
    assets: PrefabResource;
    signal: AbortSignal;
    bounds?: { min: number[]; max: number[] };
    terrainGrid?: ConstructionTerrainGrid;
    rigidDecorations?: { poses: ReadonlyMap<string, readonly number[]>; resolve(id: string): Entity | undefined };
    releasePackageAfterApply?: boolean;
    /** Optional frame-pacing hook invoked between CPU package build and GPU upload during interactive roaming. */
    yieldFrame?: () => Promise<void>;
  }
) {
  const { parent, camera, assets, signal } = options;
  signal.throwIfAborted();
  retainBuildingResource(assets, 1);
  let runtime: EngineResidentScene | undefined;
  const slim = Boolean(options.releasePackageAfterApply);
  try {
    const library = buildingAssets(assets);
    const built = buildBuildingRenderPackage(
      input,
      library,
      buildingGlobals(input.paletteSlots, library.frame),
      options.rigidDecorations?.poses,
      library.compilation.stoneGeometry,
      slim ? { skipDocumentClone: true } : undefined
    );
    if (options.yieldFrame) {
      await options.yieldFrame();
      signal.throwIfAborted();
    }
    runtime = new EngineResidentScene(parent.engine, parent, built.asset, options.bounds, options.terrainGrid);
    runtime.root.isActive = false;
    await runtime.load(built.package);
    if (options.rigidDecorations) runtime.bindRigidDecorations(options.rigidDecorations.resolve);
    signal.throwIfAborted();
    runtime.applyDocument(input.placementDocument);
    if (slim) runtime.releasePackageData();
    runtime.bindCamera(camera);
    return { runtime, package: slim ? undefined : built.package, destroy: () => runtime!.destroy() };
  } catch (error) {
    runtime?.destroy();
    throw error;
  } finally {
    retainBuildingResource(assets, -1);
  }
}
