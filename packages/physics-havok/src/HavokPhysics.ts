import { Quaternion, SystemInfo, Vector3, Vector4 } from "@galacean/engine";
import {
  IBoxColliderShape,
  ICapsuleColliderShape,
  ICharacterController,
  ICollider,
  IDynamicCollider,
  IFixedJoint,
  IHingeJoint,
  IMeshColliderShape,
  IPhysics,
  IPhysicsMaterial,
  IPhysicsMaterialProperties,
  IPhysicsScene,
  IPlaneColliderShape,
  ISphereColliderShape,
  ISpringJoint,
  IStaticCollider
} from "@galacean/engine-design";
import { HavokCharacterController } from "./HavokCharacterController";
import { HavokCollider } from "./HavokCollider";
import { HavokDynamicCollider } from "./HavokDynamicCollider";
import { HavokPhysicsMaterial } from "./HavokPhysicsMaterial";
import { HavokPhysicsScene } from "./HavokPhysicsScene";
import { HavokStaticCollider } from "./HavokStaticCollider";
import {
  ALL_FILTER,
  HavokModule,
  HKFilterInfo,
  HKQuaternion,
  HKVector3,
  HP_BodyId,
  HP_CollectorId,
  HP_ShapeId,
  HP_WorldId,
  writeQTransform,
  ZERO_HANDLE
} from "./HavokTypes";
import { HavokFixedJoint } from "./joint/HavokFixedJoint";
import { HavokHingeJoint } from "./joint/HavokHingeJoint";
import { HavokSpringJoint } from "./joint/HavokSpringJoint";
import { HavokBoxColliderShape } from "./shape/HavokBoxColliderShape";
import { HavokCapsuleColliderShape } from "./shape/HavokCapsuleColliderShape";
import { HavokMeshColliderShape } from "./shape/HavokMeshColliderShape";
import { HavokPlaneColliderShape } from "./shape/HavokPlaneColliderShape";
import { HavokSphereColliderShape } from "./shape/HavokSphereColliderShape";

type HavokFactory = (moduleArg?: Record<string, unknown>) => Promise<HavokModule>;

type HavokGlobal = typeof globalThis & {
  HavokPhysics?: HavokFactory;
};

// Resolve default asset URLs at module evaluation time so UMD bundles capture `document.currentScript.src`
// and ESM bundlers (Vite/Webpack) statically emit both sibling assets.
let defaultJsUrl: string | undefined;
let defaultWasmUrl: string | undefined;
try {
  defaultJsUrl = new URL("../libs/HavokPhysics_umd.js", import.meta.url).href;
  defaultWasmUrl = new URL("../libs/HavokPhysics.wasm", import.meta.url).href;
} catch {
  // Environments without a resolvable module URL can pass explicit options.
}

const loadedFactories = new Map<string, HavokFactory>();
let inFlightJsUrl: string | null = null;
let inFlightFactoryPromise: Promise<HavokFactory> | null = null;
let scriptLoadQueue: Promise<void> = Promise.resolve();

/**
 * Runtime initialization options for {@link HavokPhysics}.
 */
export interface HavokRuntimeOptions {
  /** URL of the `HavokPhysics_umd.js` loader script. Defaults to the package's bundled script. */
  jsUrl?: string;
  /** Optional explicit URL of `HavokPhysics.wasm`. Defaults to the bundled WASM for the default script, or the sibling `.wasm` next to a custom `jsUrl`. */
  wasmUrl?: string;
  /** Optional pre-imported Havok factory function (e.g., `import HavokPhysics from "@babylonjs/havok"`). */
  havokFactory?: (moduleArg?: Record<string, unknown>) => Promise<unknown>;
  /** Optional already-initialized Havok module instance. */
  havokInstance?: unknown;
}

enum InitializeState {
  Uninitialized,
  Initializing,
  Initialized
}

/**
 * Havok Physics WASM backend.
 */
