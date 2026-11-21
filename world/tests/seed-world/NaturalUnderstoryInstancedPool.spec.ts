import { describe, expect, it, vi } from "vitest";
import {
  Entity,
  MeshRenderer,
  ShaderData,
  ShaderDataGroup,
  type Camera,
  type Material,
  type ModelMesh,
  type Texture2D
} from "@galacean/engine-core";
import { BoundingBox, Matrix, Vector3, Vector4 } from "@galacean/engine-math";
import type { LandscapePlantInstance } from "@galacean/engine-vegetation/world/VegetationLandscapePlan";
import {
  applyUnderstoryBucketSpecToRenderer,
  canInstanceUnderstoryLevels,
  NaturalUnderstoryInstancedPool,
  type CollapsedUnderstoryLevel,
  type InstancedUnderstoryBucketSpec,
  type InstancedUnderstoryRecord,
  type UnderstorySourceLike
} from "@galacean/engine-world-planning/spatial/runtime/NaturalUnderstoryInstancedPool";

vi.mock("@galacean/engine-vegetation/asset-assembly/TreeAssemblyInstancedMesh", () => {
  return {
    TREE_ASSEMBLY_INSTANCE_FLOATS: 16,
    TREE_ASSEMBLY_GPU_VARIATION_INSTANCE_FLOATS: 24,
    createTreeAssemblyInstanceStorage: vi.fn((_engine: unknown, capacity: number, recordFloats: number) => ({
      capacity,
      recordFloats,
      staging: new Float32Array(capacity * recordFloats),
      instanceBuffer: { destroy: vi.fn() }
    })),
    createTreeAssemblyInstancedMesh: vi.fn(
      (_engine: unknown, _mesh: unknown, _capacity: number, bounds: BoundingBox, _name: string, storage: any) => ({
        mesh: {
          bounds: bounds.clone(),
          instanceCount: 0,
          destroy: vi.fn()
        },
        staging: storage.staging,
        recordFloats: storage.recordFloats,
        capacity: storage.capacity
      })
    ),
    uploadTreeAssemblyInstances: vi.fn((view: any, count: number) => {
      view.mesh.instanceCount = count;
    })
  };
});

const makeShaderData = (group: ShaderDataGroup) =>
  new (ShaderData as unknown as { new (group: ShaderDataGroup): ShaderData })(group);

function createMockMesh(name = "mesh"): ModelMesh {
  return {
    name,
    destroyed: false,
    blendShapeCount: 0,
    subMeshes: [{ start: 0, count: 36 }],
    bounds: new BoundingBox(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 1, 0.5))
  } as unknown as ModelMesh;
}

function createMockMaterial(shaderName: string, materialMacros: string[] = []): Material {
  const data = makeShaderData(ShaderDataGroup.Material);
  for (const m of materialMacros) data.enableMacro(m);
  return {
    shader: { name: shaderName },
    shaderData: data
  } as unknown as Material;
}

function createMockSourceRenderer(
  shaderName: string,
  rendererMacros: string[] = [],
  materialMacros: string[] = []
): MeshRenderer {
  const mesh = createMockMesh("src-mesh");
  const material = createMockMaterial(shaderName, materialMacros);
  const data = makeShaderData(ShaderDataGroup.Renderer);
  for (const m of rendererMacros) data.enableMacro(m);
  return {
    mesh,
    shaderData: data,
    getMaterials: () => [material],
    castShadows: true,
    receiveShadows: true,
    enableVertexColor: false
  } as unknown as MeshRenderer;
}

