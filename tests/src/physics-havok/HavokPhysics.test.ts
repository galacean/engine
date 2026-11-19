import {
  BoxCollider,
  CharacterController,
  CharacterControllerGeometry,
  Collider,
  Collision,
  ContactPoint,
  ControllerCollisionFlag,
  ControllerNonWalkableMode,
  Entity,
  FixedJoint,
  HingeJoint,
  HitResult,
  JointLimits,
  JointMotor,
  Layer,
  MeshCollider,
  ModelMesh,
  PhysicsScene,
  PlaneCollider,
  Rigidbody,
  Script,
  SphereCollider,
  SpringJoint,
  SystemInfo,
  WebGLEngine
} from "@galacean/engine";
import { Quaternion, Ray, Vector3 } from "@galacean/engine-math";
import { HavokPhysics, version, type HavokRuntimeOptions } from "@galacean/engine-physics-havok";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const UMD_JS_URL = new URL("../../../packages/physics-havok/libs/HavokPhysics_umd.js", import.meta.url).href;
const WASM_URL = new URL("../../../packages/physics-havok/libs/HavokPhysics.wasm", import.meta.url).href;
const BAD_JS_URL = new URL("./__nonexistent_havok_loader__.js", UMD_JS_URL).href;

class EventRecorder extends Script {
  onCollisionEnter = vi.fn();
  onCollisionStay = vi.fn();
  onCollisionExit = vi.fn();
  onTriggerEnter = vi.fn();
  onTriggerStay = vi.fn();
  onTriggerExit = vi.fn();
}

function createModelMesh(engine: WebGLEngine, positions: number[], indices?: number[]): ModelMesh {
  const mesh = new ModelMesh(engine);
  const vertices: Vector3[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    vertices.push(new Vector3(positions[i], positions[i + 1], positions[i + 2]));
  }
  mesh.setPositions(vertices);
  if (indices) {
    mesh.setIndices(new Uint16Array(indices));
  }
  mesh.uploadData(false);
  return mesh;
}

function createCubeMesh(engine: WebGLEngine, halfSize = 1): ModelMesh {
  const vertices = [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1];
  const indices = [
    0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5
  ];
  return createModelMesh(
    engine,
    vertices.map((value) => value * halfSize),
    indices
  );
}

function createSubdividedPlaneMesh(engine: WebGLEngine, size = 4, segments = 4): ModelMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const half = size * 0.5;
  const step = size / segments;
  for (let z = 0; z <= segments; z++) {
    for (let x = 0; x <= segments; x++) {
      positions.push(-half + x * step, 0, -half + z * step);
    }
  }
  const stride = segments + 1;
  for (let z = 0; z < segments; z++) {
    for (let x = 0; x < segments; x++) {
      const i0 = z * stride + x;
      const i1 = i0 + 1;
      const i2 = i0 + stride;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  }
  return createModelMesh(engine, positions, indices);
}

function createDefaultMaterial(havok: HavokPhysics) {
  return havok.createPhysicsMaterial({
    bounciness: 0,
    dynamicFriction: 0.5,
    staticFriction: 0.5,
    bounceCombine: 0,
    frictionCombine: 0
  });
}

function verifySceneRaycast(havok: HavokPhysics): void {
  const scene = havok.createPhysicsScene();
  const material = createDefaultMaterial(havok);
  const shape = havok.createBoxColliderShape(1, new Vector3(1, 1, 1), material);
  const collider = havok.createStaticCollider(new Vector3(0, 0, 0), new Quaternion(0, 0, 0, 1));
  collider.addShape(shape);
  scene.addCollider(collider);

  let hitId = -1;
  const hit = scene.raycast(new Vector3(0, 5, 0), new Vector3(0, -1, 0), 20, 0xffffffff, (id) => {
    hitId = id;
  });
  expect(hit).toBe(true);
  expect(hitId).toBe(1);

  scene.removeCollider(collider);
  collider.destroy();
  shape.destroy();
  material.destroy();
  scene.destroy();
}