export class HavokPhysics implements IPhysics {
  private static _tempFilterInfo: HKFilterInfo = [0, 0];
  private static _tempQTransform: [HKVector3, HKQuaternion] = [
    [0, 0, 0],
    [0, 0, 0, 1]
  ];
  private static _tempPointProxInput: [HKVector3, number, HKFilterInfo, boolean, HP_BodyId] = [
    [0, 0, 0],
    1e5,
    ALL_FILTER,
    true,
    ZERO_HANDLE
  ];

  /** @internal */
  _hk!: HavokModule;
  /** @internal True when runtime ABI probe confirms Tier 2 C-ABI exports and struct layout. */
  _useRawABI = false;
  /** @internal Persistent 32B WASM scratch buffer for Tier 2 `_HP_Body_GetQTransform`, or 0 when unavailable. */
  _qTransformScratch = 0;
  /** @internal Monotonic version incremented on every layer matrix mutation for lazy shape filter sync. */
  _filterVersion = 0;

  private _options: HavokRuntimeOptions;
  private _initializeState: InitializeState = InitializeState.Uninitialized;
  private _initializePromise: Promise<void> | null = null;
  private _initGeneration = 0;

  // Global 32x32 symmetric layer collision bitmasks (all layers collide by default)
  private _layerMasks = new Uint32Array(32);
  // Bit k is 1 iff `_layerMasks[k] !== 0`; used as `collideWith` for zero-mask layers so queries still match them.
  private _nonZeroLayersMask = 0xffffffff;

  private _scenes = new Set<HavokPhysicsScene>();

  // Lazy scratch world for isolated MeshCollider.getClosestPoint()
  private _scratchWorld: HP_WorldId | null = null;
  private _scratchBody: HP_BodyId | null = null;
  private _scratchCollector: HP_CollectorId | null = null;

  /**
   * Create a HavokPhysics instance.
   * @param options - Optional runtime URLs or pre-imported Havok loader/instance
   */
  constructor(options: HavokRuntimeOptions = {}) {
    this._options = options;
    this._layerMasks.fill(0xffffffff);
  }

  /**
   * Initialize HavokPhysics.
   * @returns Promise that resolves when the Havok WASM runtime is ready
   */
  initialize(): Promise<void> {
    if (this._initializeState === InitializeState.Initialized) {
      return Promise.resolve();
    }
    if (this._initializeState === InitializeState.Initializing) {
      return this._initializePromise!;
    }

    if (typeof WebAssembly === "undefined" || !SystemInfo._detectSIMDSupported()) {
      return Promise.reject(
        new Error("HavokPhysics requires WebAssembly SIMD support (e.g., iOS >= 16.4, Chrome >= 91, Firefox >= 89).")
      );
    }

    const generation = ++this._initGeneration;
    this._initializeState = InitializeState.Initializing;

    const moduleArg: Record<string, unknown> = {};
    if (this._options.wasmUrl) {
      const wasmUrl = this._options.wasmUrl;
      moduleArg.locateFile = () => wasmUrl;
    }

    const globalObj = globalThis as HavokGlobal;
    const hasPreloadedGlobal = typeof globalObj.HavokPhysics === "function" && loadedFactories.size === 0;

    let loadPromise: Promise<HavokModule>;
    if (this._options.havokInstance) {
      loadPromise = Promise.resolve(this._options.havokInstance as HavokModule);
    } else if (this._options.havokFactory) {
      const factory = this._options.havokFactory;
      loadPromise = Promise.resolve().then(() => factory(moduleArg) as Promise<HavokModule>);
    } else {
      loadPromise = this._loadUMDScript(moduleArg, hasPreloadedGlobal);
    }

    const initializePromise = loadPromise.then(
      (hk) => {
        if (this._initGeneration !== generation) {
          throw new Error("HavokPhysics was destroyed during initialization.");
        }
        this._hk = hk;
        this._qTransformScratch = this._probeRawABI(hk);
        this._useRawABI = this._qTransformScratch !== 0;
        this._initializeState = InitializeState.Initialized;
        this._initializePromise = null;
        console.log("Havok loaded.");
      },
      (err) => {
        if (this._initGeneration === generation) {
          this._initializeState = InitializeState.Uninitialized;
          this._initializePromise = null;
        }
        throw err;
      }
    );

    this._initializePromise = initializePromise;
    return initializePromise;
  }

