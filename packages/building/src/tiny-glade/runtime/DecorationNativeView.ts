import { buildingPartKey } from "./BuildingObjectIdentity";
import { decorationStoneBounds } from "./DecorationStoneBounds";
import { decorationFrameBounds } from "./ConstructionDecorationFrames";
import type { RetainedWallUnits } from "./ConstructionWallLod";
import { packConstructionUnits, constructionSurfaceUnitDraw } from "./ConstructionUnitRender";
import { concatenateRecords } from "./ConstructionRecords";
import { appendDecorationRenderPackage } from "./ConstructionDecorationRender";
import type { ConstructionDecorationPart } from "./ConstructionDecorations";
import {
  addWoodArchPillarDraws,
  appendWoodArchRenderPackage,
  type ConstructionWoodArchPart,
  type ConstructionWoodArchPillar
} from "./ConstructionWoodArchRender";
import type { ConstructionDecorationFrame } from "./ConstructionDecorationFrames";
import { packDecorationStoneFrameInstances } from "./DecorationStoneFrameInstance";
import type { Camera, Engine, Entity, MeshRenderer } from "@galacean/engine";
import type { ConstructionDecorationStone } from "./ConstructionDecorations";
import type { ConstructionEntranceState } from "./ConstructionEntrance";
import { buildingGlobals, type BuildingPaletteSlot } from "./BuildingGlobals";
import { ConstructionPackageBuilder } from "./ConstructionPackage";
import { buildingAssets } from "../resources/BuildingAssetKit";
import type { PrefabResource } from "@galacean/engine";
import { packDecorationStoneInstances } from "./DecorationStoneInstance";
import { EngineResidentScene } from "./EngineResidentScene";

/** The coarse house retains original decorations and appearance-significant wall volumes.
 * Sharing their native shader avoids a second, incompatible warp/noise/material
 * approximation. SHA-owned mesh buffers and palette textures remain shared. */
