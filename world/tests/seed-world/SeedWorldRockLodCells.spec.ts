import { describe, expect, it, vi } from "vitest";
import { BoundingBox, Matrix, MeshRenderer, Quaternion, ShaderProperty, Vector3, type Camera, type ModelMesh } from "@galacean/engine";
import type { RockVariantAsset } from "@galacean/engine-terrain/rock-formation/types";
import type { SeedWorldTerrainOcclusionReadPort } from "@galacean/engine-world-planning/runtime/SeedWorldTerrainOcclusionCuller";

const mockedMeshes = vi.hoisted(() => new WeakMap<RockVariantAsset, readonly [ModelMesh | undefined, ModelMesh | undefined]>());

vi.mock("@galacean/engine-world-planning/integrations/terrain/rock-formation/RockLodMeshes", () => ({
  rockLodMeshes: (asset: RockVariantAsset) => mockedMeshes.get(asset)
}));

import { RockLodView } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/RockLodView";

const lodFadeProperty = ShaderProperty.getByName("renderer_LodFade");

function makeMesh(label: string): ModelMesh & { label: string; refCount: number } {
  const mesh = {
    label,
    refCount: 0,
    destroyed: false,
    _addReferCount(delta: number) {
      this.refCount += delta;
    }
  };
  return mesh as unknown as ModelMesh & { label: string; refCount: number };
}

function makeShaderData() {
  const macros = new Set<string>();
  const floats = new Map<unknown, number>();
  return {
    macros,
    floats,
    enableMacro(name: string) {
      macros.add(name);
    },
    setFloat(prop: unknown, value: number) {
      floats.set(prop, value);
    },
    getFloat(prop: unknown) {
      return floats.get(prop);
    }
  };
}

interface FakeRockEntity {
  position: Vector3;
  scale: Vector3;
  worldMatrix: Matrix;
  transform: {
    worldMatrix: Matrix;
    lossyWorldScale: Vector3;
  };
  alternates: FakeRenderer[];
  addComponent(ctor: unknown): FakeRenderer;
}

interface FakeRenderer {
  entity: FakeRockEntity;
  mesh: ModelMesh | null;
  material: unknown;
  castShadows: boolean;
  receiveShadows: boolean;
  enabled: boolean;
  destroyed: boolean;
  shaderData: ReturnType<typeof makeShaderData>;
  getMaterial(): unknown;
  setMaterial(mat: unknown): void;
  destroy(): void;
}

function makeRockRenderer(x: number, y: number, z: number, scale = 1): FakeRenderer {
  const position = new Vector3(x, y, z);
  const scaleVec = new Vector3(scale, scale, scale);
  const rotation = new Quaternion();
  const worldMatrix = new Matrix();
  const updateMatrix = () => {
    Matrix.affineTransformation(scaleVec, rotation, position, worldMatrix);
    return worldMatrix;
  };
  updateMatrix();
  const makeRenderer = (entity: FakeRockEntity): FakeRenderer => {
    const renderer: FakeRenderer = {
      entity,
      mesh: null,
      material: { id: "rock-mat" },
      castShadows: true,
      receiveShadows: true,
      enabled: true,
      destroyed: false,
      shaderData: makeShaderData(),
      getMaterial() {
        return this.material;
      },
      setMaterial(mat: unknown) {
        this.material = mat;
      },
      destroy() {
        this.destroyed = true;
      }
    };
    return renderer;
  };
  const entity: FakeRockEntity = {
    position,
    scale: scaleVec,
    worldMatrix,
    transform: {
      get worldMatrix() {
        return updateMatrix();
      },
      get lossyWorldScale() {
        return scaleVec;
      }
    },
    alternates: [],
    addComponent(ctor: unknown) {
      if (ctor !== MeshRenderer) throw new Error("Unexpected component type");
      const alt = makeRenderer(entity);
      entity.alternates.push(alt);
      return alt;
    }
  };
  return makeRenderer(entity);
}

function makeCamera(eye: [number, number, number], target: [number, number, number], fov = 60) {
  const worldPosition = new Vector3(...eye);
  const viewMatrix = new Matrix();
  const projectionMatrix = new Matrix();
  const up = new Vector3(0, 1, 0);
  const targetVec = new Vector3(...target);
  const refresh = () => {
    Matrix.lookAt(worldPosition, targetVec, up, viewMatrix);
    Matrix.perspective((fov * Math.PI) / 180, 16 / 9, 0.5, 2000, projectionMatrix);
  };
  refresh();
  const camera = {
    isOrthographic: false,
    orthographicSize: 10,
    fieldOfView: fov,
    viewMatrix,
    projectionMatrix,
    entity: { transform: { worldPosition } },
    moveTo(nextEye: [number, number, number], nextTarget: [number, number, number]) {
      worldPosition.set(...nextEye);
      targetVec.set(...nextTarget);
      refresh();
    }
  };
  return camera;
}