  /**
   * Destroy HavokPhysics and release all active scenes and scratch resources.
   */
  destroy(): void {
    this._initGeneration++;
    for (let it = this._scenes.values(), cur = it.next(); !cur.done; cur = it.next()) {
      cur.value.destroy();
    }
    this._scenes.clear();
    if (this._hk) {
      if (this._scratchWorld) {
        this._hk.HP_QueryCollector_Release(this._scratchCollector!);
        this._hk.HP_Body_Release(this._scratchBody!);
        this._hk.HP_World_Release(this._scratchWorld);
        this._scratchWorld = null;
        this._scratchBody = null;
        this._scratchCollector = null;
      }
      if (this._qTransformScratch !== 0) {
        this._hk._free(this._qTransformScratch);
      }
    }
    this._qTransformScratch = 0;
    this._layerMasks.fill(0xffffffff);
    this._nonZeroLayersMask = 0xffffffff;
    this._filterVersion++;
    this._initializeState = InitializeState.Uninitialized;
    this._initializePromise = null;
    this._useRawABI = false;
    this._hk = null!;
  }

  /**
   * {@inheritDoc IPhysics.createPhysicsScene }
   */
  createPhysicsScene(): IPhysicsScene {
    return new HavokPhysicsScene(this);
  }

  /**
   * {@inheritDoc IPhysics.createStaticCollider }
   */
  createStaticCollider(position: Vector3, rotation: Quaternion): IStaticCollider {
    return new HavokStaticCollider(this, position, rotation);
  }

  /**
   * {@inheritDoc IPhysics.createDynamicCollider }
   */
  createDynamicCollider(position: Vector3, rotation: Quaternion): IDynamicCollider {
    return new HavokDynamicCollider(this, position, rotation);
  }

  /**
   * {@inheritDoc IPhysics.createCharacterController }
   */
  createCharacterController(uniqueID: number, material: IPhysicsMaterial): ICharacterController {
    return new HavokCharacterController(this, uniqueID, material as HavokPhysicsMaterial);
  }

  /**
   * {@inheritDoc IPhysics.createPhysicsMaterial }
   */
  createPhysicsMaterial(properties: IPhysicsMaterialProperties): IPhysicsMaterial {
    return new HavokPhysicsMaterial(this, properties);
  }

  /**
   * {@inheritDoc IPhysics.createBoxColliderShape }
   */
  createBoxColliderShape(uniqueID: number, size: Vector3, material: IPhysicsMaterial): IBoxColliderShape {
    return new HavokBoxColliderShape(this, uniqueID, size, material as HavokPhysicsMaterial);
  }

  /**
   * {@inheritDoc IPhysics.createSphereColliderShape }
   */
  createSphereColliderShape(uniqueID: number, radius: number, material: IPhysicsMaterial): ISphereColliderShape {
    return new HavokSphereColliderShape(this, uniqueID, radius, material as HavokPhysicsMaterial);
  }

  /**
   * {@inheritDoc IPhysics.createPlaneColliderShape }
   */
  createPlaneColliderShape(uniqueID: number, material: IPhysicsMaterial): IPlaneColliderShape {
    return new HavokPlaneColliderShape(this, uniqueID, material as HavokPhysicsMaterial);
  }

  /**
   * {@inheritDoc IPhysics.createCapsuleColliderShape }
   */
  createCapsuleColliderShape(
    uniqueID: number,
    radius: number,
    height: number,
    material: IPhysicsMaterial
  ): ICapsuleColliderShape {
    return new HavokCapsuleColliderShape(this, uniqueID, radius, height, material as HavokPhysicsMaterial);
  }

  /**
   * {@inheritDoc IPhysics.createMeshColliderShape }
   */
  createMeshColliderShape(
    uniqueID: number,
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    isConvex: boolean,
    material: IPhysicsMaterial,
    cookingFlags?: number
  ): IMeshColliderShape | null;
  createMeshColliderShape(
    uniqueID: number,
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    isConvex: boolean,
    material: IPhysicsMaterial
  ): IMeshColliderShape | null {
    const shape = new HavokMeshColliderShape(
      this,
      uniqueID,
      positions,
      indices,
      isConvex,
      material as HavokPhysicsMaterial
    );
    return shape._hkShape ? shape : null;
  }