function createMockParentAndCamera() {
  const createdChildren: any[] = [];
  const makeEntity = (name: string): any => {
    const components: any[] = [];
    const entity: any = {
      name,
      isActive: true,
      get isActiveInHierarchy() {
        return entity.isActive;
      },
      destroyed: false,
      engine: {},
      children: [] as any[],
      createChild(childName: string) {
        const child = makeEntity(childName);
        entity.children.push(child);
        createdChildren.push(child);
        return child;
      },
      addComponent(_ctor: unknown) {
        const renderer: any = {
          entity,
          enabled: true,
          shaderData: makeShaderData(ShaderDataGroup.Renderer),
          mesh: null,
          material: null,
          castShadows: false,
          receiveShadows: false,
          enableVertexColor: false,
          setMaterial(mat: Material) {
            renderer.material = mat;
          },
          getMaterial() {
            return renderer.material;
          }
        };
        components.push(renderer);
        return renderer;
      },
      destroy() {
        entity.destroyed = true;
      }
    };
    return entity;
  };

  const parent = makeEntity("Root") as unknown as Entity;

  const viewMatrix = new Matrix();
  const projMatrix = new Matrix();
  Matrix.lookAt(new Vector3(0, 2, 0), new Vector3(0, 2, -10), new Vector3(0, 1, 0), viewMatrix);
  Matrix.perspective((60 * Math.PI) / 180, 16 / 9, 0.1, 300, projMatrix);

  const cameraPos = new Vector3(0, 2, 0);
  const camera = {
    isOrthographic: false,
    fieldOfView: 60,
    orthographicSize: 10,
    viewMatrix,
    projectionMatrix: projMatrix,
    entity: {
      transform: {
        worldPosition: cameraPos
      }
    }
  } as unknown as Camera;

  return { parent, camera, cameraPos, viewMatrix, createdChildren };
}

function makeRecord(opts: {
  id: string;
  x: number;
  y?: number;
  z: number;
  spec: InstancedUnderstoryBucketSpec;
  color?: [number, number, number];
  worldSize?: number;
  lodThresholds?: number[];
  secondSpec?: InstancedUnderstoryBucketSpec;
}): InstancedUnderstoryRecord {
  const y = opts.y ?? 0;
  const color = opts.color ?? [0.8, 0.4, 0.9];
  const thresholds = opts.lodThresholds ?? [0.005];
  const worldSize = opts.worldSize ?? 2;
  return {
    instance: {
      id: opts.id,
      assetId: "test-plant",
      layerId: "零星野花",
      position: [opts.x, y, opts.z],
      rotationY: 0,
      scale: 1
    } as LandscapePlantInstance,
    groundHeight: y,
    refYOffset: 1,
    worldCenterY: y + 1,
    worldSize,
    boundingRadius: 1.5,
    terminalCutoff: thresholds[thresholds.length - 1]!,
    pickId: `pick:${opts.id}`,
    excluded: false,
    assignedLod: -1,
    lods: thresholds.map((threshold, idx) => {
      const spec = idx > 0 && opts.secondSpec ? opts.secondSpec : opts.spec;
      return {
        screenRelativeTransitionHeight: threshold,
        parts: [
          {
            bucketKey: spec.key,
            bucketSpec: spec,
            materialId: "leaf",
            posX: opts.x,
            posY: y,
            posZ: opts.z,
            quatX: 0,
            quatY: 0,
            quatZ: 0,
            quatW: 1,
            scaleX: 1,
            scaleY: 1,
            scaleZ: 1,
            colorR: color[0],
            colorG: color[1],
            colorB: color[2],
            varX: 0.1,
            varY: 0.2,
            varZ: 0.3,
            varW: 0.4,
            branchX: 1.1,
            branchY: 0.9
          }
        ]
      };
    })
  };
}