export function createDecorationNativeView(
  engine: Engine,
  parent: Entity,
  stones: readonly ConstructionDecorationStone[],
  paletteSlots: readonly BuildingPaletteSlot[],
  options: {
    assets: PrefabResource;
    retainedWallUnits?: readonly RetainedWallUnits[];
    parts?: readonly ConstructionDecorationPart[];
    frames?: readonly ConstructionDecorationFrame[];
    woodArchFrames?: readonly ConstructionWoodArchPart[];
    woodArchPillars?: readonly ConstructionWoodArchPillar[];
    camera?: Camera;
    bounds?: { min: number[]; max: number[] };
    rigidDecorations?: { poses: ReadonlyMap<string, readonly number[]>; resolve(id: string): Entity | undefined };
  }
) {
  const frames = options.frames ?? [];
  const hiddenOwners = new Set<string>();
  let scene: EngineResidentScene | undefined;
  let destroyed = false,
    loading = false,
    fade = 1;
  let entrance: ReadonlyMap<string, ConstructionEntranceState> = new Map();
  const ready = (async () => {
    if (
      !options.retainedWallUnits?.length &&
      !options.parts?.length &&
      !stones.length &&
      !frames.length &&
      !options.woodArchFrames?.length &&
      !options.woodArchPillars?.length
    )
      return;
    const base = buildingAssets(options.assets);
    if (destroyed) return;
    const frame = base.frame;
    if (destroyed) return;
    const globals = buildingGlobals(paletteSlots, frame);
    const builder = new ConstructionPackageBuilder(base, globals);
    for (const [index, retained] of (options.retainedWallUnits ?? []).entries()) {
      const instances =
        retained.sourceDraw?.instances ??
        (retained.brickRecords
          ? concatenateRecords(retained.brickRecords)
          : (await packConstructionUnits({ cells: retained.cells, slot: retained.slot, role: "wall" }))[
              retained.material
            ]);
      if (destroyed) return;
      const draw = builder.addDraw({
        id: "coarse-wall-volume/" + index,
        ownerId: retained.ownerId,
        ...constructionSurfaceUnitDraw(retained.material, instances, retained),
        wallRoofJoint: retained.wallRoofJoint
      });
      draw.pickId = retained.pickId;
    }
    const batches = new Map<string, ConstructionDecorationStone[]>();
    for (const stone of stones) {
      const key = JSON.stringify([
        stone.ownerId,
        stone.template,
        stone.geometryScale,
        options.rigidDecorations ? stone.id : undefined
      ]);
      const batch = batches.get(key);
      if (batch) batch.push(stone);
      else batches.set(key, [stone]);
    }
    for (const [id, batch] of batches) {
      const draw = builder.addDraw({
        id: "coarse-stone/" + id,
        ownerId: batch[0].ownerId,
        template: batch[0].template,
        instances: packDecorationStoneInstances(batch.map((stone) => stone.instance)),
        geometryScale: batch[0].geometryScale
      });
      if (options.rigidDecorations) {
        const stone = batch[0],
          inverseBind = options.rigidDecorations.poses.get(buildingPartKey(stone.decorationId));
        if (!inverseBind) throw Error("Missing stone decoration binding " + stone.decorationId);
        draw.objectBinding = {
          id: buildingPartKey(stone.decorationId),
          inverseBind: [...inverseBind],
          ...decorationStoneBounds(buildingAssets(options.assets).compilation.stoneGeometry, stone)
        };
      }
    }
    const frameBatches = new Map<string, ConstructionDecorationFrame[]>();
    for (const frame of frames) {
      const key = JSON.stringify([frame.ownerId, frame.template, options.rigidDecorations ? frame.id : undefined]);
      const batch = frameBatches.get(key);
      if (batch) batch.push(frame);
      else frameBatches.set(key, [frame]);
    }
    for (const [id, batch] of frameBatches) {
      const draw = builder.addDraw({
        id: "coarse-frame/" + id,
        ownerId: batch[0].ownerId,
        template: batch[0].template,
        instances: packDecorationStoneFrameInstances(batch.map((frame) => frame.instance))
      });
      if (options.rigidDecorations) {
        const frame = batch[0],
          inverseBind = options.rigidDecorations.poses.get(buildingPartKey(frame.decorationId));
        if (!inverseBind) throw Error("Missing frame decoration binding " + frame.decorationId);
        draw.objectBinding = {
          id: buildingPartKey(frame.decorationId),
          inverseBind: [...inverseBind],
          ...decorationFrameBounds(buildingAssets(options.assets).compilation.stoneGeometry, frame)
        };
      }
    }
    addWoodArchPillarDraws(builder, options.woodArchPillars ?? [], globals);
    const basePackage = builder.build();
    basePackage.package.whiteBase = true;
    const built = appendDecorationRenderPackage(
      appendWoodArchRenderPackage(basePackage, options.woodArchFrames ?? [], globals),
      options.parts ?? [],
      options.rigidDecorations?.poses
    );
    scene = new EngineResidentScene(engine, parent, built.asset, options.bounds);
    scene.root.isActive = false;
    loading = true;
    try {
      await scene.load(built.package);
      if (destroyed) return;
      if (options.rigidDecorations) scene.bindRigidDecorations(options.rigidDecorations.resolve);
      if (options.camera) scene.bindCamera(options.camera);
      scene.setLodStates([{ lodIndex: 0, signedFade: fade }]);
      scene.setEntrance(entrance);
      for (const draw of scene.draws.values())
        if (draw.ownerId && hiddenOwners.has(draw.ownerId))
          draw.renderer.entity.isActive = draw.lodRenderer.entity.isActive = false;
      scene.root.isActive = true;
    } catch (error) {
      scene.destroy();
      if (!destroyed) throw error;
    } finally {
      loading = false;
      // A pending load may still allocate resources after an await. Let it settle
      // before disposing, rather than destroying and then resurrecting GPU state.
      if (destroyed) scene.destroy();
    }
  })();
  return {
    ready,
    setOwnerVisible(owner: string, visible: boolean) {
      if (visible) hiddenOwners.delete(owner);
      else hiddenOwners.add(owner);
      if (scene)
        for (const draw of scene.draws.values())
          if (draw.ownerId === owner) draw.renderer.entity.isActive = draw.lodRenderer.entity.isActive = visible;
    },
    setFade(value: number) {
      fade = value;
      if (!destroyed && !loading) scene?.setLodStates([{ lodIndex: 0, signedFade: fade }]);
    },
    setEntrance(states: ReadonlyMap<string, ConstructionEntranceState>) {
      entrance = new Map([...states].map(([id, state]) => [id, { ...state }]));
      if (!destroyed && !loading) scene?.setEntrance(entrance);
    },
    visitRenderers(
      visitor: (
        renderer: MeshRenderer,
        ownerId: string,
        draw: { pickIds?: readonly string[]; pickId?: string; objectBinding?: { id: string } }
      ) => void
    ) {
      // Register owned representations, not current visibility. Before the first
      // camera dispatch both LOD renderers may be disabled; either can become
      // visible later without another publication. Picking filters enabled state.
      if (destroyed || loading || !scene) return;
      for (const draw of scene.draws.values()) {
        if (draw.ownerId === undefined) continue;
        visitor(draw.renderer, draw.ownerId, draw);
        visitor(draw.lodRenderer, draw.ownerId, draw);
      }
    },
    get triangles() {
      return scene?.metrics.fullTriangles ?? 0;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (scene) scene.root.isActive = false;
      if (!loading) scene?.destroy();
    }
  };
}