  /**
   * {@inheritDoc IPhysics.createFixedJoint }
   */
  createFixedJoint(collider: ICollider): IFixedJoint {
    return new HavokFixedJoint(this, collider as HavokCollider);
  }

  /**
   * {@inheritDoc IPhysics.createHingeJoint }
   */
  createHingeJoint(collider: ICollider): IHingeJoint {
    return new HavokHingeJoint(this, collider as HavokCollider);
  }

  /**
   * {@inheritDoc IPhysics.createSpringJoint }
   */
  createSpringJoint(collider: ICollider): ISpringJoint {
    return new HavokSpringJoint(this, collider as HavokCollider);
  }

  /**
   * {@inheritDoc IPhysics.getColliderLayerCollision }
   */
  getColliderLayerCollision(layer1: number, layer2: number): boolean {
    if (
      !Number.isInteger(layer1) ||
      !Number.isInteger(layer2) ||
      layer1 < 0 ||
      layer1 > 31 ||
      layer2 < 0 ||
      layer2 > 31
    ) {
      return false;
    }
    return ((this._layerMasks[layer1] >>> layer2) & 1) === 1;
  }

  /**
   * {@inheritDoc IPhysics.setColliderLayerCollision }
   */
  setColliderLayerCollision(layer1: number, layer2: number, isCollide: boolean): void {
    if (
      !Number.isInteger(layer1) ||
      !Number.isInteger(layer2) ||
      layer1 < 0 ||
      layer1 > 31 ||
      layer2 < 0 ||
      layer2 > 31
    ) {
      return;
    }
    const prev1 = this._layerMasks[layer1];
    const bit2 = (1 << layer2) >>> 0;
    const next1 = isCollide ? (prev1 | bit2) >>> 0 : (prev1 & ~bit2) >>> 0;
    if (prev1 === next1) {
      return;
    }
    const bit1 = (1 << layer1) >>> 0;
    const next2 = isCollide ? (this._layerMasks[layer2] | bit1) >>> 0 : (this._layerMasks[layer2] & ~bit1) >>> 0;
    this._layerMasks[layer1] = next1;
    this._layerMasks[layer2] = next2;

    const prevNonZero = this._nonZeroLayersMask;
    let nextNonZero = next1 !== 0 ? (prevNonZero | bit1) >>> 0 : (prevNonZero & ~bit1) >>> 0;
    nextNonZero = next2 !== 0 ? (nextNonZero | bit2) >>> 0 : (nextNonZero & ~bit2) >>> 0;
    this._nonZeroLayersMask = nextNonZero;
    this._filterVersion++;

    let changedMask = (bit1 | bit2) >>> 0;
    if (nextNonZero !== prevNonZero) {
      changedMask = (changedMask | ~nextNonZero) >>> 0;
    }
    for (let it = this._scenes.values(), cur = it.next(); !cur.done; cur = it.next()) {
      cur.value._onLayerMatrixChanged(changedMask);
    }
  }

  /** @internal */
  _getLayerFilterInfo(layer: number): HKFilterInfo {
    const safeLayer = layer & 31;
    const out = HavokPhysics._tempFilterInfo;
    const mask = this._layerMasks[safeLayer] >>> 0;
    out[0] = (1 << safeLayer) >>> 0;
    // Zero-mask layers borrow `_nonZeroLayersMask` as `collideWith` so symmetric collision stays disabled
    // against all layers while `[0xffffffff, queryMask]` scene queries still match this layer's membership bit.
    out[1] = mask !== 0 ? mask : this._nonZeroLayersMask;
    return out;
  }

  /** @internal */
  _registerScene(scene: HavokPhysicsScene): void {
    this._scenes.add(scene);
  }

  /** @internal */
  _unregisterScene(scene: HavokPhysicsScene): void {
    this._scenes.delete(scene);
  }

