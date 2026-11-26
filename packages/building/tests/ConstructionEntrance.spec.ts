import { describe, expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { Entity, Scene, type Engine } from "@galacean/engine";
import {
  CONSTRUCTION_EXIT_SECONDS,
  CONSTRUCTION_UPDATE_SECONDS,
  ConstructionEntrance
} from "../src/building/runtime/ConstructionEntrance";
import { injectConstructionEntrance } from "../src/building/runtime/ConstructionEntranceShader";
import { BuildingManager } from "../src/building/parts/architecture/BuildingManager";
import { BuildingGroupComponent } from "../src/building/parts/architecture/BuildingGroupComponent";
import { BuildingPartComponent } from "../src/building/parts/architecture/BuildingPartComponent";

describe("ConstructionEntrance CRUD transitions", () => {
  it("advances update sweep progress from 2 to 3 and settles back to 1 without interrupting an active entrance", () => {
    const entrance = new ConstructionEntrance();
    entrance.define("house-a", 0, 5);
    expect(entrance.active).toBe(false);

    entrance.sweep("house-a", 0, 5, true);
    expect(entrance.active).toBe(true);
    expect(entrance.states.get("house-a")?.progress).toBe(2);

    // First frame skips newlyAccepted delta (same contract as accept).
    expect(entrance.advance(0.1)).toBe(false);
    expect(entrance.states.get("house-a")?.progress).toBe(2);

    // Halfway through update sweep.
    expect(entrance.advance(CONSTRUCTION_UPDATE_SECONDS * 0.5)).toBe(true);
    expect(entrance.states.get("house-a")?.progress).toBeCloseTo(2.5, 4);

    // Completion settles back to 1.
    expect(entrance.advance(CONSTRUCTION_UPDATE_SECONDS)).toBe(true);
    expect(entrance.states.get("house-a")?.progress).toBe(1);
    expect(entrance.active).toBe(false);

    // Must not overwrite an in-progress create entrance (< 1).
    entrance.accept("house-b", 0, 4, true);
    expect(entrance.states.get("house-b")?.progress).toBe(0);
    entrance.sweep("house-b", 0, 4, true);
    expect(entrance.states.get("house-b")?.progress).toBe(0);
  });

  it("injects rainbow leading edge and update sweep into both continuous and discrete masonry shaders", () => {
    const baseFragment =
      "void original_main(){}\nvoid main(){original_main();vec3 v=vec3(1.0);residentColor=vec4(mix(12.92*v,1.055*pow(v,vec3(1.0/2.4))-.055,greaterThan(v,vec3(.0031308))),1.0);}";
    const brickVertex = "void original_main(){}\nvoid main(){original_main();}";
    const brick = injectConstructionEntrance(brickVertex, baseFragment, "brick");
    expect(brick.vertex).toContain("masonryEntranceCenter=masonryEntranceSample;");
    expect(brick.fragment).toContain("masonryEntranceRainbow(masonryEntranceCenter,masonryEntranceAmt)");

    const plasterVertex = "in vec3 plasterPosition;\nvoid original_main(){}\nvoid main(){original_main();}";
    const plaster = injectConstructionEntrance(plasterVertex, baseFragment, "plaster");
    expect(plaster.fragment).toContain("masonryEntranceRainbow(masonryEntrancePosition,masonryEntranceAmt)");
  });
});

describe("BuildingRuntime exiting view lifecycle", () => {
  const engine = {
    canvas: { width: 800, height: 600 },
    resourceManager: {
      _deleteAsset() {},
      _deleteContentRestorer() {},
      _addReferResource() {},
      _deleteReferResource() {}
    }
  } as unknown as Engine;

  function createScene(): Scene {
    return Object.assign(Object.create(Scene.prototype), {
      _engine: engine,
      _rootEntities: [],
      _isActiveInEngine: true,
      _componentsManager: {
        getActiveChangedTempList: () => [],
        putActiveChangedTempList() {},
        addOnStartScript() {},
        removeOnStartScript() {},
        addOnUpdateScript() {},
        removeOnUpdateScript() {},
        addOnLateUpdateScript() {},
        removeOnLateUpdateScript() {}
      }
    }) as Scene;
  }

  function setupPublishedBuilding() {
    const scene = createScene();
    const manager = BuildingManager.forScene(scene);
    const frame = scene.createRootEntity("BuildingFrame");
    frame.transform.setPosition(12, 3, -7);
    const groupNode = frame.createChild("g1");
    const group = groupNode.addComponent(BuildingGroupComponent);
    group.frame = frame;
    group.definition = { id: "g1", seed: 1, palette: {} } as any;
    const partNode = groupNode.createChild("p1");
    const part = partNode.addComponent(BuildingPartComponent);
    part.frame = frame;
    part.definition = { id: "p1", group: "g1", type: "wall" } as any;

    const viewRoot = frame.createChild("Building surfaces");
    const fineRoot = frame.createChild("Masonry");
    let setEntranceWhileDestroyed = 0;
    let lastProgress = 1;
    let destroyedCount = 0;
    const fakeView = {
      kind: "profile" as const,
      frame,
      signature: "sig",
      bodies: [group],
      groupIds: new Map([[group, "g1"]]),
      entranceStates: new Map([["g1", { progress: 1, minimumY: 0, height: 4 }]]),
      visible: true,
      occupancy: { withoutOwner: () => ({}) },
      worldMatrix: new Float64Array(16),
      occupancyMatrix: new Float64Array(16),
      releaseLampMaterials() {},
      diagnostics: [],
      focus: new Map(),
      cpu: { valid: true, dispose() {} },
      view: {
        root: viewRoot,
        entranceRanges: new Map([["g1", { min: 0, max: 4 }]]),
        setEntrance: (states: ReadonlyMap<string, { progress: number }>) => {
          lastProgress = states.get("g1")?.progress ?? lastProgress;
          if (viewRoot.destroyed) setEntranceWhileDestroyed++;
        },
        setOwnerVisible() {},
        destroy() {
          destroyedCount++;
          viewRoot.destroy();
        }
      },
      fine: {
        runtime: {
          root: fineRoot,
          draws: new Map(),
          setEntrance: () => {
            if (fineRoot.destroyed) setEntranceWhileDestroyed++;
          }
        },
        destroy() {
          fineRoot.destroy();
        }
      }
    };
    (manager as any).views.set(frame, fakeView);
    (manager as any).entries.push(fakeView);
    (manager as any).host = { isBody: (c: unknown) => c === group, groupIdentity: () => "g1" };
    (manager as any).entranceEnabled = true;
    (manager as any).entranceStarted = true;
    return {
      scene,
      manager,
      frame,
      group,
      viewRoot,
      fineRoot,
      get setEntranceWhileDestroyed() {
        return setEntranceWhileDestroyed;
      },
      get lastProgress() {
        return lastProgress;
      },
      get destroyedCount() {
        return destroyedCount;
      }
    };
  }

  it("detaches generated roots onto a runtime anchor when frame.destroy() runs so exit dissolve completes and cleans up", () => {
    const ctx = setupPublishedBuilding();
    ctx.frame.destroy();

    // Author frame is gone, but generated roots survived reparented under BuildingManager anchor.
    expect(ctx.frame.destroyed).toBe(true);
    expect(ctx.viewRoot.destroyed).toBe(false);
    expect(ctx.viewRoot.isActiveInHierarchy).toBe(true);
    expect(ctx.fineRoot.destroyed).toBe(false);
    const anchor = ctx.viewRoot.parent!;
    expect(anchor.parent).toBe(ctx.manager.entity);
    expect(anchor.transform.worldPosition.x).toBeCloseTo(12, 4);
    expect(anchor.transform.worldPosition.y).toBeCloseTo(3, 4);
    expect(anchor.transform.worldPosition.z).toBeCloseTo(-7, 4);

    // Halfway through exit animation: still alive, no destroyed mutation.
    (ctx.manager as any).advanceExitingViews(CONSTRUCTION_EXIT_SECONDS * 0.5);
    expect(ctx.setEntranceWhileDestroyed).toBe(0);
    expect(ctx.lastProgress).toBeCloseTo(0.5, 4);
    expect(ctx.destroyedCount).toBe(0);

    // Visibility toggle hides exiting views immediately.
    ctx.manager.visible = false;
    expect(anchor.isActive).toBe(false);
    expect(ctx.viewRoot.isActive).toBe(false);
    expect(ctx.fineRoot.isActive).toBe(false);

    // Completion destroys both view and detached anchor.
    (ctx.manager as any).advanceExitingViews(CONSTRUCTION_EXIT_SECONDS);
    expect((ctx.manager as any).exitingViews).toHaveLength(0);
    expect(ctx.destroyedCount).toBe(1);
    expect(ctx.viewRoot.destroyed).toBe(true);
    expect(ctx.fineRoot.destroyed).toBe(true);
    expect(anchor.destroyed).toBe(true);
  });

  it("preserves exit animation on BuildingManager.remove(frame) and skips exit when frame is merely deactivated", () => {
    const removed = setupPublishedBuilding();
    removed.manager.remove(removed.frame);
    expect(removed.frame.destroyed).toBe(true);
    expect(removed.viewRoot.destroyed).toBe(false);
    expect(removed.viewRoot.isActiveInHierarchy).toBe(true);
    expect((removed.manager as any).exitingViews).toHaveLength(1);
    (removed.manager as any).advanceExitingViews(CONSTRUCTION_EXIT_SECONDS + 0.05);
    expect(removed.viewRoot.destroyed).toBe(true);
    expect((removed.manager as any).exitingViews).toHaveLength(0);

    // Deactivating the frame (hiding, not deleting) must destroy immediately without queueing exitingViews.
    const hidden = setupPublishedBuilding();
    hidden.frame.isActive = false;
    expect((hidden.manager as any).exitingViews).toHaveLength(0);
    expect(hidden.destroyedCount).toBe(1);
  });
});
