import { describe, expect, it, vi } from "vitest";
import {
  Entity,
  MeshRenderer,
  RenderViewType,
  ShaderData,
  ShaderDataGroup,
  type Camera,
  type Material,
  type ModelMesh,
  type RenderViewCullingContext,
  type RenderViewCullingSource,
  type Texture2D
} from "@galacean/engine-core";
import { BoundingBox, ContainmentType, Matrix, Vector3, Vector4 } from "@galacean/engine-math";
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
      instanceBuffer: { destroy: vi.fn(), isContentLost: false }
    })),
    createTreeAssemblyInstancedMesh: vi.fn(
      (_engine: unknown, _mesh: unknown, _capacity: number, bounds: BoundingBox, _name: string, storage: any) => ({
        mesh: {
          bounds: bounds.clone(),
          instanceCount: 0,
          destroy: vi.fn()
        },
        instanceBuffer: storage.instanceBuffer,
        staging: storage.staging,
        recordFloats: storage.recordFloats,
        capacity: storage.capacity
      })
    ),
    uploadTreeAssemblyInstances: vi.fn((view: any, count: number) => {
      view.mesh.instanceCount = count;
      if (view.instanceBuffer) view.instanceBuffer.isContentLost = false;
    }),
    uploadTreeAssemblyInstanceRange: vi.fn()
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

  it.each([false, true])("updates one resident's pigment in the same batch (GPU variation %s)", async (gpu) => {
    const { parent, camera } = createMockParentAndCamera();
    const pool = new NaturalUnderstoryInstancedPool(parent, camera, "paint");
    const spec: InstancedUnderstoryBucketSpec = {
      key: "one-material",
      mesh: createMockMesh(),
      material: createMockMaterial("Terrain/Vegetation"),
      macros: [],
      castShadows: false,
      receiveShadows: true,
      enableVertexColor: false,
      usesGpuVariation: gpu,
      interactionOccluder: true
    };
    const trees = ["target", "neighbor"].map((id, i) => makeRecord({ id, x: i, z: -12, spec }));
    pool.setCell("trees", trees);
    pool.update(300, true);
    const bucket = (pool as any).buckets.get(spec.key);
    const original = bucket.view.staging.slice();
    const { encodePlantPigment } = await import("@galacean/engine-world-planning/spatial/VegetationColors");
    const { uploadTreeAssemblyInstanceRange } = await import(
      "@galacean/engine-vegetation/asset-assembly/TreeAssemblyInstancedMesh"
    );
    const dye = encodePlantPigment([200, 0, 255], 1)!;
    const target = (instance: LandscapePlantInstance) => instance.id === "target";
    pool.refreshLocalColors(target, () => dye);
    expect(uploadTreeAssemblyInstanceRange).toHaveBeenLastCalledWith(bucket.storage, 0, 1);
    expect(bucket.view.staging[15]).toBe(dye);
    if (gpu) expect(bucket.view.staging[23]).toBe(dye);
    expect(bucket.view.staging.slice(bucket.view.recordFloats)).toEqual(original.slice(bucket.view.recordFloats));
    expect(pool.bucketCount).toBe(1);
    expect(bucket.view.mesh.instanceCount).toBe(2);
    pool.refreshLocalColors(target, () => undefined);
    expect(bucket.view.staging).toEqual(original);
    pool.dispose();
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

  it("culls Camera and ShadowCascades independently, forces lowest-precision LOD in shadows, and skips Cascade >= 1 for understory", () => {
    const { parent, camera } = createMockParentAndCamera();
    let registeredSource: RenderViewCullingSource | null = null;
    const unregister = vi.fn(() => {
      registeredSource = null;
    });
    (camera as any).enableFrustumCulling = true;
    (camera as any).registerRenderViewCullingSource = vi.fn((source: RenderViewCullingSource) => {
      registeredSource = source;
      return { unregister };
    });

    const pool = new NaturalUnderstoryInstancedPool(parent, camera, "TreePool", {
      maxShadowCascadeIndex: 3,
      shadowLodPolicy: "lowest"
    });
    expect(registeredSource).toBe(pool);

    const lod0Spec: InstancedUnderstoryBucketSpec = {
      key: "tree-lod0",
      mesh: createMockMesh("tree-lod0"),
      material: createMockMaterial("Terrain/Vegetation"),
      macros: ["RENDERER_PROCEDURAL_TREE_GPU_VARIATION"],
      castShadows: true,
      receiveShadows: true,
      enableVertexColor: false,
      usesGpuVariation: true,
      interactionOccluder: true
    };
    const lod3Spec: InstancedUnderstoryBucketSpec = {
      key: "tree-lod3",
      mesh: createMockMesh("tree-lod3"),
      material: createMockMaterial("Terrain/Vegetation"),
      macros: ["RENDERER_PROCEDURAL_TREE_GPU_VARIATION"],
      // Even when camera-distance rules mark LOD3 castShadows=false, shadow views must still cast via lowest LOD.
      castShadows: false,
      receiveShadows: true,
      enableVertexColor: false,
      usesGpuVariation: true,
      interactionOccluder: true
    };

    const nearFrontTree = makeRecord({
      id: "t-near-front",
      x: 0,
      y: 0,
      z: -12,
      spec: lod0Spec,
      secondSpec: lod3Spec,
      worldSize: 10,
      lodThresholds: [0.2, 0]
    });
    const behindTree = makeRecord({
      id: "t-behind",
      x: 0,
      y: 0,
      z: 14,
      spec: lod0Spec,
      secondSpec: lod3Spec,
      worldSize: 10,
      lodThresholds: [0.2, 0]
    });
    const farFrontTree = makeRecord({
      id: "t-far-front",
      x: 0,
      y: 0,
      z: -120,
      spec: lod0Spec,
      secondSpec: lod3Spec,
      worldSize: 10,
      lodThresholds: [0.2, 0]
    });

    pool.setCell("trees", [nearFrontTree, behindTree, farFrontTree]);
    pool.update(Infinity, true, 180);

    // Main camera view strictly excludes off-frustum behindTree, keeps nearFrontTree at LOD0 and farFrontTree at LOD3.
    expect(nearFrontTree.assignedLod).toBe(0);
    expect(behindTree.assignedLod).toBe(-1);
    expect(farFrontTree.assignedLod).toBe(1);

    const lod0Bucket = (pool as any).buckets.get("tree-lod0");
    const lod3Bucket = (pool as any).buckets.get("tree-lod3");
    expect(lod0Bucket.renderer.enabled).toBe(false);
    expect(lod0Bucket.view.mesh.instanceCount).toBe(1);
    expect(lod3Bucket.view.mesh.instanceCount).toBe(1);

    // Pick batches remain discoverable even though view-culled renderers have enabled=false.
    const pickedCounts: number[] = [];
    pool.visitPickBatches((b) => pickedCounts.push(b.count));
    expect(pickedCounts).toEqual([1, 1]);

    // Camera view cull submits both LOD0 and LOD3 camera renderers.
    const camSubmitted: MeshRenderer[] = [];
    const camContext: RenderViewCullingContext = {
      viewType: RenderViewType.Camera,
      camera,
      virtualCamera: { viewProjectionMatrix: new Matrix() } as any,
      shadowCascadeIndex: -1,
      isVisible: () => true,
      classifyBounds: () => ContainmentType.Intersects,
      submit: (r) => camSubmitted.push(r)
    };
    pool.cull(camContext);
    expect(camSubmitted).toContain(lod0Bucket.renderer);
    expect(camSubmitted).toContain(lod3Bucket.renderer);

    // Shadow Cascade 0 (near -50..+30): includes nearFrontTree AND behindTree, excludes farFrontTree (-120),
    // and submits ONLY the lowest-precision LOD3 shadow view (never LOD0!).
    const c0Submitted: MeshRenderer[] = [];
    const c0Vp = new Matrix();
    c0Vp.elements[0] = 1.1;
    const c0Context: RenderViewCullingContext = {
      viewType: RenderViewType.ShadowCascade,
      camera,
      virtualCamera: { viewProjectionMatrix: c0Vp } as any,
      shadowCascadeIndex: 0,
      classifyBounds: (b) => (b.max.z < -50 || b.min.z > 30 ? ContainmentType.Disjoint : ContainmentType.Intersects),
      isVisible: (b) => b.max.z >= -50 && b.min.z <= 30,
      submit: (r) => c0Submitted.push(r)
    };
    pool.cull(c0Context);
    expect(c0Submitted.length).toBe(1);
    expect(lod0Bucket.shadowViews[0]).toBeUndefined();
    const c0ShadowView = lod3Bucket.shadowViews[0];
    expect(c0ShadowView).toBeDefined();
    expect(c0ShadowView.renderer.castShadows).toBe(true);
    expect(c0ShadowView.renderer.receiveShadows).toBe(false);
    expect(c0ShadowView.view.mesh.instanceCount).toBe(2);
    expect(c0Submitted[0]).toBe(c0ShadowView.renderer);

    // Shadow Cascade 1 (far -160..-50): includes ONLY farFrontTree at LOD3.
    const c1Submitted: MeshRenderer[] = [];
    const c1Vp = new Matrix();
    c1Vp.elements[0] = 2.2;
    const c1Context: RenderViewCullingContext = {
      viewType: RenderViewType.ShadowCascade,
      camera,
      virtualCamera: { viewProjectionMatrix: c1Vp } as any,
      shadowCascadeIndex: 1,
      classifyBounds: (b) => (b.max.z < -160 || b.min.z > -50 ? ContainmentType.Disjoint : ContainmentType.Intersects),
      isVisible: (b) => b.max.z >= -160 && b.min.z <= -50,
      submit: (r) => c1Submitted.push(r)
    };
    pool.cull(c1Context);
    expect(c1Submitted.length).toBe(1);
    expect(lod3Bucket.shadowViews[1].view.mesh.instanceCount).toBe(1);

    // Understory pool with maxShadowCascadeIndex=0 skips Cascade 1 completely.
    const understoryPool = new NaturalUnderstoryInstancedPool(parent, camera, "UnderstoryPool", {
      maxShadowCascadeIndex: 0,
      shadowLodPolicy: "lowest"
    });
    understoryPool.setCell("cell-0", [
      makeRecord({ id: "shrub-1", x: 0, y: 0, z: -80, spec: lod0Spec, secondSpec: lod3Spec, lodThresholds: [0.2, 0] })
    ]);
    understoryPool.update(120, true);
    const understoryC1: MeshRenderer[] = [];
    understoryPool.cull({ ...c1Context, submit: (r) => understoryC1.push(r) });
    expect(understoryC1.length).toBe(0);

    pool.dispose();
    understoryPool.dispose();
    expect(unregister).toHaveBeenCalledTimes(2);
    expect(c0ShadowView.view.mesh.destroy).toHaveBeenCalledOnce();
    expect(c0ShadowView.storage.instanceBuffer.destroy).toHaveBeenCalledWith(true);
  });

  it("returns exact camera-only and shadow-only primary warmup renderers when view culling is active", () => {
    const { parent, camera } = createMockParentAndCamera();
    const unregister = vi.fn();
    (camera as any).enableFrustumCulling = true;
    (camera as any).registerRenderViewCullingSource = vi.fn(() => ({ unregister }));

    const pool = new NaturalUnderstoryInstancedPool(parent, camera, "PrimaryWarmupPool", {
      maxShadowCascadeIndex: 1,
      shadowLodPolicy: "lowest"
    });
    const makeSpec = (key: string): InstancedUnderstoryBucketSpec => ({
      key,
      mesh: createMockMesh(key),
      material: createMockMaterial("Terrain/Vegetation"),
      macros: ["RENDERER_ASSET_ASSEMBLY_INSTANCE"],
      castShadows: true,
      receiveShadows: true,
      enableVertexColor: false,
      usesGpuVariation: true,
      interactionOccluder: true
    });
    const lod0Spec = makeSpec("tree-lod0");
    const lod3Spec = makeSpec("tree-lod3");
    const offscreenOnlySpec = makeSpec("tree-far-offscreen");

    pool.setCell("cell-0", [
      // Visible near camera at LOD0, casts shadow at LOD3 (lowest)
      makeRecord({ id: "near-front", x: 0, y: 0, z: -15, worldSize: 10, spec: lod0Spec, secondSpec: lod3Spec, lodThresholds: [0.2, 0] }),
      // Behind camera beyond shadow distance -> excluded from both camera & shadow warmup
      makeRecord({ id: "far-behind", x: 0, y: 0, z: 250, worldSize: 10, spec: offscreenOnlySpec, lodThresholds: [0] })
    ]);
    pool.update(Infinity, true, 120);

    const primary = pool.getPrimaryWarmupRenderers();
    expect(primary.renderers).toHaveLength(0);
    expect(primary.cameraOnlyRenderers).toHaveLength(1);
    expect(primary.shadowOnlyRenderers).toHaveLength(1);
    expect(primary.shadowOnlyRenderers[0]!.castShadows).toBe(true);
    expect(primary.shadowOnlyRenderers[0]!.receiveShadows).toBe(false);
    expect(primary.shadowOnlyRenderers[0]!.mesh).toBe(lod3Spec.mesh);

    primary.dispose();
    // Temporary mesh reference is cleaned up without disturbing real shadow views.
    expect(primary.shadowOnlyRenderers[0]!.mesh).toBeNull();

    pool.dispose();
  });

  it("re-uploads camera and shadow instance buffers after WebGL context loss even when the camera is stationary", async () => {
    const { uploadTreeAssemblyInstances } = await import(
      "@galacean/engine-vegetation/asset-assembly/TreeAssemblyInstancedMesh"
    );
    const uploadSpy = vi.mocked(uploadTreeAssemblyInstances);
    uploadSpy.mockClear();

    const { parent, camera } = createMockParentAndCamera();
    (camera as any).enableFrustumCulling = true;
    (camera as any).registerRenderViewCullingSource = vi.fn(() => ({ unregister: vi.fn() }));

    const pool = new NaturalUnderstoryInstancedPool(parent, camera, "ContextLossPool", {
      maxShadowCascadeIndex: 0,
      shadowLodPolicy: "lowest"
    });
    const spec: InstancedUnderstoryBucketSpec = {
      key: "shrub-lod0",
      mesh: createMockMesh("shrub-lod0"),
      material: createMockMaterial("Terrain/Vegetation"),
      macros: ["RENDERER_ASSET_ASSEMBLY_INSTANCE"],
      castShadows: true,
      receiveShadows: true,
      enableVertexColor: false,
      usesGpuVariation: true,
      interactionOccluder: false
    };
    pool.setCell("cell-0", [makeRecord({ id: "shrub-1", x: 0, y: 0, z: -20, spec })]);
    pool.update(Infinity, true, 120);

    const bucket = (pool as any).buckets.get("shrub-lod0");
    const camContext: RenderViewCullingContext = {
      viewType: RenderViewType.Camera,
      camera,
      virtualCamera: { viewProjectionMatrix: new Matrix() } as any,
      shadowCascadeIndex: -1,
      classifyBounds: () => ContainmentType.Intersects,
      isVisible: () => true,
      submit: vi.fn()
    };
    const shadowClassifySpy = vi.fn(() => ContainmentType.Intersects);
    const shadowContext: RenderViewCullingContext = {
      viewType: RenderViewType.ShadowCascade,
      camera,
      virtualCamera: { viewProjectionMatrix: new Matrix() } as any,
      shadowCascadeIndex: 0,
      classifyBounds: shadowClassifySpy,
      isVisible: () => true,
      submit: vi.fn()
    };

    // Initial camera + shadow cull uploads both views once.
    pool.cull(camContext);
    pool.cull(shadowContext);
    const afterInitialUploads = uploadSpy.mock.calls.length;
    expect(afterInitialUploads).toBe(2); // 1 camera + 1 shadow

    // Stationary camera non-forced cull hits both early-return/cache-hit paths and skips both uploads.
    shadowClassifySpy.mockClear();
    pool.update(Infinity, false, 120);
    pool.cull(camContext);
    pool.cull(shadowContext);
    expect(uploadSpy.mock.calls.length).toBe(afterInitialUploads);
    expect(shadowClassifySpy).not.toHaveBeenCalled();

    // Simulate WebGL context loss/restore marking both GPU buffers content-lost.
    bucket.view.instanceBuffer.isContentLost = true;
    bucket.shadowViews[0].view.instanceBuffer.isContentLost = true;

    // Stationary non-forced cull MUST hit !cameraChanged early-return (L1095) and shadow cache-hit (L1019)
    // and re-upload both buffers immediately without re-culling shadow cascades.
    shadowClassifySpy.mockClear();
    pool.cull(camContext);
    pool.cull(shadowContext);
    expect(uploadSpy.mock.calls.length).toBe(afterInitialUploads + 2);
    expect(shadowClassifySpy).not.toHaveBeenCalled();
    expect(bucket.view.instanceBuffer.isContentLost).toBe(false);
    expect(bucket.shadowViews[0].view.instanceBuffer.isContentLost).toBe(false);

    // Forced update with unchanged visibility (!anyChanged early-return) must also restore lost camera buffer.
    bucket.view.instanceBuffer.isContentLost = true;
    pool.update(Infinity, true, 120);
    expect(uploadSpy.mock.calls.length).toBe(afterInitialUploads + 3);
    expect(bucket.view.instanceBuffer.isContentLost).toBe(false);

    pool.dispose();
  });
});
