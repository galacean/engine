import type { PreparedTerrainUpdate } from "@galacean/engine-terrain/terrain/clipmap/TerrainPreparedUpdate";
import bridgePickShader from "./PlanningBridgePick.shader?raw";
import selectionShader from "@galacean/engine-terrain/shaders/shared/WorldSelection.glsl?raw";
import {
  SeedWorldArrayPickBatch,
  type SeedWorldPickVisitor
} from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import {
  CompareFunction,
  MeshRenderer,
  Shader,
  ShaderFactory,
  type Engine,
  type Entity,
  type Material
} from "@galacean/engine";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { RockFormationView } from "../../integrations/terrain/rock-formation/View.ts";
import type { RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";
import type { RockColorBlend } from "../../integrations/terrain/rock-formation/ColorPalette.ts";
import { SuspensionBridgeView } from "@galacean/engine-water/bridges/SuspensionBridgeView";

/** Transfer a retained bridge between scene generations until publication accepts. */
export function preparePlanningBridgeTransfer(view: Pick<SuspensionBridgeView, "root" | "reparent">, parent: Entity) {
  let previousParent: Entity | null | undefined = view.root.parent;
  let active = true;
  return {
    commit() {
      if (!active) throw new Error("Bridge publication is no longer active");
      view.reparent(parent);
    },
    rollback() {
      if (!active) return;
      active = false;
      const restore = previousParent;
      previousParent = undefined;
      if (view.root.parent !== restore) view.root.parent = restore!;
    },
    finalize() {
      active = false;
      previousParent = undefined;
    }
  };
}

/** Stable scene owner; each terrain frame stages its solid meshes before commit. */
export async function createPlanningSeedSolids(
  engine: Engine,
  parent: Entity,
  plan: IslandPlan,
  options: {
    formations?: readonly RockFormationMesh[];
    sourcePlan?: IslandPlan;
    rockTextureScale?: number;
    rockColorBlend?: RockColorBlend;
    registerGrassAppearance?: (material: import("@galacean/engine").PBRMaterial) => () => void;
    signal?: AbortSignal;
    previous?: { bridgeKey: string; bridgesView: SuspensionBridgeView };
  } = {}
) {
  const root = parent.createChild("Planned solid presentation");
  let bridgesView: SuspensionBridgeView | undefined;
  let rocks: RockFormationView | undefined;
  const bridgeKey = JSON.stringify(plan.bridges);
  try {
    if (!ShaderFactory.includeMap["shared/WorldSelection.glsl"])
      ShaderFactory.registerInclude("shared/WorldSelection.glsl", selectionShader);
    bridgesView =
      options.previous?.bridgeKey === bridgeKey
        ? options.previous.bridgesView.retain()
        : await SuspensionBridgeView.create(engine, root, plan.bridges, options.signal, options.previous?.bridgesView);
    options.signal?.throwIfAborted();
    rocks = new RockFormationView(
      engine,
      root,
      plan,
      options.formations ?? [],
      options.rockTextureScale,
      options.registerGrassAppearance,
      options.rockColorBlend
    );
  } catch (error) {
    rocks?.dispose();
    bridgesView?.dispose();
    root.destroy();
    throw error;
  }
  const ownedBridge = bridgesView;
  const pickMaterials: Material[] = [];
  const bridgeBatches = (() => {
    try {
      return plan.bridges.flatMap((bridge) => {
        const entity = ownedBridge.root.findByName(bridge.id);
        return (entity?.getComponentsIncludeChildren(MeshRenderer, []) ?? []).map((renderer) => {
          const original = renderer.getMaterial()!;
          const picking = original.clone();
          pickMaterials.push(picking);
          picking.shader = Shader.find("Planning/BridgePick") ?? Shader.create(bridgePickShader);
          picking.shaderData.setFloat("material_WorldPickDepthCompare", CompareFunction.LessEqual);
          const batch = new SeedWorldArrayPickBatch(renderer);
          batch.id = bridge.id;
          batch.count = 1;
          return Object.assign(batch, {
            prepare: () => renderer.setMaterial(picking),
            restore: () => renderer.setMaterial(original)
          });
        });
      });
    } catch (error) {
      for (const material of pickMaterials) material.destroy();
      rocks.dispose();
      ownedBridge.dispose();
      root.destroy();
      throw error;
    }
  })();
  const ownedRocks = rocks;
  let acceptedFormations = options.formations ?? [];
  let acceptedPlan = plan,
    canonicalPlan = options.sourcePlan ?? plan,
    disposed = false;
  const bridgeTransfer = preparePlanningBridgeTransfer(ownedBridge, root);
  return {
    root,
    bridgeKey,
    bridgesView: ownedBridge,
    commit: bridgeTransfer.commit,
    rollbackCommit: bridgeTransfer.rollback,
    finalizeCommit: bridgeTransfer.finalize,
    get rockGroups() {
      return ownedRocks.groups;
    },
    visitPickBatches(visitor: SeedWorldPickVisitor) {
      ownedRocks.visitPickBatches(visitor);
      for (const batch of bridgeBatches)
        if (batch.renderer.enabled && batch.renderer.entity.isActiveInHierarchy) visitor(batch);
    },
    get plan() {
      return acceptedPlan;
    },
    get sourcePlan() {
      return canonicalPlan;
    },
    get formations() {
      return acceptedFormations;
    },
    setRockTextureScale(textureScale: number) {
      ownedRocks.setTextureScale(textureScale);
    },
    setRockColorBlend(settings: RockColorBlend) {
      ownedRocks.setColorBlend(settings);
    },
    setRockGrassCoveragePreview(enabled: boolean) {
      ownedRocks.setGrassCoveragePreview(enabled);
    },
    prepareWaterPlan(next: IslandPlan): PreparedTerrainUpdate {
      const oldPlan = acceptedPlan,
        oldCanonical = canonicalPlan;
      let committed = false,
        finished = false;
      return {
        commit() {
          if (disposed || finished || committed || acceptedPlan !== oldPlan)
            throw Error("Stale solid metadata candidate");
          acceptedPlan = canonicalPlan = next;
          committed = true;
        },
        rollback() {
          if (committed) {
            acceptedPlan = oldPlan;
            canonicalPlan = oldCanonical;
            committed = false;
          }
        },
        finalize() {
          finished = true;
        },
        discard() {
          if (!finished && committed) {
            acceptedPlan = oldPlan;
            canonicalPlan = oldCanonical;
          }
          committed = false;
          finished = true;
        }
      };
    },
    prepareRocks(
      next: IslandPlan,
      presented: IslandPlan,
      formations: readonly RockFormationMesh[],
      textureScale?: number,
      colorBlend?: RockColorBlend
    ) {
      if (disposed) throw Error("Planned solids disposed");
      const frame = ownedRocks.prepareFormations(presented, formations);
      return {
        metrics: frame.metrics,
        discard: frame.discard,
        commit() {
          if (disposed) throw Error("Planned solids disposed");
          frame.commit();
          if (textureScale !== undefined) ownedRocks.setTextureScale(textureScale);
          if (colorBlend) ownedRocks.setColorBlend(colorBlend);
          acceptedPlan = presented;
          canonicalPlan = next;
          acceptedFormations = formations;
        }
      };
    },
    prepare(next: IslandPlan) {
      if (disposed) throw Error("Planned solids disposed");
      const rockFrame = ownedRocks.prepare(next);
      let consumed = false;
      return {
        commit() {
          if (consumed || disposed) throw Error("Stale planned solid frame");
          consumed = true;
          acceptedPlan = next;
          rockFrame.commit();
        },
        discard() {
          consumed = true;
        }
      };
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        for (const material of pickMaterials) material.destroy();
        ownedRocks.dispose();
        ownedBridge.dispose();
        root.destroy();
      }
    }
  };
}