function createRockLodView(camera: ReturnType<typeof makeCamera>, terrainOcclusion?: SeedWorldTerrainOcclusionReadPort) {
  const time = { elapsedTime: 0 };
  const view = Object.create(RockLodView.prototype) as RockLodView;
  Object.assign(view, {
    camera: camera as unknown as Camera,
    terrainOcclusion,
    entries: new Map(),
    scratch: {
      slots: [
        { lodIndex: 0, signedFade: 1, crossFading: true },
        { lodIndex: 0, signedFade: 1, crossFading: true }
      ],
      singleRendererSet: [{ lodIndex: 0, signedFade: 1, crossFading: true }],
      rendererSets: [
        { lodIndex: 0, signedFade: 1, crossFading: true },
        { lodIndex: 0, signedFade: 1, crossFading: true }
      ]
    },
    visibleObservation: { timeSeconds: 0, visible: true as const, screenRelativeHeight: 0 },
    hiddenObservation: { timeSeconds: 0, visible: false as const },
    nextEntryId: 0,
    membershipDirty: false,
    boundsDirty: false,
    cameraOrthographic: false,
    cameraEyeX: 0,
    cameraEyeY: 0,
    cameraEyeZ: 0,
    cameraInvProjectionHeight: 1
  });
  // Keep scratch slots linked identically to createTerrainLodRendererSetScratch()
  const [first, second] = (view as unknown as { scratch: { slots: [unknown, unknown]; singleRendererSet: [unknown]; rendererSets: [unknown, unknown] } }).scratch.slots;
  (view as unknown as { scratch: { singleRendererSet: [unknown]; rendererSets: [unknown, unknown] } }).scratch.singleRendererSet = [first];
  (view as unknown as { scratch: { singleRendererSet: [unknown]; rendererSets: [unknown, unknown] } }).scratch.rendererSets = [first, second];
  Object.defineProperty(view, "engine", { value: { time }, configurable: true });
  return {
    view,
    step(elapsedSeconds: number) {
      time.elapsedTime = elapsedSeconds;
      view.onUpdate();
    }
  };
}