describe("NaturalUnderstoryInstancedPool", () => {
  it("accepts both Terrain/Vegetation and Terrain/Surface shaders and rejects unsupported shaders or macros", () => {
    const makeLevels = (renderer: MeshRenderer): CollapsedUnderstoryLevel[] => {
      const specimen: UnderstorySourceLike = {
        bounds: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
        rendererBindings: [{ renderer, materialId: "leaf" }]
      };
      return [{ screenRelativeTransitionHeight: 0.01, level: 0, specimen, castShadows: true }];
    };

    const veg = createMockSourceRenderer("Terrain/Vegetation", ["RENDERER_PROCEDURAL_TREE_GPU_VARIATION"]);
    const surf = createMockSourceRenderer("Terrain/Surface");
    const unlit = createMockSourceRenderer("unlit");
    const catalog = createMockSourceRenderer("Terrain/Vegetation", ["RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG"]);
    const sharedGrass = createMockSourceRenderer(
      "Terrain/Vegetation",
      [],
      ["MATERIAL_VEGETATION_SHARED_GRASS_APPEARANCE"]
    );

    expect(canInstanceUnderstoryLevels(makeLevels(veg)[0]!.specimen, makeLevels(veg))).toBe(true);
    expect(canInstanceUnderstoryLevels(makeLevels(surf)[0]!.specimen, makeLevels(surf))).toBe(true);
    expect(canInstanceUnderstoryLevels(makeLevels(unlit)[0]!.specimen, makeLevels(unlit))).toBe(false);
    expect(canInstanceUnderstoryLevels(makeLevels(catalog)[0]!.specimen, makeLevels(catalog))).toBe(false);
    expect(canInstanceUnderstoryLevels(makeLevels(sharedGrass)[0]!.specimen, makeLevels(sharedGrass))).toBe(false);
  });

  it("transfers shared GPU leaf-frame uniforms and enables RENDERER_ASSET_ASSEMBLY_INSTANCE on bucket renderers", () => {
    const tex = { name: "leaf-frame-atlas" } as unknown as Texture2D;
    const spec: InstancedUnderstoryBucketSpec = {
      key: "tree-leaf",
      mesh: createMockMesh("leaf"),
      material: createMockMaterial("Terrain/Vegetation"),
      macros: [
        "RENDERER_ASSET_ASSEMBLY_INSTANCE",
        "RENDERER_PROCEDURAL_TREE_GPU_VARIATION",
        "RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME"
      ],
      castShadows: true,
      receiveShadows: true,
      enableVertexColor: false,
      usesGpuVariation: true,
      interactionOccluder: true,
      gpuLeafFrame: {
        texture: tex,
        normalField: new Vector4(0.1, 0.2, 0.3, 0.4),
        frameScale: new Vector4(1, 2, 3, 4)
      }
    };

    const data = makeShaderData(ShaderDataGroup.Renderer);
    let assignedMat: Material | undefined;
    const renderer = {
      shaderData: data,
      castShadows: false,
      receiveShadows: false,
      enableVertexColor: false,
      setMaterial(m: Material) {
        assignedMat = m;
      }
    } as unknown as MeshRenderer;

    applyUnderstoryBucketSpecToRenderer(renderer, spec);

    expect(assignedMat).toBe(spec.material);
    expect(renderer.castShadows).toBe(true);
    expect(renderer.receiveShadows).toBe(true);
    expect(data.getMacros().some((m) => m.name === "RENDERER_ASSET_ASSEMBLY_INSTANCE")).toBe(true);
    expect(data.getMacros().some((m) => m.name === "RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE")).toBe(false);
    expect(data.getTexture("renderer_ProceduralTreeLeafFrames")).toBe(tex);
    expect(data.getVector4("renderer_ProceduralTreeLeafNormalField")?.y).toBeCloseTo(0.2);
    expect(data.getVector4("renderer_ProceduralTreeLeafFrameScale")?.w).toBeCloseTo(4);
  });

  it("packs 16-float and 24-float GPU-variation layouts, culls frustum, and retains off-frustum shadow casters", () => {
    const { parent, camera } = createMockParentAndCamera();
    const pool = new NaturalUnderstoryInstancedPool(parent, camera, "TestPool");

    const flowerSpec: InstancedUnderstoryBucketSpec = {
      key: "flower-16f",
      mesh: createMockMesh("flower"),
      material: createMockMaterial("Terrain/Vegetation"),
      macros: [],
      castShadows: false,
      receiveShadows: true,
      enableVertexColor: false,
      usesGpuVariation: false,
      interactionOccluder: false
    };
    const treeSpec: InstancedUnderstoryBucketSpec = {
      key: "tree-24f",
      mesh: createMockMesh("tree"),
      material: createMockMaterial("Terrain/Vegetation"),
      macros: ["RENDERER_PROCEDURAL_TREE_GPU_VARIATION"],
      castShadows: true,
      receiveShadows: true,
      enableVertexColor: false,
      usesGpuVariation: true,
      interactionOccluder: true
    };

    // Camera is at (0, 2, 0) looking down -Z.
    const inFrontFlower = makeRecord({ id: "f-front", x: 0, y: 1, z: -12, spec: flowerSpec, color: [0.5, 0.2, 0.9] });
    const behindFlower = makeRecord({ id: "f-back", x: 0, y: 1, z: 12, spec: flowerSpec });
    const behindShadowTree = makeRecord({
      id: "t-back",
      x: 0,
      y: 0,
      z: 14,
      spec: treeSpec,
      color: [0.2, 0.7, 0.3],
      worldSize: 8
    });
    const farBehindTree = makeRecord({
      id: "t-far-back",
      x: 0,
      y: 0,
      z: 180,
      spec: treeSpec,
      worldSize: 8
    });

    pool.setCell("cell-0", [inFrontFlower, behindFlower, behindShadowTree, farBehindTree]);
    pool.update(300, true, 60);

    // Flower in front is visible, behind flower is culled (castShadows = false).
    expect(inFrontFlower.assignedLod).toBe(0);
    expect(behindFlower.assignedLod).toBe(-1);
    // Tree behind camera within shadow radius (14m <= 60m) is kept for shadows; far behind (180m) is culled.
    expect(behindShadowTree.assignedLod).toBe(0);
    expect(farBehindTree.assignedLod).toBe(-1);

    const flowerBucket = (pool as any).buckets.get("flower-16f");
    const treeBucket = (pool as any).buckets.get("tree-24f");
    expect(flowerBucket.view.mesh.instanceCount).toBe(1);
    expect(treeBucket.view.mesh.instanceCount).toBe(1);

    // Check 16-float packing: pos=(0,1,-12,1), quat=(0,0,0,1), scale=(1,1,1,1), color=(0.5,0.2,0.9,1)
    const fBuf: Float32Array = flowerBucket.view.staging;
    expect(Array.from(fBuf.slice(0, 4))).toEqual([0, 1, -12, 1]);
    expect(Array.from(fBuf.slice(8, 12))).toEqual([1, 1, 1, 1]);
    expect(fBuf[12]).toBeCloseTo(0.5);
    expect(fBuf[13]).toBeCloseTo(0.2);
    expect(fBuf[14]).toBeCloseTo(0.9);
    expect(fBuf[15]).toBe(1);

    // Check 24-float GPU-variation packing: pos.w=branchX, scale.w=branchY, var=(0.1,0.2,0.3,0.4), leafColor=(0.2,0.7,0.3,1)
    const tBuf: Float32Array = treeBucket.view.staging;
    expect(tBuf[3]).toBeCloseTo(1.1);
    expect(tBuf[11]).toBeCloseTo(0.9);
    expect(tBuf[16]).toBeCloseTo(0.1);
    expect(tBuf[19]).toBeCloseTo(0.4);
    expect(tBuf[20]).toBeCloseTo(0.2);
    expect(tBuf[21]).toBeCloseTo(0.7);
    expect(tBuf[22]).toBeCloseTo(0.3);
    expect(tBuf[23]).toBe(1);

    // Test ground height update, appearance color refresh, exclusions, pick batches, and disposal.
    pool.updateCellGroundHeights("cell-0", (rec) => rec.groundHeight + 3);
    pool.refreshAppearanceColors(
      "test-plant",
      "leaf",
      (instance) => (instance.id === "f-front" ? new Vector4(0.9, 0.8, 0.1, 1) : undefined),
      () => [0, 0, 0],
      false
    );
    pool.update(300, true, 60);
    expect(inFrontFlower.groundHeight).toBe(4);
    expect(flowerBucket.view.staging[1]).toBeCloseTo(4);
    expect(flowerBucket.view.staging[12]).toBeCloseTo(0.9);

    const visited: number[] = [];
    pool.visitPickBatches((batch) => visited.push(batch.count));
    expect(visited).toEqual([1, 1]);

    pool.updateGroundExclusions([{ minX: -5, maxX: 5, minZ: -20, maxZ: 0 }], (instance) => instance.id === "f-front");
    pool.update(300, true, 60);
    expect(inFrontFlower.assignedLod).toBe(-1);
    expect(flowerBucket.view.mesh.instanceCount).toBe(0);
    expect(flowerBucket.entity.isActive).toBe(false);

    pool.dispose();
    expect(flowerBucket.view.mesh.destroy).toHaveBeenCalledOnce();
    expect(flowerBucket.storage.instanceBuffer.destroy).toHaveBeenCalledWith(true);
  });
});
