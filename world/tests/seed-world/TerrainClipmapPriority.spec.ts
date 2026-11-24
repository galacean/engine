import { describe, expect, it, vi } from "vitest";
import { RenderQueue, Vector3, type Camera, type Engine, type Entity, type Material } from "@galacean/engine";
import {
  TERRAIN_CLIPMAP_RENDER_PRIORITY,
  TerrainClipmap
} from "@galacean/engine-terrain/terrain/clipmap/TerrainClipmap";

vi.mock("@galacean/engine", async (original) => {
  const actual = await original<typeof import("@galacean/engine")>();
  class FakeBuffer {
    destroyed = false;
    destroy() {
      this.destroyed = true;
    }
  }
  class FakeBufferMesh {
    bounds = {
      min: new actual.Vector3(),
      max: new actual.Vector3()
    };
    destroyed = false;
    setVertexElements() {}
    setVertexBufferBinding() {}
    setIndexBufferBinding() {}
    addSubMesh() {}
    destroy() {
      this.destroyed = true;
    }
  }
  return {
    ...actual,
    Buffer: FakeBuffer,
    BufferMesh: FakeBufferMesh
  };
});

function createFakeEntity(name: string): Entity {
  const children: FakeEntity[] = [];
  const components: unknown[] = [];
  const transform = {
    position: new Vector3(),
    scale: new Vector3(1, 1, 1),
    worldPosition: new Vector3(),
    setPosition(x: number, y: number, z: number) {
      this.position.set(x, y, z);
    },
    setScale(x: number, y: number, z: number) {
      this.scale.set(x, y, z);
    }
  };
  type FakeEntity = {
    name: string;
    isActive: boolean;
    isActiveInHierarchy: boolean;
    destroyed: boolean;
    transform: typeof transform;
    children: FakeEntity[];
    createChild: (childName: string) => FakeEntity;
    addComponent: <T>(Ctor: new (...args: unknown[]) => T) => T;
    destroy: () => void;
  };
  const entity: FakeEntity = {
    name,
    isActive: true,
    isActiveInHierarchy: true,
    destroyed: false,
    transform,
    children,
    createChild(childName: string) {
      const child = createFakeEntity(childName) as unknown as FakeEntity;
      children.push(child);
      return child;
    },
    addComponent<T>(Ctor: new (...args: unknown[]) => T): T {
      const instance = Object.create(Ctor.prototype) as Record<string, unknown>;
      instance._entity = entity;
      Object.defineProperty(instance, "enabled", { value: true, writable: true, configurable: true });
      Object.defineProperty(instance, "shaderData", {
        value: {
          setFloat() {},
          setVector2() {},
          setVector3() {},
          setVector4() {},
          setInt() {},
          enableMacro() {},
          disableMacro() {}
        },
        writable: true,
        configurable: true
      });
      instance.priority = 0;
      instance.castShadows = true;
      instance.receiveShadows = false;
      Object.defineProperty(instance, "mesh", { value: null, writable: true, configurable: true });
      instance.setMaterial = (mat: unknown) => {
        instance._material = mat;
      };
      instance.setLod = () => {};
      instance.setVerticalBounds = () => {};
      instance.destroy = () => {};
      components.push(instance);
      return instance as T;
    },
    destroy() {
      this.destroyed = true;
    }
  };
  return entity as unknown as Entity;
}

describe("TerrainClipmap opaque draw-order priority", () => {
  it("assigns uniform post-occluder priority to every clipmap segment renderer", () => {
    const root = createFakeEntity("Terrain");
    const cameraEntity = createFakeEntity("Camera");
    const camera = { entity: cameraEntity } as unknown as Camera;
    const material = { shaderData: {} } as unknown as Material;

    const clipmap = new TerrainClipmap(
      {} as Engine,
      root,
      camera,
      { vertexSpacing: 1, minHeight: 0, maxHeight: 50 },
      {
        material,
        gridOrigin: [0, 0],
        diagnostics: {
          mode: "procedural",
          regionCount: 0,
          activeRegionCount: 0,
          heightAtlasWidth: 0,
          heightAtlasHeight: 0,
          normalAtlasWidth: 0,
          normalAtlasHeight: 0,
          alphamapAtlasWidth: 0,
          alphamapAtlasHeight: 0,
          layerCount: 0
        },
        updateHeightRegion() {},
        updateLayerDiffuseColor() {},
        updateAlphamapAtlas() {},
        destroy() {}
      },
      16,
      3
    );

    try {
      const priorities: number[] = [];
      clipmap.visitRenderers((renderer) => {
        priorities.push(renderer.priority);
      });
      expect(priorities.length).toBe(clipmap.segmentCount);
      expect(TERRAIN_CLIPMAP_RENDER_PRIORITY).toBe(50);
      expect(new Set(priorities)).toEqual(new Set([TERRAIN_CLIPMAP_RENDER_PRIORITY]));
    } finally {
      clipmap.destroy();
    }
  });

  it("sorts buildings and default opaque occluders strictly before terrain in RenderQueue.compareForOpaque", () => {
    const makeElement = (priority: number, matId: number, primId: number) =>
      ({
        priority,
        material: { instanceId: matId },
        primitive: { instanceId: primId }
      }) as Parameters<typeof RenderQueue.compareForOpaque>[0];

    const masonrySolid = makeElement(-105, 10, 1);
    const masonryPlaster = makeElement(-98, 11, 2);
    const rocksAndGrass = makeElement(0, 12, 3);
    const terrain = makeElement(TERRAIN_CLIPMAP_RENDER_PRIORITY, 1, 0);

    const sorted = [terrain, rocksAndGrass, masonryPlaster, masonrySolid].sort(RenderQueue.compareForOpaque);
    expect(sorted).toEqual([masonrySolid, masonryPlaster, rocksAndGrass, terrain]);
  });
});