  /** @internal */
  _querySingleShapePointDistance(
    shape: HP_ShapeId,
    worldPos: Vector3,
    worldRot: Quaternion,
    point: Vector3,
    out: Vector4
  ): boolean {
    const hk = this._hk;
    if (!this._scratchWorld) {
      this._scratchWorld = hk.HP_World_Create()[1];
      this._scratchBody = hk.HP_Body_Create()[1];
      this._scratchCollector = hk.HP_QueryCollector_Create(1)[1];
    }

    hk.HP_Body_SetShape(this._scratchBody!, shape);
    const qt = HavokPhysics._tempQTransform;
    writeQTransform(worldPos, worldRot, qt);
    hk.HP_Body_SetQTransform(this._scratchBody!, qt);
    // Re-add/remove per query so Havok's lazy broadphase AABB always matches the current shape & pose
    hk.HP_World_AddBody(this._scratchWorld, this._scratchBody!, false);
    let hit = false;
    try {
      const input = HavokPhysics._tempPointProxInput;
      const pt = input[0];
      pt[0] = point.x;
      pt[1] = point.y;
      pt[2] = point.z;
      hk.HP_World_PointProximityWithCollector(this._scratchWorld, this._scratchCollector!, input);

      const numHits = hk.HP_QueryCollector_GetNumHits(this._scratchCollector!)[1];
      if (numHits > 0) {
        const [dist, cp] = hk.HP_QueryCollector_GetPointProximityResult(this._scratchCollector!, 0)[1];
        if (dist > 0) {
          const p = cp[3];
          out.set(p[0], p[1], p[2], dist * dist);
          hit = true;
        }
      }
    } finally {
      hk.HP_World_RemoveBody(this._scratchWorld, this._scratchBody!);
      hk.HP_Body_SetShape(this._scratchBody!, ZERO_HANDLE);
    }
    return hit;
  }

  /**
   * Verify Tier 2 raw C-ABI exports and struct layout with a 1-body round-trip probe.
   * Returns a persistent 32B scratch pointer on success, or 0 to fall back to Tier 1 Embind.
   */
  private _probeRawABI(hk: HavokModule): number {
    if (
      hk == null ||
      hk.HEAPF32 == null ||
      hk.HEAPU32 == null ||
      hk.HEAP32 == null ||
      typeof hk._malloc !== "function" ||
      typeof hk._free !== "function" ||
      typeof hk._HP_Body_GetQTransform !== "function" ||
      typeof hk._HP_World_CastRayWithCollector !== "function" ||
      typeof hk._HP_World_ShapeCastWithCollector !== "function" ||
      typeof hk._HP_World_ShapeProximityWithCollector !== "function" ||
      typeof hk._HP_QueryCollector_GetNumHits !== "function" ||
      typeof hk._HP_QueryCollector_GetCastRayResult !== "function" ||
      typeof hk._HP_QueryCollector_GetShapeCastResult !== "function" ||
      typeof hk._HP_QueryCollector_GetShapeProximityResult !== "function" ||
      typeof hk._HP_ShapePathIterator_GetNext !== "function"
    ) {
      return 0;
    }

    const ptr = hk._malloc(32);
    if (ptr === 0) return 0;

    let body: HP_BodyId | null = null;
    let collector: HP_CollectorId | null = null;
    try {
      body = hk.HP_Body_Create()[1];
      collector = hk.HP_QueryCollector_Create(1)[1];
      const qt = HavokPhysics._tempQTransform;
      qt[0][0] = 1.25;
      qt[0][1] = -2.5;
      qt[0][2] = 3.75;
      qt[1][0] = 0;
      qt[1][1] = 0;
      qt[1][2] = 0;
      qt[1][3] = 1;
      hk.HP_Body_SetQTransform(body, qt);
      hk._HP_Body_GetQTransform(body[0], ptr);
      const b = ptr >>> 2;
      const f32 = hk.HEAPF32;
      const qtOk =
        f32[b] === 1.25 &&
        f32[b + 1] === -2.5 &&
        f32[b + 2] === 3.75 &&
        f32[b + 3] === 0 &&
        f32[b + 4] === 0 &&
        f32[b + 5] === 0 &&
        f32[b + 6] === 1;
      hk._HP_QueryCollector_GetNumHits(collector[0], ptr);
      const hitsOk = hk.HEAPU32[b] === 0;
      if (qtOk && hitsOk) {
        return ptr;
      }
    } catch {
      // Fall back to Tier 1 Embind when a custom WASM build diverges from expected raw ABI layout.
    } finally {
      if (collector) {
        hk.HP_QueryCollector_Release(collector);
      }
      if (body) {
        hk.HP_Body_Release(body);
      }
    }
    hk._free(ptr);
    return 0;
  }

