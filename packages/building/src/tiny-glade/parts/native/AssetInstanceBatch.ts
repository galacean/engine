import { BufferMesh, MeshRenderer, type PrefabResource } from "@galacean/engine";
import { BuildingUnitComponent, buildingAssets } from "../../resources/BuildingAssetKit";
import { ConstructionPackageBuilder } from "../../runtime/ConstructionPackage";
import { EngineResidentScene } from "../../runtime/EngineResidentScene";
import { packUnits } from "../../runtime/UnitPacking.js";
import type { BuildingPoint } from "../BuildingLayout";
import type { BuildingPlacementBatch } from "../BuildingAlgorithms";

/** Render protocol only: explicit placement results -> native asset buffers.
 * No building document, shape producer, contact solver, layout compiler or Worker. */
export interface AssetCell {
  id: string;
  center: BuildingPoint;
  tangent: BuildingPoint;
  bitangent: BuildingPoint;
  normal: BuildingPoint;
  size: BuildingPoint;
  brick_deformation?: number[];
  brick_seed?: number;
}
export interface AssetBatchParameters {
  assets: PrefabResource;
  material: "brick" | "roof_tile";
  seed?: number;
}
export function assetInstanceBatch(cells: AssetCell[], p: AssetBatchParameters): BuildingPlacementBatch {
  return {
    kind: "batch",
    async build(unit, context) {
      context.signal.throwIfAborted();
      if (cells.length > context.limit) throw Error("Instance budget exceeded");
      const camera = context.camera;
      if (!camera || camera.destroyed || camera.entity.scene !== context.scene)
        throw Error("Set BuildingManager.camera before building native units");
      const metadata = unit.getComponent(BuildingUnitComponent),
        renderer = unit.getComponent(MeshRenderer);
      if (!metadata || !(renderer?.mesh instanceof BufferMesh) || !renderer.getMaterial())
        throw Error("Native Unit requires mesh, material and instance metadata");
      const family = p.material === "roof_tile" ? "roof" : "brick";
      if (metadata.family !== family || metadata.instanceStride !== 64)
        throw Error("Unit does not implement selected material ABI");
      const library = buildingAssets(p.assets);
      const assets = {
        ...library,
        units: {
          selected: {
            mesh: renderer.mesh,
            material: renderer.getMaterial(),
            lodMesh: metadata.lodMesh,
            sdfMaterial: metadata.sdfMaterial,
            family: metadata.family,
            instanceStride: metadata.instanceStride,
            directInstances: metadata.directInstances,
            bindings: metadata.bindings,
            attributeLocations: metadata.attributeLocations,
            integerAttributes: metadata.integerAttributes,
            textureSlots: metadata.textureSlots,
            doubleSided: metadata.doubleSided
          }
        }
      };
      const uint = (n: number) => new Uint8Array(new Uint32Array([n]).buffer);
      const builder = new ConstructionPackageBuilder(assets, {
        view: new Uint8Array(1024),
        frame: new Uint8Array(library.frame),
        frameCounter: new Uint8Array(16),
        identities: uint(p.seed ?? 17),
        roofColors: uint(0),
        wallColors: uint(0),
        stoneFoundation: uint(3),
        roofCounts: uint(0),
        roofHoles: new Uint8Array(48)
      });
      const packed = await packUnits({ cells, slot: 0 });
      context.signal.throwIfAborted();
      builder.addDraw({ id: "units", template: "selected", instances: packed[p.material] });
      const built = builder.build();
      built.package.whiteBase = true;
      const min = [Infinity, Infinity, Infinity],
        max = [-Infinity, -Infinity, -Infinity];
      for (const c of cells)
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], c.center[i] - Math.max(...c.size));
          max[i] = Math.max(max[i], c.center[i] + Math.max(...c.size));
        }
      const runtime = new EngineResidentScene(
        context.parent.engine,
        context.parent,
        built.asset,
        cells.length ? { min, max } : undefined
      );
      context.own(runtime);
      await runtime.load(built.package);
      context.signal.throwIfAborted();
      runtime.bindCamera(camera);
      runtime.setLodStates([{ lodIndex: 0, signedFade: 1 }]);
      return { count: cells.length, draws: runtime.draws.size, details: { cells, runtime } };
    }
  };
}
