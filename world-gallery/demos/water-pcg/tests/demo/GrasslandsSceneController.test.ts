import type { Engine } from "@galacean/engine-core";
import { Entity } from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGrasslandsPcgFixture } from "../../demo/grasslands/GrasslandsPcgFixture";
import {
  createGrasslandsTerrainGeometry,
  GrasslandsSceneController,
  sampleGrasslandsTerrainHeight
} from "../../demo/grasslands/GrasslandsSceneController";

const engineSpies = vi.hoisted(() => ({
  meshDestroy: vi.fn(),
  materialDestroy: vi.fn(),
  rootDestroy: vi.fn(),
  meshUpload: vi.fn(),
  subMeshes: [] as [number, number][],
  materialSlots: [] as number[],
  componentKinds: [] as string[]
}));

vi.mock("@galacean/engine-core", () => {
  class FakeBoundsVector {
    readonly values = [0, 0, 0];

    set(x: number, y: number, z: number): void {
      this.values[0] = x;
      this.values[1] = y;
      this.values[2] = z;
    }
  }

  class FakeModelMesh {
    name = "";
    readonly bounds = { min: new FakeBoundsVector(), max: new FakeBoundsVector() };

    constructor(_engine?: unknown) {}

    setPositions(_positions: readonly unknown[]): void {}
    setNormals(_normals: readonly unknown[]): void {}
    setIndices(_indices: Uint16Array): void {}
    addSubMesh(start: number, count: number, _topology?: unknown): void {
      engineSpies.subMeshes.push([start, count]);
    }

    uploadData(_noLongerAccessible: boolean): void {
      engineSpies.meshUpload();
    }

    destroy(forceDestroy: boolean): void {
      engineSpies.meshDestroy(this.name, forceDestroy);
    }
  }

  class FakeBlinnPhongMaterial {
    name = "";
    baseColor: unknown;
    specularColor: unknown;
    emissiveColor: unknown;
    shininess = 0;

    constructor(_engine: unknown) {}

    destroy(forceDestroy: boolean): void {
      engineSpies.materialDestroy(this.name, forceDestroy);
    }
  }

  class FakeCamera {
    fieldOfView = 0;
    nearClipPlane = 0;
    farClipPlane = 0;

    constructor() {
      engineSpies.componentKinds.push("Camera");
    }
  }

  class FakeDirectLight {
    color: unknown;
    enabled = true;

    constructor() {
      engineSpies.componentKinds.push("DirectLight");
    }
  }

  class FakeMeshRenderer {
    mesh: unknown;

    constructor() {
      engineSpies.componentKinds.push("MeshRenderer");
    }

    setMaterial(materialOrIndex: number | unknown, _material?: unknown): void {
      engineSpies.materialSlots.push(typeof materialOrIndex === "number" ? materialOrIndex : 0);
    }
  }

  class FakeTransform {
    readonly position = [0, 0, 0];
    readonly scale = [1, 1, 1];
    readonly lookTarget = [0, 0, 0];

    setPosition(x: number, y: number, z: number): void {
      this.position[0] = x;
      this.position[1] = y;
      this.position[2] = z;
    }

    setScale(x: number, y: number, z: number): void {
      this.scale[0] = x;
      this.scale[1] = y;
      this.scale[2] = z;
    }

    lookAt(target: { readonly x: number; readonly y: number; readonly z: number }): void {
      this.lookTarget[0] = target.x;
      this.lookTarget[1] = target.y;
      this.lookTarget[2] = target.z;
    }

    get worldForward(): { readonly x: number; readonly y: number; readonly z: number } {
      const x = this.lookTarget[0] - this.position[0];
      const y = this.lookTarget[1] - this.position[1];
      const z = this.lookTarget[2] - this.position[2];
      const inverseLength = 1 / Math.hypot(x, y, z);
      return { x: x * inverseLength, y: y * inverseLength, z: z * inverseLength };
    }
  }

  class FakeEntity {
    readonly children: FakeEntity[] = [];
    readonly transform = new FakeTransform();
    isActive = true;

    constructor(
      _engine?: unknown,
      readonly name = ""
    ) {}

    createChild(name: string): FakeEntity {
      const child = new FakeEntity(undefined, name);
      this.children.push(child);
      return child;
    }

    addComponent<T>(componentType: new () => T): T {
      return new componentType();
    }

    destroy(): void {
      engineSpies.rootDestroy(this.name);
    }
  }

  return {
    BlinnPhongMaterial: FakeBlinnPhongMaterial,
    Camera: FakeCamera,
    DirectLight: FakeDirectLight,
    Engine: class FakeEngine {},
    Entity: FakeEntity,
    MeshRenderer: FakeMeshRenderer,
    MeshTopology: { Triangles: 0 },
    ModelMesh: FakeModelMesh,
    PrimitiveMesh: {
      createSphere: () => new FakeModelMesh()
    }
  };
});

function createController(): GrasslandsSceneController {
  const engine = {} as Engine;
  const parent = new Entity(engine, "test-root");
  return new GrasslandsSceneController(engine, parent, createGrasslandsPcgFixture());
}