  private _loadUMDScript(moduleArg: Record<string, unknown>, hasPreloadedGlobal: boolean): Promise<HavokModule> {
    const globalObj = globalThis as HavokGlobal;
    const customJsUrl = this._options.jsUrl;
    const jsUrl = customJsUrl ?? defaultJsUrl;

    if (!this._options.wasmUrl && !customJsUrl && defaultWasmUrl && !hasPreloadedGlobal) {
      const wasmUrl = defaultWasmUrl;
      moduleArg.locateFile = () => wasmUrl;
    }

    const cachedFactory = jsUrl ? loadedFactories.get(jsUrl) : undefined;
    if (cachedFactory) {
      return Promise.resolve().then(() => cachedFactory(moduleArg));
    }
    if (!customJsUrl && hasPreloadedGlobal) {
      const factory = globalObj.HavokPhysics!;
      return Promise.resolve().then(() => factory(moduleArg));
    }

    if (!jsUrl) {
      return Promise.reject(
        new Error("HavokPhysics: please specify `jsUrl`, `havokFactory`, or `havokInstance` in HavokRuntimeOptions.")
      );
    }

    if (typeof document === "undefined") {
      return Promise.reject(
        new Error(
          "HavokPhysics: `document` is not available to load UMD script; specify `havokFactory` or `havokInstance`."
        )
      );
    }

    return this._loadScriptFactory(jsUrl).then((factory) => factory(moduleArg));
  }

  private _loadScriptFactory(jsUrl: string): Promise<HavokFactory> {
    if (inFlightFactoryPromise && inFlightJsUrl === jsUrl) {
      return inFlightFactoryPromise;
    }

    const factoryPromise = scriptLoadQueue.then(
      () =>
        new Promise<HavokFactory>((resolve, reject) => {
          const cached = loadedFactories.get(jsUrl);
          if (cached) {
            resolve(cached);
            return;
          }
          const globalObj = globalThis as HavokGlobal;
          const previousFactory = globalObj.HavokPhysics;
          globalObj.HavokPhysics = undefined;
          const script = document.createElement("script");
          script.async = true;
          script.onload = () => {
            const factory = globalObj.HavokPhysics;
            if (typeof factory !== "function") {
              if (globalObj.HavokPhysics === undefined) {
                globalObj.HavokPhysics = previousFactory;
              }
              script.remove();
              reject(new Error("HavokPhysics: loaded script did not expose global `HavokPhysics` factory."));
              return;
            }
            loadedFactories.set(jsUrl, factory);
            if (previousFactory !== undefined) {
              globalObj.HavokPhysics = previousFactory;
            }
            resolve(factory);
          };
          script.onerror = () => {
            if (globalObj.HavokPhysics === undefined) {
              globalObj.HavokPhysics = previousFactory;
            }
            script.remove();
            reject(new Error(`HavokPhysics: failed to load script "${jsUrl}".`));
          };
          script.src = jsUrl;
          (document.body ?? document.head).appendChild(script);
        })
    );

    inFlightJsUrl = jsUrl;
    inFlightFactoryPromise = factoryPromise;
    const clearInFlight = (): void => {
      if (inFlightFactoryPromise === factoryPromise) {
        inFlightFactoryPromise = null;
        inFlightJsUrl = null;
      }
    };
    scriptLoadQueue = factoryPromise.then(clearInFlight, clearInFlight);
    return factoryPromise;
  }
}