describe("HavokPhysics runtime & lifecycle", () => {
  let sharedRawModule: unknown;

  beforeAll(async () => {
    const bootstrap = new HavokPhysics();
    await bootstrap.initialize();
    sharedRawModule = (bootstrap as unknown as { _hk: unknown })._hk;
    bootstrap.destroy();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes a valid build version and initializes zero-config with idempotent concurrent calls", async () => {
    expect(typeof version).toBe("string");
    expect(version.length).toBeGreaterThan(0);
    expect(version).not.toBe("__buildVersion");

    const havok = new HavokPhysics();
    try {
      await Promise.all([havok.initialize(), havok.initialize()]);
      await havok.initialize();
      verifySceneRaycast(havok);
    } finally {
      havok.destroy();
    }
  });

  it("supports explicit jsUrl + wasmUrl and custom jsUrl alone (sibling .wasm)", async () => {
    const explicit = new HavokPhysics({
      jsUrl: `${UMD_JS_URL}?mode=explicit`,
      wasmUrl: `${WASM_URL}?mode=explicit`
    });
    try {
      await explicit.initialize();
      verifySceneRaycast(explicit);
    } finally {
      explicit.destroy();
    }

    const sibling = new HavokPhysics({
      jsUrl: `${UMD_JS_URL}?mode=sibling`
    });
    try {
      await sibling.initialize();
      verifySceneRaycast(sibling);
    } finally {
      sibling.destroy();
    }

    // Verify custom jsUrl is not bypassed by the global cache and does not force default locateFile.
    const globalObj = globalThis as Record<string, unknown>;
    const previousFactory = globalObj.HavokPhysics;
    let capturedModuleArg: Record<string, unknown> | undefined;
    let blobScriptInvoked = false;
    globalObj.__havokCustomJsProbe = (moduleArg: Record<string, unknown>) => {
      blobScriptInvoked = true;
      capturedModuleArg = moduleArg;
      return Promise.resolve(sharedRawModule);
    };
    const blobUrl = URL.createObjectURL(
      new Blob(["globalThis.HavokPhysics = function(arg) { return globalThis.__havokCustomJsProbe(arg); };"], {
        type: "text/javascript"
      })
    );
    const customBlob = new HavokPhysics({ jsUrl: blobUrl });
    try {
      await customBlob.initialize();
      expect(blobScriptInvoked).toBe(true);
      expect(capturedModuleArg?.locateFile).toBeUndefined();
      verifySceneRaycast(customBlob);
    } finally {
      customBlob.destroy();
      URL.revokeObjectURL(blobUrl);
      delete globalObj.__havokCustomJsProbe;
      globalObj.HavokPhysics = previousFactory;
      document.querySelectorAll(`script[src="${blobUrl}"]`).forEach((node) => node.remove());
    }
  });

  it("supports havokFactory (locateFile precedence + retry after failure) and havokInstance", async () => {
    let seenArgWithoutWasm: Record<string, unknown> | undefined;
    let attempt = 0;
    const factoryWithoutWasm = new HavokPhysics({
      havokFactory: (moduleArg) => {
        attempt++;
        seenArgWithoutWasm = moduleArg;
        if (attempt === 1) {
          return Promise.reject(new Error("transient factory failure"));
        }
        return Promise.resolve(sharedRawModule);
      }
    });
    try {
      await expect(factoryWithoutWasm.initialize()).rejects.toThrow("transient factory failure");
      await factoryWithoutWasm.initialize();
      expect(attempt).toBe(2);
      expect(seenArgWithoutWasm?.locateFile).toBeUndefined();
      verifySceneRaycast(factoryWithoutWasm);
    } finally {
      factoryWithoutWasm.destroy();
    }

    let seenArgWithWasm: Record<string, unknown> | undefined;
    const customWasmUrl = `${WASM_URL}?factory=1`;
    const factoryWithWasm = new HavokPhysics({
      wasmUrl: customWasmUrl,
      havokFactory: (moduleArg) => {
        seenArgWithWasm = moduleArg;
        return Promise.resolve(sharedRawModule);
      }
    });
    try {
      await factoryWithWasm.initialize();
      const locateFile = seenArgWithWasm?.locateFile as ((path: string) => string) | undefined;
      expect(typeof locateFile).toBe("function");
      expect(locateFile!("HavokPhysics.wasm")).toBe(customWasmUrl);
      verifySceneRaycast(factoryWithWasm);
    } finally {
      factoryWithWasm.destroy();
    }

    const fromInstance = new HavokPhysics({ havokInstance: sharedRawModule });
    try {
      await fromInstance.initialize();
      verifySceneRaycast(fromInstance);
    } finally {
      fromInstance.destroy();
    }
  });

  it("rejects bad jsUrl with Error, cleans up the failed script tag, and allows retry", async () => {
    const havok = new HavokPhysics({ jsUrl: BAD_JS_URL });

    const firstErr = await havok.initialize().catch((error: unknown) => error);
    expect(firstErr).toBeInstanceOf(Error);
    expect(document.querySelectorAll(`script[src*="__nonexistent_havok_loader__"]`).length).toBe(0);

    // State must have reset to Uninitialized so a retry actually attempts loading again.
    const secondErr = await havok.initialize().catch((error: unknown) => error);
    expect(secondErr).toBeInstanceOf(Error);
    expect(document.querySelectorAll(`script[src*="__nonexistent_havok_loader__"]`).length).toBe(0);

    // Verify a custom jsUrl that omits global `HavokPhysics` rejects without being masked by the prior global factory.
    const globalObj = globalThis as Record<string, unknown>;
    const previousFactory = globalObj.HavokPhysics;
    expect(typeof previousFactory).toBe("function");
    const emptyBlobUrl = URL.createObjectURL(new Blob(["/* empty */"], { type: "text/javascript" }));
    const missingGlobal = new HavokPhysics({ jsUrl: emptyBlobUrl });
    try {
      await expect(missingGlobal.initialize()).rejects.toThrow(/HavokPhysics/i);
      expect(document.querySelectorAll(`script[src="${emptyBlobUrl}"]`).length).toBe(0);
      expect(globalObj.HavokPhysics).toBe(previousFactory);
    } finally {
      URL.revokeObjectURL(emptyBlobUrl);
      globalObj.HavokPhysics = previousFactory;
    }

    // Verify a synchronous throw inside a script-loaded or cached global factory rejects cleanly and resets state.
    const throwingBlobUrl = URL.createObjectURL(
      new Blob(['globalThis.HavokPhysics = function() { throw new Error("sync global factory error"); };'], {
        type: "text/javascript"
      })
    );
    const syncThrow = new HavokPhysics({ jsUrl: throwingBlobUrl });
    try {
      await expect(syncThrow.initialize()).rejects.toThrow("sync global factory error");
      // Second call exercises the cached-global reuse path and must also reject instead of throwing synchronously.
      await expect(syncThrow.initialize()).rejects.toThrow("sync global factory error");
    } finally {
      URL.revokeObjectURL(throwingBlobUrl);
      globalObj.HavokPhysics = previousFactory;
      document.querySelectorAll(`script[src="${throwingBlobUrl}"]`).forEach((node) => node.remove());
    }
  });

  it("rejects with a WebAssembly SIMD error when SIMD is unsupported and recovers after restore", async () => {
    const simdSpy = vi.spyOn(SystemInfo, "_detectSIMDSupported").mockReturnValue(false);
    const havok = new HavokPhysics({ havokInstance: sharedRawModule });
    try {
      await expect(havok.initialize()).rejects.toThrow(/WebAssembly SIMD/i);
      simdSpy.mockRestore();

      await havok.initialize();
      verifySceneRaycast(havok);
    } finally {
      simdSpy.mockRestore();
      havok.destroy();
    }
  });

  it("handles pre-init destroy, double destroy, active-scene/scratch-world destroy + reinit, and in-flight invalidation", async () => {
    // Pre-init destroy + double destroy + subsequent init
    const preInit = new HavokPhysics({ havokInstance: sharedRawModule });
    expect(() => preInit.destroy()).not.toThrow();
    expect(() => preInit.destroy()).not.toThrow();
    await preInit.initialize();
    verifySceneRaycast(preInit);
    preInit.destroy();
    expect(() => preInit.destroy()).not.toThrow();

    // Active scene + _scratchWorld (pointDistance) + custom layer matrix -> destroy() -> re-initialize()
    const reinit = new HavokPhysics({ havokInstance: sharedRawModule });
    await reinit.initialize();
    reinit.setColliderLayerCollision(0, 1, false);
    expect(reinit.getColliderLayerCollision(0, 1)).toBe(false);

    const activeScene = reinit.createPhysicsScene();
    const mat1 = createDefaultMaterial(reinit);
    const cubePositions = [
      new Vector3(-1, -1, -1),
      new Vector3(1, -1, -1),
      new Vector3(1, 1, -1),
      new Vector3(-1, 1, -1),
      new Vector3(-1, -1, 1),
      new Vector3(1, -1, 1),
      new Vector3(1, 1, 1),
      new Vector3(-1, 1, 1)
    ];
    const convex1 = reinit.createMeshColliderShape(10, cubePositions, null, true, mat1, 0)!;
    expect(convex1).not.toBeNull();
    const staticCol1 = reinit.createStaticCollider(new Vector3(0, 0, 0), new Quaternion(0, 0, 0, 1));
    staticCol1.addShape(convex1);
    activeScene.addCollider(staticCol1);

    // Also verify active dynamic collider + joint + CharacterController teardown and in-scene collider.destroy() safety
    const transientCol = reinit.createStaticCollider(new Vector3(10, 0, 0), new Quaternion(0, 0, 0, 1));
    const transientShape = reinit.createBoxColliderShape(12, new Vector3(1, 1, 1), mat1);
    transientCol.addShape(transientShape);
    activeScene.addCollider(transientCol);
    expect(() => transientCol.destroy()).not.toThrow();
    transientShape.destroy();
    expect(() => activeScene.update(1 / 60)).not.toThrow();

    const dynCol = reinit.createDynamicCollider(new Vector3(0, 5, 0), new Quaternion(0, 0, 0, 1));
    const dynShape = reinit.createBoxColliderShape(13, new Vector3(1, 1, 1), mat1);
    dynCol.addShape(dynShape);
    dynCol.setConstraints(1);
    activeScene.addCollider(dynCol);
    const activeJoint = reinit.createFixedJoint(dynCol);

    const activeCct = reinit.createCharacterController(14, mat1);
    activeCct.setBox(new Vector3(0.5, 0.5, 0.5));
    activeScene.addCharacterController(activeCct);
    const hkModule = sharedRawModule as {
      HP_Body_Release: (id: unknown) => unknown;
      HP_Shape_Release: (id: unknown) => unknown;
    };
    const bodyReleaseSpy = vi.spyOn(hkModule, "HP_Body_Release");
    const shapeReleaseSpy = vi.spyOn(hkModule, "HP_Shape_Release");

    // Lazily allocates _scratchWorld / _scratchBody / _scratchCollector (flat +Y face at y=1 -> dist 2, dist^2 = 4)
    const distBefore = convex1.pointDistance(new Vector3(0, 3, 0));
    expect(distBefore.w).toBeCloseTo(4, 3);

    // Destroy backend while scene, colliders, joint, CCT & scratch world are active, then re-initialize
    reinit.destroy();
    expect(() => reinit.destroy()).not.toThrow();
    // Active CCT (body + proxy shape + swept shape) + world anchor + scratch body must be released on teardown
    expect(bodyReleaseSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(shapeReleaseSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    bodyReleaseSpy.mockRestore();
    shapeReleaseSpy.mockRestore();

    // Destroying orphaned wrappers after havok.destroy() must be a safe no-op
    expect(() => activeCct.destroy()).not.toThrow();
    expect(() => activeJoint.destroy()).not.toThrow();
    expect(() => dynCol.destroy()).not.toThrow();
    expect(() => dynShape.destroy()).not.toThrow();
    expect(() => staticCol1.destroy()).not.toThrow();
    expect(() => convex1.destroy()).not.toThrow();
    expect(() => mat1.destroy()).not.toThrow();

    await reinit.initialize();
    expect(reinit.getColliderLayerCollision(0, 1)).toBe(true);
    verifySceneRaycast(reinit);
    // Verify _scratchWorld can be recreated cleanly after re-initialization
    const mat2 = createDefaultMaterial(reinit);
    const convex2 = reinit.createMeshColliderShape(11, cubePositions, null, true, mat2, 0)!;
    const distAfter = convex2.pointDistance(new Vector3(0, 3, 0));
    expect(distAfter.w).toBeCloseTo(4, 3);
    convex2.destroy();
    mat2.destroy();
    reinit.destroy();

    // In-flight initialize() invalidated by destroy()
    let resolveFactory!: (value: unknown) => void;
    const pendingModule = new Promise((resolve) => {
      resolveFactory = resolve;
    });
    let factoryCalls = 0;
    const options: HavokRuntimeOptions = {
      havokFactory: () => {
        factoryCalls++;
        return factoryCalls === 1 ? pendingModule : Promise.resolve(sharedRawModule);
      }
    };
    const inFlight = new HavokPhysics(options);
    const firstInit = inFlight.initialize();
    await Promise.resolve();
    inFlight.destroy();
    resolveFactory(sharedRawModule);
    await expect(firstInit).rejects.toThrow(/destroy/i);

    // Must still be able to initialize cleanly afterwards
    await inFlight.initialize();
    verifySceneRaycast(inFlight);
    inFlight.destroy();
  });
});

describe("HavokPhysics simulation, queries, character controller, events & joints", () => {
  let engine: WebGLEngine;
  let physics: PhysicsScene;
  let havokBackend: HavokPhysics;
  let root: Entity;

  beforeAll(async () => {
    havokBackend = new HavokPhysics();
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      physics: havokBackend
    });
    physics = engine.sceneManager.activeScene.physics;
  });

  beforeEach(() => {
    root = engine.sceneManager.activeScene.createRootEntity("havok-tests");
    physics.gravity = new Vector3(0, -9.81, 0);
    physics.fixedTimeStep = 1 / 60;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    root.destroy();
    physics.setColliderLayerCollision(Layer.Layer0, Layer.Layer1, true);
    physics.setColliderLayerCollision(Layer.Layer0, Layer.Layer2, true);
    engine.resourceManager.gc();
  });

  afterAll(() => {
    engine.destroy();
    havokBackend.destroy();
  });

  function step(count = 1): void {
    for (let i = 0; i < count; i++) {
      physics._update(physics.fixedTimeStep);
    }
  }

  function addBox(size: Vector3, position: Vector3, dynamic = false, kinematic = false): Entity {
    const entity = root.createChild("box");
    entity.transform.setPosition(position.x, position.y, position.z);
    const collider = entity.addComponent(BoxCollider);
    collider.size = size;
    if (dynamic) {
      const body = entity.addComponent(Rigidbody);
      body.isKinematic = kinematic;
    }
    return entity;
  }

  describe("query-shape cache, GC & quaternion normalization", () => {
    it("evicts query shapes FIFO above 64 unique dimensions and releases caches on gc()", () => {
      const targetEntity = addBox(new Vector3(2, 2, 2), new Vector3(0, 0, 0));
      const targetCollider = targetEntity.getComponent(BoxCollider);
      const nativeScene = (physics as unknown as { _nativePhysicsScene: Record<string, Map<unknown, unknown>> })
        ._nativePhysicsScene;
      const hit = new HitResult();

      // Exceed MAX_QUERY_SHAPE_CACHE (64) across box, sphere, and capsule query caches
      for (let i = 0; i < 80; i++) {
        const d = 0.2 + i * 0.01;
        expect(physics.overlapBoxAll(new Vector3(0, 0, 0), new Vector3(d, d, d))).toContain(targetCollider);
        expect(physics.overlapSphereAll(new Vector3(0, 0, 0), d)).toContain(targetCollider);
        expect(physics.overlapCapsuleAll(new Vector3(0, 0, 0), d * 0.5, d)).toContain(targetCollider);
      }

      expect(nativeScene._boxQueryCache.size).toBe(64);
      expect(nativeScene._sphereQueryCache.size).toBe(64);
      expect(nativeScene._capsuleQueryCache.size).toBe(64);

      // Re-querying the oldest evicted dimensions recreates shapes cleanly without exceeding cap
      expect(physics.boxCast(new Vector3(-5, 0, 0), new Vector3(0.2, 0.2, 0.2), new Vector3(1, 0, 0), 20, hit)).toBe(
        true
      );
      expect(hit.collider).toBe(targetCollider);
      expect(physics.sphereCast(new Vector3(-5, 0, 0), 0.2, new Vector3(1, 0, 0), 20, hit)).toBe(true);
      expect(hit.collider).toBe(targetCollider);
      expect(physics.capsuleCast(new Vector3(-5, 0, 0), 0.1, 0.2, new Vector3(1, 0, 0), 20, hit)).toBe(true);
      expect(hit.collider).toBe(targetCollider);
      expect(nativeScene._boxQueryCache.size).toBe(64);
      expect(nativeScene._sphereQueryCache.size).toBe(64);
      expect(nativeScene._capsuleQueryCache.size).toBe(64);

      // Engine GC must flush all cached query shapes, and subsequent queries must still succeed
      engine.resourceManager.gc();
      expect(nativeScene._boxQueryCache.size).toBe(0);
      expect(nativeScene._sphereQueryCache.size).toBe(0);
      expect(nativeScene._capsuleQueryCache.size).toBe(0);

      expect(physics.overlapBoxAll(new Vector3(0, 0, 0), new Vector3(0.5, 0.5, 0.5))).toContain(targetCollider);
      expect(physics.overlapSphereAll(new Vector3(0, 0, 0), 0.5)).toContain(targetCollider);
      expect(physics.overlapCapsuleAll(new Vector3(0, 0, 0), 0.5, 1)).toContain(targetCollider);
      expect(physics.boxCast(new Vector3(-5, 0, 0), new Vector3(0.5, 0.5, 0.5), new Vector3(1, 0, 0), 20, hit)).toBe(
        true
      );
      expect(hit.collider).toBe(targetCollider);
    });

    it("normalizes non-unit quaternions and handles zero quaternions safely without stale scratch leaks", () => {
      // Narrow bar aligned along X: rotated 90 deg around Y would miss when probing along X edge
      const targetEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));
      const targetCollider = targetEntity.getComponent(BoxCollider);

      const rotated = new Quaternion();
      Quaternion.rotationYawPitchRoll(Math.PI / 4, 0, 0, rotated);
      const nonUnit = new Quaternion(0, 2, 0, 2);
      const zeroQuat = new Quaternion(0, 0, 0, 0);
      const hit = new HitResult();

      // Prime internal _tempQuat with a non-identity rotation, then pass zeroQuat
      expect(
        physics.boxCast(
          new Vector3(-5, 0, 0),
          new Vector3(0.5, 0.5, 0.5),
          new Vector3(1, 0, 0),
          nonUnit,
          20,
          Layer.Everything,
          hit
        )
      ).toBe(true);
      expect(hit.collider).toBe(targetCollider);
      expect(physics.overlapBoxAll(new Vector3(0, 0, 0), new Vector3(0.5, 0.5, 0.5), nonUnit)).toContain(
        targetCollider
      );
      expect(physics.overlapCapsuleAll(new Vector3(0, 0, 0), 0.5, 1, nonUnit)).toContain(targetCollider);

      // Zero quaternion after rotated query must fall back to identity instead of leaking stale _tempQuat
      physics.overlapBoxAll(new Vector3(0, 0, 0), new Vector3(2, 0.2, 0.2), rotated);
      // A thin box along X (halfExtents 2, 0.2, 0.2) centered at (2.2, 0, 0) touches target [-0.5, 0.5] ONLY if identity (unrotated)
      expect(physics.overlapBoxAll(new Vector3(2.2, 0, 0), new Vector3(2, 0.2, 0.2), zeroQuat)).toContain(
        targetCollider
      );
      expect(
        physics.boxCast(
          new Vector3(-5, 0, 0),
          new Vector3(0.5, 0.5, 0.5),
          new Vector3(1, 0, 0),
          zeroQuat,
          20,
          Layer.Everything,
          hit
        )
      ).toBe(true);
      expect(hit.collider).toBe(targetCollider);
      expect(
        physics.capsuleCast(new Vector3(-5, 0, 0), 0.3, 1, new Vector3(1, 0, 0), zeroQuat, 20, Layer.Everything, hit)
      ).toBe(true);
      expect(hit.collider).toBe(targetCollider);

      // Kinematic Rigidbody.move() with non-unit and zero quaternions
      const mover = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0), true, true);
      const body = mover.getComponent(Rigidbody);
      body.move(new Vector3(0, 5, 0), nonUnit);
      step();
      expect(mover.transform.rotationQuaternion.length()).toBeCloseTo(1, 4);
      const savedRot = mover.transform.rotationQuaternion.clone();

      // 1-arg zero quaternion preserves current orientation
      body.move(zeroQuat);
      step();
      expect(mover.transform.rotationQuaternion.length()).toBeCloseTo(1, 4);
      expect(Math.abs(Quaternion.dot(mover.transform.rotationQuaternion, savedRot))).toBeCloseTo(1, 4);

      // 2-arg zero quaternion resets safely to identity
      body.move(new Vector3(1, 6, 0), zeroQuat);
      step();
      expect(mover.transform.position.x).toBeCloseTo(1, 4);
      expect(mover.transform.position.y).toBeCloseTo(6, 4);
      expect(mover.transform.rotationQuaternion.length()).toBeCloseTo(1, 4);
      expect(Math.abs(mover.transform.rotationQuaternion.w)).toBeCloseTo(1, 4);
    });
  });

  describe("MeshCollider", () => {
    it("simulates a dynamic convex MeshCollider landing on a static triangle-mesh floor", () => {
      const floor = root.createChild("floor");
      const floorMesh = floor.addComponent(MeshCollider);
      floorMesh.convex = false;
      floorMesh.mesh = createModelMesh(engine, [-10, 0, -10, 10, 0, -10, -10, 0, 10, 10, 0, 10], [0, 2, 1, 1, 2, 3]);

      const falling = root.createChild("convex-body");
      falling.transform.setPosition(0, 3, 0);
      const convex = falling.addComponent(MeshCollider);
      convex.convex = true;
      convex.mesh = createModelMesh(engine, [0, 0.5, 0, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0, -0.5, 0.5]);
      falling.addComponent(Rigidbody);
      const recorder = falling.addComponent(EventRecorder);

      step(120);
      expect(falling.transform.position.y).toBeLessThan(3);
      expect(falling.transform.position.y).toBeGreaterThan(0.2);
      expect(recorder.onCollisionEnter).toHaveBeenCalled();
    });

    it("deduplicates raycastAll to 1 closest hit per triangle MeshCollider", () => {
      const meshEntity = root.createChild("tri-cube");
      const meshCollider = meshEntity.addComponent(MeshCollider);
      meshCollider.convex = false;
      meshCollider.mesh = createCubeMesh(engine, 1);

      const backBox = addBox(new Vector3(1, 1, 1), new Vector3(5, 0, 0)).getComponent(BoxCollider);

      const hits: HitResult[] = [];
      const found = physics.raycastAll(
        new Ray(new Vector3(-5, 0, 0), new Vector3(1, 0, 0)),
        50,
        Layer.Everything,
        hits
      );
      expect(found).toBe(true);
      expect(hits).toHaveLength(2);

      const meshHits = hits.filter((h) => h.collider === meshCollider);
      const boxHits = hits.filter((h) => h.collider === backBox);
      expect(meshHits).toHaveLength(1);
      expect(boxHits).toHaveLength(1);
      // Entry face of [-1, 1] cube from x = -5 is at x = -1 -> distance 4 (not far face at distance 6)
      expect(meshHits[0].distance).toBeCloseTo(4, 3);
      expect(meshHits[0].point.x).toBeCloseTo(-1, 3);
    });

    it("returns -1 for getClosestPoint on non-convex MeshCollider and exact distance on convex", () => {
      const entity = root.createChild("mesh");
      const collider = entity.addComponent(MeshCollider);
      collider.convex = false;
      collider.mesh = createCubeMesh(engine, 1);

      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const out = new Vector3(7, 8, 9);
      expect(collider.getClosestPoint(new Vector3(5, 0, 0), out)).toBe(-1);
      expect(errors).toHaveBeenCalledOnce();
      expect(out.x).toBe(7);
      expect(out.y).toBe(8);
      expect(out.z).toBe(9);

      collider.convex = true;
      expect(collider.getClosestPoint(new Vector3(5, 0, 0), out)).toBeCloseTo(4, 3);
      expect(out.x).toBeCloseTo(1, 3);
      expect(out.y).toBeCloseTo(0, 3);
      expect(out.z).toBeCloseTo(0, 3);
      expect(collider.getClosestPoint(new Vector3(0, 0, 0), out)).toBe(0);
    });

    it("preserves trigger continuity across live convex/mesh swaps without hanging WASM", () => {
      const meshEntity = root.createChild("mesh");
      const collider = meshEntity.addComponent(MeshCollider);
      collider.convex = true;
      collider.mesh = createCubeMesh(engine, 1);

      const probe = root.createChild("trigger-probe");
      probe.transform.setPosition(0, 1.5, 0);
      const sphere = probe.addComponent(SphereCollider);
      sphere.radius = 1;
      sphere.isTrigger = true;
      probe.addComponent(Rigidbody).isKinematic = true;
      const recorder = probe.addComponent(EventRecorder);

      step(2);
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      expect(recorder.onTriggerExit).not.toHaveBeenCalled();

      // Swap convex -> triangle -> convex and replace mesh while overlapping
      collider.convex = false;
      step(2);
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      expect(recorder.onTriggerExit).not.toHaveBeenCalled();

      const stayBefore = recorder.onTriggerStay.mock.calls.length;
      collider.mesh = createCubeMesh(engine, 1.1);
      collider.convex = true;
      step(2);
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      expect(recorder.onTriggerExit).not.toHaveBeenCalled();
      expect(recorder.onTriggerStay.mock.calls.length).toBeGreaterThan(stayBefore);

      // Shrink mesh so overlap ends cleanly with a single Exit
      collider.mesh = createCubeMesh(engine, 0.2);
      step(2);
      expect(recorder.onTriggerExit).toHaveBeenCalledOnce();
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
    });
  });

  describe("CharacterController", () => {
    let role: Entity;
    let controller: CharacterController;

    function addPlane(position: Vector3, rotation: Quaternion): Entity {
      const entity = root.createChild("plane");
      entity.transform.position = position;
      entity.transform.rotationQuaternion = rotation;
      entity.addComponent(PlaneCollider);
      return entity;
    }

    function move(disp: Vector3): number {
      return controller.move(disp, 0.0001, physics.fixedTimeStep);
    }

    function walkTo(target: Vector3, steps: number): void {
      const disp = target
        .clone()
        .subtract(role.transform.position)
        .scale(1 / steps);
      let fallingTime = 0;
      for (let i = 0; i < steps; i++) {
        const flags = move(disp);
        if (flags & ControllerCollisionFlag.Down) {
          fallingTime = 0;
        } else {
          fallingTime += physics.fixedTimeStep;
          move(new Vector3(0, -9.8 * physics.fixedTimeStep * fallingTime, 0));
        }
      }
    }

    beforeEach(() => {
      role = root.createChild("role");
      controller = role.addComponent(CharacterController);
      addPlane(new Vector3(), new Quaternion());
    });

    it("supports capsule and box geometry with immediate contactOffset skin updates", () => {
      // Capsule default: radius 0.5, height 1, contactOffset 0.02 -> half-extent Y = 1.0 + 0.02 = 1.02
      controller.geometry = CharacterControllerGeometry.Capsule;
      role.transform.setPosition(0, 5, 0);
      expect(Boolean(move(new Vector3(0, -10, 0)) & ControllerCollisionFlag.Down)).toBe(true);
      expect(role.transform.position.y).toBeCloseTo(1.02, 3);

      // Switch to Box (1x1x1) and adjust contactOffset
      controller.geometry = CharacterControllerGeometry.Box;
      role.transform.setPosition(0, 5, 0);
      expect(Boolean(move(new Vector3(0, -10, 0)) & ControllerCollisionFlag.Down)).toBe(true);
      expect(role.transform.position.y).toBeCloseTo(0.52, 3);

      controller.contactOffset = 0.5;
      move(new Vector3(0, 0, 0.1));
      move(new Vector3(0, 0, 0.1));
      expect(role.transform.position.y).toBeCloseTo(1.0, 3);
    });

    it("respects slopeLimit, stepOffset, and upDirection", () => {
      controller.geometry = CharacterControllerGeometry.Box;

      // slopeLimit: 40-deg ramp climbable at 45 deg, blocked at 1 deg
      const ramp = addPlane(new Vector3(0, 0, 2), new Quaternion().rotateX((-40 * Math.PI) / 180));
      controller.slopeLimit = 45;
      walkTo(new Vector3(0, 0, 3), 50);
      expect(role.transform.position.z).toBeCloseTo(3, 3);

      role.transform.setPosition(0, 0.6, 0);
      controller.slopeLimit = 1;
      walkTo(new Vector3(0, 0, 3), 50);
      expect(role.transform.position.z).toBeLessThan(2);
      ramp.destroy();

      // stepOffset: 1-unit obstacle stepped over at stepOffset = 1, blocked at 0.5
      const obstacle = addBox(new Vector3(1, 1, 1), new Vector3(0, 0.5, 3));
      controller.slopeLimit = 45;
      role.transform.setPosition(0, 0.6, 0);
      controller.stepOffset = 0.5;
      walkTo(new Vector3(0, 0, 3), 2);
      expect(role.transform.position.z).toBeLessThan(2);
      expect(role.transform.position.y).toBeLessThan(1);

      role.transform.setPosition(0, 0.6, 0);
      controller.stepOffset = 1;
      walkTo(new Vector3(0, 0, 3), 2);
      expect(role.transform.position.z).toBeCloseTo(3, 3);
      expect(role.transform.position.y).toBeGreaterThan(1);
      obstacle.destroy();

      // upDirection flip: floor becomes ceiling when upDirection is -Y
      role.transform.setPosition(0, 0, 0);
      controller.stepOffset = 0.5;
      expect(move(new Vector3(0, 0, 0.5)) & ControllerCollisionFlag.Down).toBe(ControllerCollisionFlag.Down);
      controller.upDirection = new Vector3(0, -1, 0);
      expect(move(new Vector3(0, 0, 0.5)) & ControllerCollisionFlag.Up).toBe(ControllerCollisionFlag.Up);
      controller.upDirection.set(0, 1, 0);
      expect(move(new Vector3(0, -0.1, 0)) & ControllerCollisionFlag.Down).toBe(ControllerCollisionFlag.Down);

      // nonWalkableMode: PreventClimbing vs PreventClimbingAndForceSliding on a steep 45-deg slope
      const steepSlope = addPlane(new Vector3(0, 0, 2), new Quaternion().rotateX(-Math.PI / 4));
      controller.slopeLimit = 1;
      controller.nonWalkableMode = ControllerNonWalkableMode.PreventClimbing;
      role.transform.setPosition(0, 0, 0);
      walkTo(new Vector3(0, 0.02, 3), 50);
      expect(role.transform.position.y).toBeGreaterThan(1);

      controller.nonWalkableMode = ControllerNonWalkableMode.PreventClimbingAndForceSliding;
      role.transform.setPosition(0, 0, 0);
      walkTo(new Vector3(0, 0.02, 3), 50);
      expect(role.transform.position.y).toBeLessThan(1);
      steepSlope.destroy();
    });

    it("refreshes broadphase immediately for raycast after live teleport without stepping the world", () => {
      role.transform.setPosition(0, 2, 0);
      controller.collisionLayer = Layer.Layer3;

      const hit = new HitResult();
      expect(physics.raycast(new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0)), 20, Layer.Layer3, hit)).toBe(true);
      expect(hit.collider).toBe(controller);

      // Teleport without calling physics._update()
      role.transform.setPosition(8, 2, 0);
      expect(physics.raycast(new Ray(new Vector3(8, 10, 0), new Vector3(0, -1, 0)), 20, Layer.Layer3, hit)).toBe(true);
      expect(hit.collider).toBe(controller);
      expect(hit.point.x).toBeCloseTo(8, 3);
      expect(physics.raycast(new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0)), 20, Layer.Layer3)).toBe(false);
    });

    it("recovers from invalid stepOffset at updated position without unrelated setter error spam", () => {
      const entity = root.createChild("recovering-controller");
      entity.transform.setPosition(0, 5, 0);
      const cc = entity.addComponent(CharacterController);
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});

      cc.stepOffset = 10;
      step();
      const errorCountAfterInvalid = errors.mock.calls.length;
      expect(errorCountAfterInvalid).toBeGreaterThan(0);

      // Unrelated setters must not retry native creation or spam errors
      cc.collisionLayer = Layer.Layer3;
      cc.isSceneQuery = true;
      cc.slopeLimit = 30;
      cc.nonWalkableMode = ControllerNonWalkableMode.PreventClimbingAndForceSliding;
      expect(errors.mock.calls.length).toBe(errorCountAfterInvalid);

      entity.transform.setPosition(8, 2, 0);
      cc.stepOffset = 0.5;

      const hit = new HitResult();
      expect(physics.raycast(new Ray(new Vector3(8, 10, 0), new Vector3(0, -1, 0)), 20, Layer.Layer3, hit)).toBe(true);
      expect(hit.collider).toBe(cc);
      expect(hit.point.x).toBeCloseTo(8, 3);
      expect(physics.raycast(new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0)), 20, Layer.Layer3)).toBe(false);

      cc.move(new Vector3(0.2, 0, 0), 0.0001, physics.fixedTimeStep);
      expect(entity.transform.position.x).toBeGreaterThan(8.1);
    });
  });

  describe("trigger & contact lifecycle", () => {
    it("dispatches dynamic-dynamic contact Enter, Stay, and Exit with valid contact points", () => {
      physics.gravity = new Vector3(0, 0, 0);
      const boxA = addBox(new Vector3(1, 1, 1), new Vector3(-2, 0, 0), true, false);
      const boxB = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0), true, false);
      const bodyA = boxA.getComponent(Rigidbody);
      const colliderA = boxA.getComponent(BoxCollider);
      const colliderB = boxB.getComponent(BoxCollider);

      const contactCounts: number[] = [];
      let enterOther: Collider | null = null;
      let enterSelf: Collider | null = null;
      let enterCount = 0;
      let stayCount = 0;
      let exitCount = 0;

      boxA.addComponent(
        class extends Script {
          onCollisionEnter(other: Collision): void {
            enterCount++;
            enterOther = other.collider;
            enterSelf = other.selfCollider;
            const contacts: ContactPoint[] = [];
            expect(other.getContacts(contacts)).toBe(other.contactCount);
            contactCounts.push(contacts.length);
            expect(Number.isFinite(contacts[0].position.x)).toBe(true);
            expect(Number.isFinite(contacts[0].normal.x)).toBe(true);
          }
          onCollisionStay(): void {
            stayCount++;
          }
          onCollisionExit(): void {
            exitCount++;
          }
        }
      );

      // Push A gently into B and maintain contact for Stay
      for (let i = 0; i < 20 && stayCount === 0; i++) {
        bodyA.applyForce(new Vector3(30, 0, 0));
        step();
      }
      expect(enterCount).toBe(1);
      expect(enterOther).toBe(colliderB);
      expect(enterSelf).toBe(colliderA);
      expect(contactCounts[0]).toBeGreaterThan(0);
      expect(stayCount).toBeGreaterThan(0);

      // Separate cleanly for Exit
      bodyA.linearVelocity = new Vector3(-20, 0, 0);
      for (let i = 0; i < 10 && exitCount === 0; i++) {
        step();
      }
      expect(exitCount).toBe(1);
    });

    it("dispatches moved-kinematic vs static contact Enter, Stay, and Exit", () => {
      physics.gravity = new Vector3(0, 0, 0);
      const kinematic = addBox(new Vector3(1, 1, 1), new Vector3(-3, 0, 0), true, true);
      addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0), false, false);
      const body = kinematic.getComponent(Rigidbody);
      const recorder = kinematic.addComponent(EventRecorder);

      body.move(new Vector3(-0.2, 0, 0));
      step();
      expect(recorder.onCollisionEnter).toHaveBeenCalledOnce();

      step();
      expect(recorder.onCollisionStay).toHaveBeenCalled();
      expect(recorder.onCollisionExit).not.toHaveBeenCalled();

      body.move(new Vector3(-5, 0, 0));
      step();
      expect(recorder.onCollisionExit).toHaveBeenCalledOnce();
    });

    it("ref-counts multi-triangle mesh triggers cleanly through Enter -> Stay -> Exit", () => {
      const floor = root.createChild("multi-tri-mesh");
      const meshCollider = floor.addComponent(MeshCollider);
      meshCollider.convex = false;
      meshCollider.mesh = createSubdividedPlaneMesh(engine, 4, 4);

      const probe = root.createChild("sphere-trigger");
      probe.transform.setPosition(0, 3, 0);
      const sphere = probe.addComponent(SphereCollider);
      sphere.radius = 1.5;
      sphere.isTrigger = true;
      const body = probe.addComponent(Rigidbody);
      body.isKinematic = true;
      const recorder = probe.addComponent(EventRecorder);

      step();
      expect(recorder.onTriggerEnter).not.toHaveBeenCalled();

      // Move onto center of 4x4 grid so multiple triangles overlap simultaneously in one step
      body.move(new Vector3(0, 0.2, 0));
      step();
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      expect(recorder.onTriggerStay).not.toHaveBeenCalled();
      expect(recorder.onTriggerExit).not.toHaveBeenCalled();

      // Shift laterally while still overlapping other triangles (must Stay, never Exit prematurely)
      body.move(new Vector3(1.2, 0.2, 0));
      step();
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      expect(recorder.onTriggerStay).toHaveBeenCalledOnce();
      expect(recorder.onTriggerExit).not.toHaveBeenCalled();

      // Move completely clear of all triangles -> single Exit once sweep clears all triangle contacts
      body.move(new Vector3(0, 5, 0));
      step(2);
      expect(recorder.onTriggerExit).toHaveBeenCalledOnce();
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      // Additional step at rest emits no further Enter/Exit
      step();
      expect(recorder.onTriggerExit).toHaveBeenCalledOnce();
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
    });

    it("maintains trigger continuity on same-pose reparent and ends cleanly on layer change", () => {
      const parentA = root.createChild("parentA");
      parentA.addComponent(Rigidbody).isKinematic = true;
      const parentB = root.createChild("parentB");
      parentB.addComponent(Rigidbody).isKinematic = true;

      const child = parentA.createChild("child");
      const childBox = child.addComponent(BoxCollider);

      const probe = root.createChild("probe");
      const sphere = probe.addComponent(SphereCollider);
      sphere.isTrigger = true;
      probe.addComponent(Rigidbody).isKinematic = true;
      const recorder = probe.addComponent(EventRecorder);

      step(2);
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      expect(recorder.onTriggerExit).not.toHaveBeenCalled();

      // Reparent child to parentB at identical world position: stays overlapping without spurious Exit/Enter
      parentB.addChild(child);
      const stayBeforeReparent = recorder.onTriggerStay.mock.calls.length;
      step(2);
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      expect(recorder.onTriggerExit).not.toHaveBeenCalled();
      expect(recorder.onTriggerStay.mock.calls.length).toBeGreaterThan(stayBeforeReparent);

      // Disabling layer pair ends the trigger with a single Exit
      physics.setColliderLayerCollision(Layer.Layer0, Layer.Layer1, false);
      childBox.collisionLayer = Layer.Layer1;
      step(2);
      expect(recorder.onTriggerExit).toHaveBeenCalledOnce();
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
    });

    it("stops dispatching callbacks cleanly when a collider is synchronously destroyed inside trigger/collision handlers", () => {
      physics.gravity = new Vector3(0, 0, 0);

      // Trigger pair
      const triggerA = root.createChild("triggerA");
      triggerA.addComponent(BoxCollider).isTrigger = true;
      const triggerB = root.createChild("triggerB");
      triggerB.addComponent(BoxCollider);
      triggerB.addComponent(Rigidbody);

      const triggerFirst = vi.fn((self: Collider) => self.destroy());
      const triggerSecond = vi.fn();
      for (const entity of [triggerA, triggerB]) {
        entity.addComponent(
          class extends Script {
            onTriggerEnter(_other: Collider, self: Collider): void {
              triggerFirst(self);
            }
          }
        );
        entity.addComponent(
          class extends Script {
            onTriggerEnter(): void {
              triggerSecond();
            }
          }
        );
      }

      step();
      expect(triggerFirst).toHaveBeenCalledOnce();
      expect(triggerSecond).not.toHaveBeenCalled();

      // Collision pair
      const boxA = addBox(new Vector3(1, 1, 1), new Vector3(-0.9, 5, 0), true, false);
      boxA.getComponent(Rigidbody).linearVelocity = new Vector3(20, 0, 0);
      const boxB = addBox(new Vector3(1, 1, 1), new Vector3(0.9, 5, 0), true, false);

      const collisionFirst = vi.fn((collision: Collision) => collision.selfCollider.destroy());
      const collisionSecond = vi.fn();
      for (const entity of [boxA, boxB]) {
        entity.addComponent(
          class extends Script {
            onCollisionEnter(collision: Collision): void {
              collisionFirst(collision);
            }
          }
        );
        entity.addComponent(
          class extends Script {
            onCollisionEnter(): void {
              collisionSecond();
            }
          }
        );
      }

      for (let i = 0; i < 10 && collisionFirst.mock.calls.length === 0; i++) {
        step();
      }
      expect(collisionFirst).toHaveBeenCalledOnce();
      expect(collisionSecond).not.toHaveBeenCalled();
      expect(() => step()).not.toThrow();
    });
  });

  describe("Joints", () => {
    it("supports FixedJoint world-anchor, body-to-body, breakForce, and clone", () => {
      // World-anchored FixedJoint
      const worldBox = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0), true, false);
      const worldJoint = worldBox.addComponent(FixedJoint);
      worldJoint.automaticConnectedAnchor = false;
      worldJoint.connectedAnchor = new Vector3(1, 4, 1);
      step();
      expect(worldBox.transform.position.x).toBeCloseTo(1, 4);
      expect(worldBox.transform.position.y).toBeCloseTo(4, 4);
      expect(worldBox.transform.position.z).toBeCloseTo(1, 4);

      worldJoint.anchor = new Vector3(0, -0.5, 0);
      step();
      expect(worldBox.transform.position.y).toBeCloseTo(4.5, 4);

      // Body-to-body + breakForce + clone
      physics.gravity = new Vector3(0, -1, 0);
      const anchorEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 10, 0), true, true);
      const hanging = addBox(new Vector3(1, 1, 1), new Vector3(0, 7, 0), true, false);
      const hangingBody = hanging.getComponent(Rigidbody);
      const bodyJoint = anchorEntity.addComponent(FixedJoint);
      bodyJoint.connectedBody = hangingBody;
      bodyJoint.automaticConnectedAnchor = true;
      bodyJoint.breakForce = 10;

      step(60);
      expect(hanging.transform.position.y).toBeCloseTo(7, 3);
      expect(hangingBody.linearVelocity.y).toBeCloseTo(0, 3);

      // Clone keeps anchor intact independently
      const clonedAnchor = anchorEntity.clone();
      root.addChild(clonedAnchor);
      anchorEntity.isActive = false;
      step(60);
      expect(hanging.transform.position.y).toBeCloseTo(7, 3);

      // Lower breakForce below gravity load -> breaks and falls
      const clonedJoint = clonedAnchor.getComponent(FixedJoint);
      clonedJoint.breakForce = 0.5;
      hangingBody.wakeUp();
      step(60);
      expect(hangingBody.linearVelocity.y).toBeLessThan(0);

      // Joint added while Rigidbody is disabled must activate cleanly once Rigidbody enters the scene
      physics.gravity = new Vector3(0, -9.81, 0);
      const delayed = addBox(new Vector3(1, 1, 1), new Vector3(0, 10, 0), true, false);
      const delayedBody = delayed.getComponent(Rigidbody);
      delayedBody.enabled = false;
      const delayedJoint = delayed.addComponent(FixedJoint);
      delayedJoint.automaticConnectedAnchor = false;
      delayedJoint.connectedAnchor = new Vector3(0, 10, 0);
      delayedBody.enabled = true;
      step(60);
      expect(delayed.transform.position.y).toBeCloseTo(10, 3);

      // FixedJoint rigid projection must mark broadphase dirty for immediate raycast queries
      const projected = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0), true, false);
      const projectedCollider = projected.getComponent(BoxCollider);
      const projectedJoint = projected.addComponent(FixedJoint);
      projectedJoint.automaticConnectedAnchor = false;
      projectedJoint.connectedAnchor = new Vector3(50, 50, 50);
      step();
      expect(projected.transform.position.x).toBeCloseTo(50, 3);
      expect(projected.transform.position.y).toBeCloseTo(50, 3);
      expect(projected.transform.position.z).toBeCloseTo(50, 3);
      const hit = new HitResult();
      expect(physics.raycast(new Ray(new Vector3(50, 55, 50), new Vector3(0, -1, 0)), 20, Layer.Everything, hit)).toBe(
        true
      );
      expect(hit.collider).toBe(projectedCollider);
    });

    it("supports HingeJoint +X/-X antiparallel axes, transient zero axis, hard/soft limits, and motor", () => {
      physics.gravity = new Vector3(0, 0, 0);

      // +X vs -X antiparallel motor parity
      const posBox = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0), true, false);
      const posJoint = posBox.addComponent(HingeJoint);
      posJoint.axis = new Vector3(1, 0, 0);
      posJoint.motor = new JointMotor();
      posJoint.motor.targetVelocity = 4;
      posJoint.useMotor = true;

      const negBox = addBox(new Vector3(1, 1, 1), new Vector3(3, 5, 0), true, false);
      const negJoint = negBox.addComponent(HingeJoint);
      negJoint.axis = new Vector3(-1, 0, 0);
      negJoint.motor = new JointMotor();
      negJoint.motor.targetVelocity = 4;
      negJoint.useMotor = true;

      step();
      const posVelX = posBox.getComponent(Rigidbody).angularVelocity.x;
      const negVelX = negBox.getComponent(Rigidbody).angularVelocity.x;
      expect(posVelX * negVelX).toBeLessThan(0);
      expect(Math.abs(negVelX)).toBeCloseTo(Math.abs(posVelX), 3);

      // Transient zero axis must not corrupt orientation or subsequent axis assignment
      negJoint.axis.x = 0;
      negJoint.axis.z = 1;
      expect(negJoint.axis.z).toBeCloseTo(1, 5);
      step(5);
      expect(Number.isFinite(negBox.getComponent(Rigidbody).angularVelocity.z)).toBe(true);
      expect(Math.abs(negBox.getComponent(Rigidbody).angularVelocity.z)).toBeGreaterThan(0);

      // Hard limits clamp angle cleanly in both directions under sustained torque
      const limAnchor = addBox(new Vector3(1, 1, 1), new Vector3(8, 5, 0), true, true);
      const limArm = addBox(new Vector3(1, 1, 1), new Vector3(10, 5, 0), true, false);
      const limArmBody = limArm.getComponent(Rigidbody);
      const limJoint = limAnchor.addComponent(HingeJoint);
      limJoint.connectedBody = limArmBody;
      limJoint.automaticConnectedAnchor = true;
      limJoint.anchor = new Vector3(0.5, 0, 0);
      limJoint.axis = new Vector3(0, 1, 0);
      limJoint.useLimits = true;
      const limits = new JointLimits();
      limits.min = -30;
      limits.max = 30;
      limJoint.limits = limits;

      for (let i = 0; i < 30; i++) {
        limArmBody.applyTorque(new Vector3(0, 200, 0));
        step();
      }
      expect(limJoint.angle).toBeGreaterThan(25);
      expect(limJoint.angle).toBeLessThanOrEqual(32);

      for (let i = 0; i < 40; i++) {
        limArmBody.applyTorque(new Vector3(0, -200, 0));
        step();
      }
      expect(limJoint.angle).toBeLessThan(-25);
      expect(limJoint.angle).toBeGreaterThanOrEqual(-32);

      // Soft limits with spring stiffness/damping deflect beyond the limit under load and rebound once released
      const softAnchor = addBox(new Vector3(1, 1, 1), new Vector3(16, 5, 0), true, true);
      const softArm = addBox(new Vector3(1, 1, 1), new Vector3(18, 5, 0), true, false);
      const softArmBody = softArm.getComponent(Rigidbody);
      const softJoint = softAnchor.addComponent(HingeJoint);
      softJoint.connectedBody = softArmBody;
      softJoint.automaticConnectedAnchor = true;
      softJoint.anchor = new Vector3(0.5, 0, 0);
      softJoint.axis = new Vector3(0, 1, 0);
      softJoint.useLimits = true;
      softJoint.useSpring = true;
      const softLimits = new JointLimits();
      softLimits.min = -30;
      softLimits.max = 30;
      softLimits.stiffness = 120;
      softLimits.damping = 10;
      softJoint.limits = softLimits;

      let peakSoftAngle = 0;
      for (let i = 0; i < 30; i++) {
        softArmBody.applyTorque(new Vector3(0, 500, 0));
        step();
        peakSoftAngle = Math.max(peakSoftAngle, softJoint.angle);
      }
      expect(peakSoftAngle).toBeGreaterThan(35);

      step(60);
      expect(softJoint.angle).toBeLessThan(peakSoftAngle - 5);

      // Motor gearRatio + forceLimit + freeSpin
      const motorAnchor = addBox(new Vector3(1, 1, 1), new Vector3(-8, 5, 0), true, true);
      const motorArm = addBox(new Vector3(1, 1, 1), new Vector3(-7.5, 5, 0), true, false);
      const motorArmBody = motorArm.getComponent(Rigidbody);
      const motorJoint = motorAnchor.addComponent(HingeJoint);
      motorJoint.connectedBody = motorArmBody;
      motorJoint.anchor = new Vector3(0.5, 0, 0);
      motorJoint.axis = new Vector3(0, 1, 0);
      motorJoint.useMotor = true;
      const motor = new JointMotor();
      motor.targetVelocity = 20;
      motor.gearRatio = 2;
      motor.forceLimit = 0.05;
      motorJoint.motor = motor;

      step(5);
      const limitedVel = motorJoint.velocity;
      expect(limitedVel).toBeGreaterThan(0);
      expect(limitedVel).toBeLessThan(10);

      motor.forceLimit = Infinity;
      step(30);
      expect(motorJoint.velocity).toBeCloseTo(10, 1);

      // freeSpin avoids braking when already spinning faster than effective target velocity (10 rad/s; angularVelocity is deg/s)
      motor.freeSpin = true;
      motorArmBody.angularVelocity = new Vector3(0, 1200, 0);
      step(5);
      expect(motorJoint.velocity).toBeGreaterThan(15);

      motor.freeSpin = false;
      step(10);
      expect(motorJoint.velocity).toBeCloseTo(10, 1);

      // Disabling useMotor after it was active must stop driving the body
      motorJoint.useMotor = false;
      motorArmBody.angularVelocity = new Vector3(0, 0, 0);
      step(10);
      expect(Math.abs(motorJoint.velocity)).toBeLessThan(0.1);
    });

    it("supports SpringJoint minDistance, maxDistance, tolerance, stiffness, and damping", () => {
      physics.gravity = new Vector3(0, 0, 0);
      const anchor = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0), true, true);
      const mass = addBox(new Vector3(1, 1, 1), new Vector3(2, 5, 0), true, false);
      const body = mass.getComponent(Rigidbody);
      const joint = mass.addComponent(SpringJoint);
      joint.connectedBody = anchor.getComponent(Rigidbody);
      joint.automaticConnectedAnchor = false;
      joint.anchor = new Vector3(-0.5, 0, 0);
      joint.connectedAnchor = new Vector3(0.5, 0, 0);
      joint.stiffness = 10000;
      joint.damping = 100;
      joint.minDistance = 1;
      joint.maxDistance = 5;
      joint.tolerance = 0;

      // Initial anchor gap is 1.0 (inside [1, 5]) -> no motion
      step(30);
      expect(mass.transform.position.x).toBeCloseTo(2, 3);

      // Raising minDistance to 1.5 pushes mass outward (> 2)
      joint.minDistance = 1.5;
      body.wakeUp();
      step(30);
      expect(mass.transform.position.x).toBeGreaterThan(2.3);

      // Tolerance widens deadband so anchor gap of 1.0 with minDistance=1.1, tolerance=0.2 stays still
      mass.transform.setPosition(2, 5, 0);
      body.linearVelocity = new Vector3(0, 0, 0);
      joint.minDistance = 1.1;
      joint.tolerance = 0.2;
      body.wakeUp();
      step(30);
      expect(mass.transform.position.x).toBeCloseTo(2, 3);

      // Pull back within maxDistance when placed too far out
      mass.transform.setPosition(10, 5, 0);
      body.linearVelocity = new Vector3(0, 0, 0);
      joint.tolerance = 0;
      joint.maxDistance = 3;
      body.wakeUp();
      step(60);
      expect(mass.transform.position.x).toBeLessThan(6);

      // High damping suppresses velocity under force compared to low damping
      mass.transform.setPosition(2, 5, 0);
      body.linearVelocity = new Vector3(0, 0, 0);
      joint.minDistance = 1;
      joint.maxDistance = 5;
      joint.stiffness = 10;
      joint.damping = 1;
      body.applyForce(new Vector3(500, 0, 0));
      step(30);
      const lowDampSpeed = Math.abs(body.linearVelocity.x);

      mass.transform.setPosition(2, 5, 0);
      body.linearVelocity = new Vector3(0, 0, 0);
      joint.damping = 10000;
      body.applyForce(new Vector3(500, 0, 0));
      step(30);
      const highDampSpeed = Math.abs(body.linearVelocity.x);
      expect(highDampSpeed).toBeLessThan(lowDampSpeed);
    });
  });

  describe("Tier 2 C-ABI parity, Tier 1 fallback & regression coverage", () => {
    it("produces identical query, transform, CCT, trigger, and compound-collision results on Tier 2 C-ABI and Tier 1 Embind fallback", async () => {
      const rawModule = (havokBackend as unknown as { _hk: Record<string, unknown> })._hk;

      const runParitySuite = async (backend: HavokPhysics, expectRawAbi: boolean) => {
        await backend.initialize();
        try {
          const internalBackend = backend as unknown as { _useRawABI: boolean; _qTransformScratch: number };
          expect(internalBackend._useRawABI).toBe(expectRawAbi);
          expect(internalBackend._qTransformScratch > 0).toBe(expectRawAbi);

          const scene = backend.createPhysicsScene();
          const internalScene = scene as unknown as { _queryScratchPtr: number };
          expect(internalScene._queryScratchPtr > 0).toBe(expectRawAbi);

          const mat = createDefaultMaterial(backend);

          // Static compound body (2 boxes at x=-2 and x=+2, plus a trigger box at (-2, 1.4, 0) on Layer 2)
          // and an excluded-from-query blocker at x=-4
          const blockerShape = backend.createBoxColliderShape(101, new Vector3(1, 1, 1), mat);
          blockerShape.setIsSceneQuery(false);
          const blockerCol = backend.createStaticCollider(new Vector3(-4, 0, 0), new Quaternion(0, 0, 0, 1));
          blockerCol.addShape(blockerShape);
          scene.addCollider(blockerCol);

          const childA = backend.createBoxColliderShape(201, new Vector3(1, 1, 1), mat);
          childA.setLocalPose(new Vector3(-2, 0, 0), new Quaternion(0, 0, 0, 1));
          const childB = backend.createBoxColliderShape(202, new Vector3(1, 1, 1), mat);
          childB.setLocalPose(new Vector3(2, 0, 0), new Quaternion(0, 0, 0, 1));
          const childTrigger = backend.createBoxColliderShape(203, new Vector3(0.5, 0.5, 0.5), mat);
          childTrigger.setIsTrigger(true);
          childTrigger.setCollisionLayer(2);
          childTrigger.setLocalPose(new Vector3(-2, 1.4, 0), new Quaternion(0, 0, 0, 1));
          const compound = backend.createStaticCollider(new Vector3(0, 0, 0), new Quaternion(0, 0, 0, 1));
          compound.addShape(childA);
          compound.addShape(childB);
          compound.addShape(childTrigger);
          scene.addCollider(compound);

          // Dynamic falling box with non-identity rotation hitting compound childB at x=2
          const dynRotIn = new Quaternion(0.258819, 0.482963, -0.12941, 0.826659).normalize();
          const dynShape = backend.createBoxColliderShape(301, new Vector3(1, 1, 1), mat);
          const dynCol = backend.createDynamicCollider(new Vector3(2, 0.9, 0), dynRotIn);
          dynCol.addShape(dynShape);
          scene.addCollider(dynCol);
          scene.setContactEventEnabled(true);

          const round3 = (v: number) => Math.round(v * 1000) / 1000;
          const roundVec = (v: Vector3) => [round3(v.x), round3(v.y), round3(v.z)];

          // 1. getWorldTransform parity (position + non-identity quaternion)
          const pos = new Vector3();
          const rot = new Quaternion();
          dynCol.getWorldTransform(pos, rot);

          // 2. Raycast fast path (capacity=1), fallback path (hits !isSceneQuery blocker first, then childA),
          //    boolean check, and specific layerMask filtering (Layer 2 trigger only)
          let rayId = -1;
          let rayDist = -1;
          let rayPt: number[] = [];
          let rayNorm: number[] = [];
          const rayHit = scene.raycast(new Vector3(-6, 0, 0), new Vector3(1, 0, 0), 20, 0xffffffff, (id, d, p, n) => {
            rayId = id;
            rayDist = d;
            rayPt = roundVec(p);
            rayNorm = roundVec(n);
          });
          const rayBool = scene.raycast(new Vector3(-6, 0, 0), new Vector3(1, 0, 0), 20, 0xffffffff);
          const rayMiss = scene.raycast(new Vector3(0, 20, 0), new Vector3(1, 0, 0), 20, 0xffffffff);
          let layer2RayId = -1;
          scene.raycast(new Vector3(-6, 1.4, 0), new Vector3(1, 0, 0), 20, 1 << 2, (id) => {
            layer2RayId = id;
          });
          const layer3RayMiss = scene.raycast(new Vector3(-6, 1.4, 0), new Vector3(1, 0, 0), 20, 1 << 3);

          // 3. raycastAll (multi-hit + reentrant raycastAll inside callback)
          const allHits: Array<{ id: number; dist: number; pt: number[]; norm: number[] }> = [];
          let reentrantHits = 0;
          scene.raycastAll(new Vector3(-6, 0, 0), new Vector3(1, 0, 0), 20, 0xffffffff, (id, d, p, n) => {
            allHits.push({ id, dist: round3(d), pt: roundVec(p), norm: roundVec(n) });
            if (allHits.length === 1) {
              scene.raycastAll(new Vector3(-2, 5, 0), new Vector3(0, -1, 0), 10, 0xffffffff, () => {
                reentrantHits++;
              });
            }
          });
          allHits.sort((a, b) => a.id - b.id);

          // 4. sphereCast, boxCast, capsuleCast & overlap*All with non-identity query orientation
          const queryRot = new Quaternion();
          Quaternion.rotationYawPitchRoll(Math.PI / 6, 0.2, -0.1, queryRot);
          let sphereCastId = -1;
          let sphereCastDist = -1;
          let sphereCastNorm: number[] = [];
          scene.sphereCast(new Vector3(-6, 0, 0), 0.25, new Vector3(1, 0, 0), 20, 0xffffffff, (id, d, _p, n) => {
            sphereCastId = id;
            sphereCastDist = d;
            sphereCastNorm = roundVec(n);
          });
          let boxCastId = -1;
          let boxCastDist = -1;
          let boxCastPt: number[] = [];
          let boxCastNorm: number[] = [];
          scene.boxCast(
            new Vector3(-6, 0, 0),
            queryRot,
            new Vector3(0.2, 0.2, 0.2),
            new Vector3(1, 0, 0),
            20,
            0xffffffff,
            (id, d, p, n) => {
              boxCastId = id;
              boxCastDist = d;
              boxCastPt = roundVec(p);
              boxCastNorm = roundVec(n);
            }
          );
          let capsuleCastId = -1;
          let capsuleCastDist = -1;
          scene.capsuleCast(
            new Vector3(-6, 0, 0),
            0.2,
            0.4,
            queryRot,
            new Vector3(1, 0, 0),
            20,
            0xffffffff,
            (id, d) => {
              capsuleCastId = id;
              capsuleCastDist = d;
            }
          );
          const overlapSphere = Array.from(scene.overlapSphereAll(new Vector3(-2, 0, 0), 0.4, 0xffffffff));
          const overlapBox = Array.from(
            scene.overlapBoxAll(new Vector3(2, 0, 0), queryRot, new Vector3(0.4, 0.4, 0.4), 0xffffffff)
          ).sort((a, b) => a - b);
          const overlapCapsule = Array.from(
            scene.overlapCapsuleAll(new Vector3(-2, 0, 0), 0.2, 0.4, queryRot, 0xffffffff)
          );
          const overlapLayer2 = Array.from(scene.overlapSphereAll(new Vector3(-2, 1.4, 0), 0.4, 1 << 2));

          // 5. CharacterController depenetrate & castMove passing THROUGH childTrigger at y=1.4 to land on childA at y=0.5
          const cct = backend.createCharacterController(401, mat);
          cct.setBox(new Vector3(0.4, 0.4, 0.4));
          cct.setWorldPosition(new Vector3(-2, 2.2, 0));
          scene.addCharacterController(cct);
          const cctFlags = cct.move(new Vector3(0, -3, 0), 0.0001, 1 / 60);
          const cctPos = new Vector3();
          cct.getWorldPosition(cctPos);

          // 6. Compound collision & trigger event harvesting (multi-shape container path iterator + contact point details)
          const trigProbeShape = backend.createBoxColliderShape(302, new Vector3(0.2, 0.2, 0.2), mat);
          const trigProbeCol = backend.createDynamicCollider(new Vector3(-2, 1.5, 0), new Quaternion(0, 0, 0, 1));
          trigProbeCol.setUseGravity(false);
          trigProbeCol.addShape(trigProbeShape);
          scene.addCollider(trigProbeCol);
          scene.update(1 / 60);
          const events = scene.updateEvents();
          const contactDetails: Array<{
            ids: [number, number, number];
            count: number;
            pt0: number[];
            norm0: number[];
            imp0: number[];
            sep0: number;
          }> = [];
          for (let i = 0; i < events.contactEventCount; i++) {
            const ev = events.contactEvents[i];
            const contacts = ev.getContacts();
            const c0 = contacts.size() > 0 ? contacts.get(0) : null;
            contactDetails.push({
              ids: [ev.shape0Id, ev.shape1Id, ev.state],
              count: ev.contactCount,
              pt0: c0 ? roundVec(c0.position) : [],
              norm0: c0 ? roundVec(c0.normal) : [],
              imp0: c0 ? roundVec(c0.impulse) : [],
              sep0: c0 ? round3(c0.separation) : 0
            });
          }
          const triggerDetails = events.triggerEvents
            .map((ev) => [ev.index1, ev.index2, ev.dispatchState])
            .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

          scene.removeCharacterController(cct);
          cct.destroy();
          scene.removeCollider(trigProbeCol);
          scene.removeCollider(dynCol);
          scene.removeCollider(compound);
          scene.removeCollider(blockerCol);
          trigProbeCol.destroy();
          dynCol.destroy();
          compound.destroy();
          blockerCol.destroy();
          trigProbeShape.destroy();
          dynShape.destroy();
          childA.destroy();
          childB.destroy();
          childTrigger.destroy();
          blockerShape.destroy();
          mat.destroy();
          scene.destroy();

          return {
            pos: roundVec(pos),
            rot: [round3(rot.x), round3(rot.y), round3(rot.z), round3(rot.w)],
            rayHit,
            rayBool,
            rayMiss,
            rayId,
            rayDist: round3(rayDist),
            rayPt,
            rayNorm,
            layer2RayId,
            layer3RayMiss,
            allHits,
            reentrantHits,
            sphereCastId,
            sphereCastDist: round3(sphereCastDist),
            sphereCastNorm,
            boxCastId,
            boxCastDist: round3(boxCastDist),
            boxCastPt,
            boxCastNorm,
            capsuleCastId,
            capsuleCastDist: round3(capsuleCastDist),
            overlapSphere,
            overlapBox,
            overlapCapsule,
            overlapLayer2,
            cctFlags,
            cctY: round3(cctPos.y),
            contactDetails,
            triggerDetails
          };
        } finally {
          backend.destroy();
        }
      };

      // Bundled default HavokPhysics enables Tier 2 C-ABI; external havokInstance auto-falls back to Tier 1 Embind
      const tier2 = await runParitySuite(new HavokPhysics(), true);
      const tier1 = await runParitySuite(new HavokPhysics({ havokInstance: rawModule }), false);

      expect(tier2).toEqual(tier1);
      expect(tier2.rayHit).toBe(true);
      expect(tier2.rayBool).toBe(true);
      expect(tier2.rayMiss).toBe(false);
      expect(tier2.rayId).toBe(201);
      expect(tier2.rayDist).toBeCloseTo(3.5, 3);
      expect(tier2.layer2RayId).toBe(203);
      expect(tier2.layer3RayMiss).toBe(false);
      expect(tier2.allHits.map((h) => h.id)).toEqual([201, 202]);
      // Downward reentrant ray at x=-2 hits childTrigger (203), trigProbe (302), and childA (201)
      expect(tier2.reentrantHits).toBeGreaterThanOrEqual(2);
      expect(tier2.sphereCastId).toBe(201);
      expect(tier2.boxCastId).toBe(201);
      expect(tier2.capsuleCastId).toBe(201);
      expect(tier2.overlapSphere).toEqual([201]);
      expect(tier2.overlapBox).toEqual([202, 301]);
      expect(tier2.overlapCapsule).toEqual([201]);
      expect(tier2.overlapLayer2).toEqual([203]);
      // CCT passes straight through trigger at y=1.4 and lands on solid childA top (y = 0.5 + 0.4 + 0.02 = 0.92)
      expect(tier2.cctFlags & ControllerCollisionFlag.Down).toBe(ControllerCollisionFlag.Down);
      expect(tier2.cctY).toBeCloseTo(0.92, 2);
      expect(tier2.contactDetails).toHaveLength(1);
      expect(tier2.contactDetails[0].ids).toEqual([202, 301, 0]);
      expect(tier2.contactDetails[0].count).toBeGreaterThan(0);
      expect(tier2.triggerDetails).toContainEqual([203, 302, 0]);
    });

    it("returns w = -1 from HavokPlaneColliderShape.pointDistance()", () => {
      const mat = createDefaultMaterial(havokBackend);
      const planeShape = havokBackend.createPlaneColliderShape(999, mat);
      try {
        const res = planeShape.pointDistance(new Vector3(1, 2, 3));
        expect(res.w).toBe(-1);
      } finally {
        planeShape.destroy();
        mat.destroy();
      }
    });

    it("releases raw vertex and index buffers in HavokMeshColliderShape.destroy()", () => {
      const mat = createDefaultMaterial(havokBackend);
      const verts = [
        new Vector3(-1, -1, -1),
        new Vector3(1, -1, -1),
        new Vector3(1, 1, -1),
        new Vector3(-1, 1, -1),
        new Vector3(-1, -1, 1),
        new Vector3(1, -1, 1),
        new Vector3(1, 1, 1),
        new Vector3(-1, 1, 1)
      ];
      const indices = new Uint16Array([
        0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5
      ]);

      const convex = havokBackend.createMeshColliderShape(901, verts, null, true, mat, 0)! as unknown as {
        _rawVertices: Float32Array | null;
        _validIndices: Int32Array | null;
        destroy(): void;
      };
      const tri = havokBackend.createMeshColliderShape(902, verts, indices, false, mat, 0)! as unknown as {
        _rawVertices: Float32Array | null;
        _validIndices: Int32Array | null;
        destroy(): void;
      };
      try {
        expect(convex._rawVertices).toBeInstanceOf(Float32Array);
        expect(tri._rawVertices).toBeInstanceOf(Float32Array);
        expect(tri._validIndices).toBeInstanceOf(Int32Array);

        convex.destroy();
        tri.destroy();
        expect(convex._rawVertices).toBeNull();
        expect(convex._validIndices).toBeNull();
        expect(tri._rawVertices).toBeNull();
        expect(tri._validIndices).toBeNull();
      } finally {
        mat.destroy();
      }
    });

    it("rotates kinematic bodies > 100 rad/s in one step while clamping default, low, and high dynamic bodies accurately", () => {
      physics.gravity = new Vector3(0, 0, 0);

      // 150 degrees in 1/60s = 157.08 rad/s (> 100 rad/s default world speed limit)
      const fastTargetRot = new Quaternion();
      Quaternion.rotationYawPitchRoll((150 * Math.PI) / 180, 0, 0, fastTargetRot);

      // Case A: Dynamic body toggled to kinematic after scene entry
      const kinEntityA = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0), true, false);
      const kinBodyA = kinEntityA.getComponent(Rigidbody);
      step();
      kinBodyA.isKinematic = true;
      // Also attach an extra collider to exercise _reinsertBody on kinematic bodies
      const extraBox = kinEntityA.addComponent(BoxCollider);
      extraBox.center = new Vector3(0.5, 0, 0);

      // Case B: Normal dynamic body with default maxAngularVelocity (100 rad/s = ~5729.6 deg/s)
      const dynDefault = addBox(new Vector3(1, 1, 1), new Vector3(10, 0, 0), true, false);
      const dynDefaultBody = dynDefault.getComponent(Rigidbody);
      dynDefaultBody.angularDamping = 0;

      // Case C: Dynamic body with custom LOW maxAngularVelocity (200 deg/s)
      const dynLow = addBox(new Vector3(1, 1, 1), new Vector3(20, 0, 0), true, false);
      const dynLowBody = dynLow.getComponent(Rigidbody);
      dynLowBody.angularDamping = 0;
      dynLowBody.maxAngularVelocity = 200;

      // Apply > 100 rad/s angular impulses/velocities & kinematic move simultaneously
      kinBodyA.move(fastTargetRot);
      dynDefaultBody.angularVelocity = new Vector3(0, 12000, 0);
      dynLowBody.angularVelocity = new Vector3(0, 12000, 0);
      step();

      // Kinematic body must reach the exact 150-degree target in one step (not clamped to 100 rad/s)
      expect(Math.abs(Quaternion.dot(kinEntityA.transform.worldRotationQuaternion, fastTargetRot))).toBeCloseTo(1, 3);
      // Default dynamic body stays clamped at 100 rad/s (~5729.6 deg/s)
      expect(dynDefaultBody.angularVelocity.y).toBeLessThanOrEqual(5735);
      expect(dynDefaultBody.angularVelocity.y).toBeGreaterThan(5700);
      // Low-limit dynamic body stays clamped at 200 deg/s
      expect(dynLowBody.angularVelocity.y).toBeCloseTo(200, 1);

      // Step 2+: Repeated fast kinematic rotation back to identity (> 100 rad/s after prior steps)
      // must ALSO reach the exact target while default dynamic body remains clamped at 100 rad/s
      const identityRot = new Quaternion(0, 0, 0, 1);
      kinBodyA.move(identityRot);
      dynDefaultBody.angularVelocity = new Vector3(0, 12000, 0);
      step();
      expect(Math.abs(Quaternion.dot(kinEntityA.transform.worldRotationQuaternion, identityRot))).toBeCloseTo(1, 3);
      expect(dynDefaultBody.angularVelocity.y).toBeLessThanOrEqual(5735);
      expect(dynDefaultBody.angularVelocity.y).toBeGreaterThan(5700);

      // Case D: Dynamic body with custom HIGH maxAngularVelocity (10000 deg/s = 174.5 rad/s > 100 rad/s)
      const dynHigh = addBox(new Vector3(1, 1, 1), new Vector3(30, 0, 0), true, false);
      const dynHighBody = dynHigh.getComponent(Rigidbody);
      dynHighBody.angularDamping = 0;
      dynHighBody.maxAngularVelocity = 10000;
      dynHighBody.angularVelocity = new Vector3(0, 15000, 0);
      dynDefaultBody.angularVelocity = new Vector3(0, 15000, 0);
      step();

      expect(dynHighBody.angularVelocity.y).toBeCloseTo(10000, 0);
      expect(dynDefaultBody.angularVelocity.y).toBeLessThanOrEqual(5735);
      // Step 2 while dynHigh is still active: dynDefault must STILL be clamped to 100 rad/s even after world 1e6 flushes
      dynDefaultBody.angularVelocity = new Vector3(0, 15000, 0);
      step();
      expect(dynDefaultBody.angularVelocity.y).toBeLessThanOrEqual(5735);

      // Lowering high body back to default restores resting world speed limit cleanly even under direct torque
      dynHigh.destroy();
      dynDefaultBody.angularVelocity = new Vector3(0, 0, 0);
      dynDefaultBody.applyTorque(new Vector3(0, 500000, 0));
      step();
      expect(dynDefaultBody.angularVelocity.y).toBeLessThanOrEqual(5735);
      expect(dynDefaultBody.angularVelocity.y).toBeGreaterThan(5700);
    });

    it("rotates pre-existing and newly-added kinematic bodies > 100 rad/s across deferred speed-limit upgrades and downgrades", () => {
      physics.gravity = new Vector3(0, 0, 0);

      // 150 degrees in 1/60s = 157.08 rad/s (> 100 rad/s resting world speed limit)
      const fastTargetRot = new Quaternion();
      Quaternion.rotationYawPitchRoll((150 * Math.PI) / 180, 0, 0, fastTargetRot);

      // Deferred upgrade: K exists at resting 100 rad/s limit; D_high raises pending limit to 1e6 before step()
      const kinPre = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0), true, true);
      const kinPreBody = kinPre.getComponent(Rigidbody);
      step(); // K is now settled at resting 100 rad/s

      const dynHigh = addBox(new Vector3(1, 1, 1), new Vector3(10, 0, 0), true, false);
      const dynHighBody = dynHigh.getComponent(Rigidbody);
      dynHighBody.angularDamping = 0;
      dynHighBody.maxAngularVelocity = 10000;
      // Add another shape to exercise _reinsertBody preserving high angular velocity without clamping to 100
      dynHighBody.angularVelocity = new Vector3(0, 9000, 0);
      dynHigh.addComponent(BoxCollider).center = new Vector3(0, 1, 0);

      // Same step BEFORE HP_World_Step flushes SetSpeedLimit(1e6): K must STILL reach exact 150 deg target
      kinPreBody.move(fastTargetRot);
      step();
      expect(Math.abs(Quaternion.dot(kinPre.transform.worldRotationQuaternion, fastTargetRot))).toBeCloseTo(1, 3);
      expect(dynHighBody.angularVelocity.y).toBeCloseTo(9000, 0);

      // Deferred downgrade: destroy D_high (queues SetSpeedLimit(100)) and add a NEW kinematic body on the same step
      dynHigh.destroy();
      const kinPost = addBox(new Vector3(1, 1, 1), new Vector3(-10, 0, 0), true, true);
      const kinPostBody = kinPost.getComponent(Rigidbody);
      kinPostBody.move(fastTargetRot);
      step();
      expect(Math.abs(Quaternion.dot(kinPost.transform.worldRotationQuaternion, fastTargetRot))).toBeCloseTo(1, 3);
    });

    it("skips redundant HP_Body_SetQTransform writes on sleeping rotated FixedJoints despite float32 quaternion rounding", () => {
      physics.gravity = new Vector3(0, 0, 0);
      const rot = new Quaternion(0.258819, 0.482963, -0.12941, 0.826659).normalize();
      const box = addBox(new Vector3(1, 1, 1), new Vector3(2, 3, 4), true, false);
      box.transform.rotationQuaternion = rot;
      const body = box.getComponent(Rigidbody);
      const joint = box.addComponent(FixedJoint);
      joint.automaticConnectedAnchor = false;
      joint.connectedAnchor = new Vector3(2, 3, 4);

      step(2);
      body.sleep();

      const hk = (havokBackend as unknown as { _hk: { HP_Body_SetQTransform: (...args: unknown[]) => unknown } })._hk;
      const setQtSpy = vi.spyOn(hk, "HP_Body_SetQTransform");
      step(5);
      expect(setQtSpy).not.toHaveBeenCalled();
    });

    it("grows the multi-hit query collector past 256 simultaneous overlapping bodies in CharacterController.move()", () => {
      const role = root.createChild("crowded-cct");
      role.transform.setPosition(0, 0, 0);
      const cc = role.addComponent(CharacterController);
      cc.geometry = CharacterControllerGeometry.Box;
      cc.size = new Vector3(1, 1, 1);

      // Place 280 overlapping boxes directly around the controller (> initial 256 collector capacity)
      for (let i = 0; i < 280; i++) {
        addBox(new Vector3(2, 0.5, 2), new Vector3(0, -0.5, 0));
      }

      const flags = cc.move(new Vector3(0, -0.1, 0), 0.0001, physics.fixedTimeStep);
      expect(flags & ControllerCollisionFlag.Down).toBe(ControllerCollisionFlag.Down);
      expect(role.transform.position.y).toBeGreaterThan(0.2);

      const nativeScene = (physics as unknown as { _nativePhysicsScene: { _collectorCapacity: number } })
        ._nativePhysicsScene;
      expect(nativeScene._collectorCapacity).toBeGreaterThanOrEqual(512);
    });

    it("inherits moving kinematic anchor velocity on FixedJoint before kinematic velocity reset", () => {
      physics.gravity = new Vector3(0, 0, 0);
      const anchor = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0), true, true);
      const anchorBody = anchor.getComponent(Rigidbody);
      const payload = addBox(new Vector3(1, 1, 1), new Vector3(0, 2, 0), true, false);
      const payloadBody = payload.getComponent(Rigidbody);

      const joint = payload.addComponent(FixedJoint);
      joint.connectedBody = anchorBody;

      // Move kinematic anchor by +0.5m along X in one 1/60s step -> ~30 m/s
      anchorBody.move(new Vector3(0.5, 0, 0));
      step();

      expect(payload.transform.worldPosition.x).toBeCloseTo(0.5, 2);
      expect(payloadBody.linearVelocity.x).toBeGreaterThan(25);
    });

    it("preserves queued kinematic move across an update(0) tick without leaving stale pending target", () => {
      physics.gravity = new Vector3(0, 0, 0);
      const kin = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0), true, true);
      const kinBody = kin.getComponent(Rigidbody);
      const nativeScene = (physics as unknown as { _nativePhysicsScene: { update(dt: number): void } })
        ._nativePhysicsScene;

      const rot90Y = new Quaternion();
      Quaternion.rotationYawPitchRoll(Math.PI * 0.5, 0, 0, rot90Y);
      kinBody.move(new Vector3(3, 0, 0), rot90Y);

      // A zero-dt update must NOT discard the queued kinematic move
      nativeScene.update(0);
      step();

      expect(kin.transform.worldPosition.x).toBeCloseTo(3, 3);
      expect(Math.abs(Quaternion.dot(kin.transform.worldRotationQuaternion, rot90Y))).toBeCloseTo(1, 3);

      // Subsequent 1-arg move(pos) reads current orientation cleanly (no stale pending flag)
      kinBody.move(new Vector3(5, 0, 0));
      step();
      expect(kin.transform.worldPosition.x).toBeCloseTo(5, 3);
      expect(Math.abs(Quaternion.dot(kin.transform.worldRotationQuaternion, rot90Y))).toBeCloseTo(1, 3);
    });

    it("deduplicates concurrent initialize() calls sharing a custom jsUrl without clobbering globalThis.HavokPhysics", async () => {
      const globalObj = globalThis as { HavokPhysics?: unknown };
      const origFactory = globalObj.HavokPhysics;
      const blob = new Blob([`globalThis.HavokPhysics = async () => ({ __concurrentMock: true });`], {
        type: "application/javascript"
      });
      const blobUrl = URL.createObjectURL(blob);
      const a = new HavokPhysics({ jsUrl: blobUrl });
      const b = new HavokPhysics({ jsUrl: blobUrl });
      try {
        await Promise.all([a.initialize(), b.initialize()]);
        expect((a as unknown as { _hk: { __concurrentMock?: boolean } })._hk.__concurrentMock).toBe(true);
        expect((b as unknown as { _hk: { __concurrentMock?: boolean } })._hk.__concurrentMock).toBe(true);
        expect((a as unknown as { _useRawABI: boolean })._useRawABI).toBe(false);
      } finally {
        a.destroy();
        b.destroy();
        URL.revokeObjectURL(blobUrl);
        globalObj.HavokPhysics = origFactory;
      }
    });
  });
});