describe("RockLodView Cell-grid LOD scheduling", () => {
  const asset = { id: "boulder-a", bounds: [[-2, -2, -2], [2, 2, 2]] } as unknown as RockVariantAsset;
  const lod0 = makeMesh("lod0");
  const lod1 = makeMesh("lod1");
  const lod2 = makeMesh("lod2");
  mockedMeshes.set(asset, [lod1, lod2]);

  it("partitions rocks into 64m XZ cells and only evaluates frustum-visible cells during camera motion", () => {
    // Camera at origin looking toward -Z
    const camera = makeCamera([0, 2, 0], [0, 2, -100]);
    const { view, step } = createRockLodView(camera);

    const nearFront = makeRockRenderer(0, 2, -10); // very close -> LOD0
    const farFront = makeRockRenderer(0, 2, -150); // far -> LOD2
    const behind1 = makeRockRenderer(0, 2, 120); // behind camera -> culled cell
    const behind2 = makeRockRenderer(200, 2, 200); // far behind/right -> culled cell
    for (const r of [nearFront, farFront, behind1, behind2]) {
      r.mesh = lod0;
      view.add(r as unknown as MeshRenderer, lod0, asset);
    }

    step(0);
    const first = view.getSnapshot()!;
    expect(first.mode).toBe("cell");
    expect(first.cellSizeMetres).toBe(64);
    expect(first.totalInstanceCount).toBe(4);
    expect(first.occupiedCellCount).toBe(4);
    expect(first.visibleCellCount).toBe(2);
    expect(first.candidateInstanceCount).toBe(2);
    expect(first.instanceUpdateCount).toBe(2);
    expect(nearFront.mesh).toBe(lod0);
    expect(farFront.mesh).toBe(lod2);
    // Offscreen rocks were NOT touched and remain enabled for offscreen shadows
    expect(behind1.enabled).toBe(true);
    expect(behind2.enabled).toBe(true);

    // Static camera reuses settled state with zero per-rock work
    step(0.016);
    const idle = view.getSnapshot()!;
    expect(idle.reusedStaticCamera).toBe(true);
    expect(idle.instanceUpdateCount).toBe(0);

    // Moving camera forward still only evaluates the 2 visible cells (never the 2 behind)
    camera.moveTo([0, 2, -2], [0, 2, -102]);
    step(0.032);
    const moved = view.getSnapshot()!;
    expect(moved.reusedStaticCamera).toBe(false);
    expect(moved.visibleCellCount).toBe(2);
    expect(moved.instanceUpdateCount).toBe(2);
  });

  it("settles active cross-fades cleanly when a cell leaves the frustum while preserving primary renderer enabled", () => {
    // Rock at (0, 2, -10) with localSize = 4, fov = 60 -> 2 * tan(30deg) = 1.1547
    // At distance 10: screenHeight = 4 / 11.547 = 0.346 (> 0.22 => LOD0)
    // At distance 25: screenHeight = 4 / 28.867 = 0.138 (between 0.08 and 0.22 => LOD1)
    const camera = makeCamera([0, 2, 0], [0, 2, -100]);
    const { view, step } = createRockLodView(camera);

    const rock = makeRockRenderer(0, 2, -10);
    rock.mesh = lod0;
    view.add(rock as unknown as MeshRenderer, lod0, asset);

    step(0);
    expect(rock.mesh).toBe(lod0);
    expect(view.fadingRenderer(rock as unknown as MeshRenderer)).toBeUndefined();

    // Move camera back to trigger LOD0 -> LOD1 cross-fade
    camera.moveTo([0, 2, 15], [0, 2, -100]);
    step(0.05);
    const fadingAlt = view.fadingRenderer(rock as unknown as MeshRenderer);
    expect(fadingAlt).toBeDefined();
    expect(fadingAlt!.enabled).toBe(true);
    expect(rock.mesh).toBe(lod0);
    expect(fadingAlt!.mesh).toBe(lod1);

    // Turn camera 180 degrees away mid-fade: cell leaves frustum -> retires cleanly once
    camera.moveTo([0, 2, 15], [0, 2, 200]);
    step(0.1);
    expect(view.fadingRenderer(rock as unknown as MeshRenderer)).toBeUndefined();
    expect(fadingAlt!.enabled).toBe(false);
    expect(rock.enabled).toBe(true);
    expect(rock.shaderData.getFloat(lodFadeProperty)).toBe(1);
    expect(view.getSnapshot()!.candidateInstanceCount).toBe(0);

    // Subsequent movement while rock stays offscreen does zero updates
    camera.moveTo([0, 2, 16], [0, 2, 200]);
    step(0.2);
    expect(view.getSnapshot()!.instanceUpdateCount).toBe(0);

    // Turning back after cross-fade duration settles directly on LOD1
    camera.moveTo([0, 2, 15], [0, 2, -100]);
    step(2.0);
    expect(rock.mesh).toBe(lod1);
    expect(view.fadingRenderer(rock as unknown as MeshRenderer)).toBeUndefined();
    expect(fadingAlt!.enabled).toBe(false);
  });

  it("refreshes cached world bounds and cell bucketing on invalidate() and respects terrainOcclusion with rock-formation keys", () => {
    const camera = makeCamera([0, 2, 0], [0, 2, -100]);
    const queriedKeys: string[] = [];
    let occluded = false;
    let visibilityRevision = 1;
    const terrainOcclusion: SeedWorldTerrainOcclusionReadPort = {
      horizonReady: true,
      horizonBuildPending: false,
      horizonQueryableThisFrame: true,
      revision: 1,
      get visibilityRevision() {
        return visibilityRevision;
      },
      isBoundsOccluded(candidateId: string, _bounds: BoundingBox) {
        queriedKeys.push(candidateId);
        return occluded;
      }
    };

    const { view, step } = createRockLodView(camera, terrainOcclusion);
    const rock = makeRockRenderer(0, 2, 120); // starts behind camera
    rock.mesh = lod0;
    view.add(rock as unknown as MeshRenderer, lod0, asset);

    step(0);
    expect(view.getSnapshot()!.visibleCellCount).toBe(0);

    // Move rock in front of camera at far distance and invalidate()
    rock.entity.position.set(0, 2, -150);
    view.invalidate();
    step(0.1);
    expect(view.getSnapshot()!.visibleCellCount).toBe(1);
    expect(rock.mesh).toBe(lod2);
    expect(queriedKeys.some((key) => key.startsWith("rock-formation:"))).toBe(true);

    // Terrain occlusion hides the cell -> retired cleanly, primary renderer still enabled
    occluded = true;
    visibilityRevision++;
    step(0.2);
    expect(view.getSnapshot()!.terrainOccludedCellCount).toBe(1);
    expect(view.getSnapshot()!.candidateInstanceCount).toBe(0);
    expect(rock.enabled).toBe(true);
  });
});