describe("GrasslandsSceneController GS-DEMO-03/05", () => {
  beforeEach(() => {
    engineSpies.meshDestroy.mockClear();
    engineSpies.materialDestroy.mockClear();
    engineSpies.rootDestroy.mockClear();
    engineSpies.meshUpload.mockClear();
    engineSpies.subMeshes.length = 0;
    engineSpies.materialSlots.length = 0;
    engineSpies.componentKinds.length = 0;
  });

  it("builds deterministic analytic bed/bank geometry whose zero crossing defines the visible waterline", () => {
    const fixture = createGrasslandsPcgFixture();
    const first = createGrasslandsTerrainGeometry(fixture);
    const second = createGrasslandsTerrainGeometry(fixture);

    expect(first.positions).toEqual(second.positions);
    expect(first.normals).toEqual(second.normals);
    expect(first.indices).toEqual(second.indices);
    expect(first.bedIndexCount).toBe(second.bedIndexCount);
    expect(first.bankIndexCount).toBe(second.bankIndexCount);
    expect(first.positions).toHaveLength((160 + 1) * (96 + 1));
    expect(first.indices).toHaveLength(160 * 96 * 6);
    expect(first.bedIndexCount).toBeGreaterThan(0);
    expect(first.bankIndexCount).toBeGreaterThan(0);
    expect(first.bedIndexCount % 3).toBe(0);
    expect(first.bankIndexCount % 3).toBe(0);
    expect(first.bedIndexCount + first.bankIndexCount).toBe(first.indices.length);
    expect(first.bounds.minimum[0]).toBe(fixture.waterBounds.minimum[0]);
    expect(first.bounds.maximum[0]).toBe(fixture.waterBounds.maximum[0]);
    expect(first.bounds.minimum[2]).toBe(fixture.waterBounds.minimum[2]);
    expect(first.bounds.maximum[2]).toBe(fixture.waterBounds.maximum[2]);
    expect(first.bounds.minimum[1]).toBe(-1.5);
    expect(first.bounds.maximum[1]).toBeGreaterThan(0);
    expect(sampleGrasslandsTerrainHeight(fixture.terrain, 0.5, 0)).toBeLessThan(0);
    expect(sampleGrasslandsTerrainHeight(fixture.terrain, 6.5, 0)).toBe(0);
    expect(sampleGrasslandsTerrainHeight(fixture.terrain, 10, 0)).toBeGreaterThan(0);
    expect(first.positions.every((position) => position.every(Number.isFinite))).toBe(true);
    expect(first.normals.every((normal) => normal.every(Number.isFinite))).toBe(true);
  });

  it("creates split bed/bank materials, deterministic scenic rocks, anchors, and one DirectLight", () => {
    const controller = createController();
    const metrics = controller.metrics;

    expect(metrics).toMatchObject({
      finite: true,
      destroyed: false,
      entityCount: 13,
      activeEntityCount: 13,
      ownedEntityCount: 14,
      terrainEntityCount: 1,
      anchorRockCount: 3,
      activeRockCount: 3,
      scenicRockCount: 7,
      submergedScenicRockCount: 3,
      shoreScenicRockCount: 4,
      contactProbeCount: 3,
      cameraCount: 1,
      directLightCount: 1,
      rendererCount: 11,
      activeRendererCount: 11,
      meshCreateCount: 2,
      meshDestroyCount: 0,
      materialCreateCount: 3,
      materialDestroyCount: 0,
      waterSurfaceHeight: 0,
      waterExtendsUnderBanks: true,
      visibleWaterlineUsesSceneDepth: true,
      gameplayQueryRegistered: false,
      skyboxCount: 0,
      planarCameraCount: 0,
      reflectionProbeCount: 0,
      renderTargetCount: 0
    });
    expect(metrics.anchorRocks).toHaveLength(3);
    expect(metrics.anchorRocks.every(({ crossesWaterSurface }) => crossesWaterSurface)).toBe(true);
    expect(metrics.anchorRocks.every(({ bounds }) => bounds.minimum[1] < 0 && bounds.maximum[1] > 0)).toBe(true);
    expect(metrics.camera).toEqual(createGrasslandsPcgFixture().camera);
    expect(metrics.directLight).toEqual({
      state: "default",
      enabled: true,
      color: [1, 1, 1],
      intensity: 1.05,
      effectiveColor: [1.05, 1.05, 1.05],
      forward: [0.19169850264280183, -0.7869350219613372, 0.5865023062999986]
    });
    expect(engineSpies.componentKinds.filter((kind) => kind === "Camera")).toHaveLength(1);
    expect(engineSpies.componentKinds.filter((kind) => kind === "DirectLight")).toHaveLength(1);
    expect(engineSpies.componentKinds.filter((kind) => kind === "MeshRenderer")).toHaveLength(11);
    expect(engineSpies.subMeshes).toEqual([
      [0, metrics.terrainBedIndexCount],
      [metrics.terrainBedIndexCount, metrics.terrainBankIndexCount]
    ]);
    expect(engineSpies.materialSlots.slice(0, 2)).toEqual([0, 1]);
    expect(engineSpies.meshUpload).toHaveBeenCalledTimes(1);
    expect(controller.camera).toMatchObject({
      fieldOfView: 48,
      nearClipPlane: 0.05,
      farClipPlane: 100
    });
    expect(controller.directLight.color).toMatchObject({ r: 1.05, g: 1.05, b: 1.05 });
  });

  it("rotates, disables, and restores the real DirectLight with actual readback", () => {
    const controller = createController();
    const original = controller.metrics.directLight;

    controller.setDirectLightState("rotated");
    const rotated = controller.metrics.directLight;
    expect(rotated).toMatchObject({
      state: "rotated",
      enabled: true,
      effectiveColor: [1.05, 1.05, 1.05]
    });
    expect(rotated.forward).not.toEqual(original.forward);

    controller.directLight.color = new Color(0.4, 0.2, 0.1, 1);
    expect(controller.metrics.directLight).toMatchObject({
      color: [1, 0.5, 0.25],
      intensity: 0.4,
      effectiveColor: [0.4, 0.2, 0.1]
    });
    controller.directLight.color = new Color(1.05, 1.05, 1.05, 1);

    controller.setDirectLightState("disabled");
    expect(controller.metrics.directLight).toMatchObject({
      state: "disabled",
      enabled: false,
      effectiveColor: [0, 0, 0]
    });
    expect(controller.directLight.enabled).toBe(false);

    controller.setDirectLightState("default");
    expect(controller.metrics.directLight).toEqual(original);
    expect(controller.directLight.enabled).toBe(true);
    expect(() => controller.setDirectLightState("unknown" as never)).toThrow(RangeError);
  });

  it("raises, removes, and restores a contact probe with exact bounds and Scene Depth expectations", () => {
    const controller = createController();
    const id = "anchor-rock-left-foreground";

    const raised = controller.raiseContactProbe(id);
    expect(raised).toMatchObject({
      id,
      state: "raised",
      active: true,
      crossesWaterSurface: false,
      sceneDepthContactExpected: false
    });
    expect(raised.bounds.minimum[1]).toBeCloseTo(0.175, 12);
    expect(controller.metrics).toMatchObject({
      activeRockCount: 3,
      contactProbeCount: 2,
      rendererCount: 11,
      activeRendererCount: 11
    });

    const removed = controller.removeContactProbe(id);
    expect(removed).toMatchObject({
      id,
      state: "removed",
      active: false,
      crossesWaterSurface: false,
      sceneDepthContactExpected: false
    });
    expect(controller.metrics).toMatchObject({
      activeRockCount: 2,
      contactProbeCount: 2,
      rendererCount: 11,
      activeRendererCount: 10,
      entityCount: 13,
      activeEntityCount: 12,
      ownedEntityCount: 14
    });

    const restored = controller.restoreContactProbe(id);
    expect(restored).toMatchObject({
      id,
      state: "default",
      active: true,
      crossesWaterSurface: true,
      sceneDepthContactExpected: true
    });
    expect(restored.bounds).toEqual(createGrasslandsPcgFixture().anchorRocks[0].bounds);
    expect(controller.metrics).toMatchObject({
      activeRockCount: 3,
      contactProbeCount: 3,
      rendererCount: 11,
      activeRendererCount: 11,
      entityCount: 13
    });
    expect(() => controller.removeContactProbe("not-an-anchor")).toThrow(RangeError);
  });

  it("owns and destroys its root, meshes, and materials exactly once", () => {
    const controller = createController();

    controller.destroy();
    controller.destroy();

    expect(engineSpies.rootDestroy).toHaveBeenCalledTimes(1);
    expect(engineSpies.rootDestroy).toHaveBeenCalledWith("grasslands-scene");
    expect(engineSpies.meshDestroy).toHaveBeenCalledTimes(2);
    expect(engineSpies.meshDestroy.mock.calls.every((call) => call[1] === true)).toBe(true);
    expect(engineSpies.materialDestroy).toHaveBeenCalledTimes(3);
    expect(engineSpies.materialDestroy.mock.calls.every((call) => call[1] === true)).toBe(true);
    expect(controller.metrics).toMatchObject({
      destroyed: true,
      finite: false,
      entityCount: 0,
      activeEntityCount: 0,
      ownedEntityCount: 0,
      terrainEntityCount: 0,
      anchorRockCount: 0,
      activeRockCount: 0,
      scenicRockCount: 0,
      submergedScenicRockCount: 0,
      shoreScenicRockCount: 0,
      cameraCount: 0,
      directLightCount: 0,
      rendererCount: 0,
      activeRendererCount: 0,
      meshCreateCount: 2,
      meshDestroyCount: 2,
      materialCreateCount: 3,
      materialDestroyCount: 3,
      entityCreateCount: 14,
      entityDestroyCount: 14
    });
    expect(() => controller.raiseContactProbe("anchor-rock-left-foreground")).toThrow("destroyed");
  });
});
