import { Quaternion, Vector3 } from "@galacean/engine";
import {
  IBoxColliderShape,
  ICapsuleColliderShape,
  ICharacterController,
  ICollision,
  IDynamicCollider,
  IFixedJoint,
  IHingeJoint,
  IMeshColliderShape,
  IPhysics,
  IPhysicsManager,
  IPhysicsMaterial,
  IPhysicsScene,
  IPlaneColliderShape,
  ISphereColliderShape,
  ISpringJoint,
  IStaticCollider
} from "@galacean/engine-design";
import { PhysXCharacterController } from "./PhysXCharacterController";
import { PhysXCollider } from "./PhysXCollider";
import { PhysXDynamicCollider } from "./PhysXDynamicCollider";
import { PhysXPhysicsManager } from "./PhysXPhysicsManager";
import { PhysXPhysicsMaterial } from "./PhysXPhysicsMaterial";
import { PhysXPhysicsScene } from "./PhysXPhysicsScene";
import { PhysXStaticCollider } from "./PhysXStaticCollider";
import { PhysXRuntimeMode } from "./enum/PhysXRuntimeMode";
import { PhysXFixedJoint } from "./joint/PhysXFixedJoint";
import { PhysXHingeJoint } from "./joint/PhysXHingeJoint";
import { PhysXSpringJoint } from "./joint/PhysXSpringJoint";
import { PhysXBoxColliderShape } from "./shape/PhysXBoxColliderShape";
import { PhysXCapsuleColliderShape } from "./shape/PhysXCapsuleColliderShape";
import { PhysXMeshColliderShape } from "./shape/PhysXMeshColliderShape";
import { PhysXPlaneColliderShape } from "./shape/PhysXPlaneColliderShape";
import { PhysXSphereColliderShape } from "./shape/PhysXSphereColliderShape";

/**
 * PhysX object creation.
 */

export class PhysXPhysics implements IPhysics {
  /** @internal PhysX wasm object */
  _physX: any;
  /** @internal PhysX Foundation SDK singleton class */
  _pxFoundation: any;
  /** @internal PhysX physics object */
  _pxPhysics: any;
  /** @internal PhysX cooking object for mesh colliders */
  _pxCooking: any;
  /** @internal PhysX cooking params for mesh colliders */
  _pxCookingParams: any;

  private _runTimeMode: PhysXRuntimeMode;
  private _initializeState: InitializeState = InitializeState.Uninitialized;
  private _initializePromise: Promise<void>;
  private _defaultErrorCallback: any;
  private _allocator: any;
  private _tolerancesScale: any;
  private _wasmModeUrl: string;
  private _downgradeModeUrl: string;

  /**
   * Create a PhysXPhysics instance.
   * @param runtimeMode - Runtime use WebAssembly mode or downgrade JavaScript mode, `Auto` prefers webAssembly mode if supported @see {@link PhysXRuntimeMode}
   * @param runtimeUrls - Manually specify the `PhysXRuntimeMode.WebAssembly` mode and `PhysXRuntimeMode.JavaScript` mode URL
   */
  constructor(runtimeMode: PhysXRuntimeMode = PhysXRuntimeMode.Auto, runtimeUrls?: PhysXRuntimeUrls) {
    this._runTimeMode = runtimeMode;
    this._wasmModeUrl =
      runtimeUrls?.wasmModeUrl ??
      "https://mdn.alipayobjects.com/rms/afts/file/A*8pf0QJKeUXsAAAAASWAAAAgAehQnAQ/physx.release.js";
    this._downgradeModeUrl =
      runtimeUrls?.javaScriptModeUrl ??
      "https://mdn.alipayobjects.com/rms/afts/file/A*PLtBTLf8Sm0AAAAAgFAAAAgAehQnAQ/physx.release.downgrade.js";
  }

  /**
   * Initialize PhysXPhysics.
   * @param runtimeMode - Runtime mode
   * @returns Promise object
   */
  initialize(): Promise<void> {
    if (this._initializeState === InitializeState.Initialized) {
      return Promise.resolve();
    } else if (this._initializeState === InitializeState.Initializing) {
      return this._initializePromise;
    }

    let runtimeMode = this._runTimeMode;
    const scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      document.body.appendChild(script);
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      if (runtimeMode == PhysXRuntimeMode.Auto) {
        const supported = (() => {
          try {
            if (typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function") {
              const wasmModule = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
              if (wasmModule instanceof WebAssembly.Module)
                return new WebAssembly.Instance(wasmModule) instanceof WebAssembly.Instance;
            }
          } catch (e) {}
          return false;
        })();
        if (supported) {
          runtimeMode = PhysXRuntimeMode.WebAssembly;
        } else {
          runtimeMode = PhysXRuntimeMode.JavaScript;
        }
      }

      if (runtimeMode == PhysXRuntimeMode.JavaScript) {
        script.src = this._downgradeModeUrl;
      } else if (runtimeMode == PhysXRuntimeMode.WebAssembly) {
        script.src = this._wasmModeUrl;
      }
    });

    const initializePromise = new Promise<void>((resolve, reject) => {
      scriptPromise
        .then(
          () =>
            (<any>window).PHYSX().then((PHYSX: any) => {
              this._init(PHYSX);
              this._initializeState = InitializeState.Initialized;
              this._initializePromise = null;
              console.log("PhysX loaded.");
              resolve();
            }, reject),
          reject
        )
        .catch(reject);
    });

    this._initializePromise = initializePromise;
    return initializePromise;
  }

  /**
   * Destroy PhysXPhysics.
   */
  destroy(): void {
    this._pxCooking.release();
    this._pxCookingParams.delete();
    this._physX.PxCloseExtensions();
    this._pxPhysics.release();
    this._pxFoundation.release();
    this._defaultErrorCallback.delete();
    this._allocator.delete();
    this._tolerancesScale.delete();
  }

  /**
   * Set cooking parameters for mesh colliders.
   * @param params - Cooking parameters
   */
  setCookingParams(params: {
    /** Mesh weld tolerance. If mesh welding is enabled, this controls the distance at which vertices are welded. */
    meshWeldTolerance?: number;
    /** Mesh preprocessing flags (bitwise OR of MeshPreprocessingFlag values). */
    meshPreprocessParams?: number;
  }): void {
    const cp = this._pxCookingParams;
    if (params.meshWeldTolerance !== undefined) {
      cp.meshWeldTolerance = params.meshWeldTolerance;
    }
    if (params.meshPreprocessParams !== undefined) {
      this._physX.setCookingMeshPreprocessParams(cp, params.meshPreprocessParams);
    }
  }

  /**
   * {@inheritDoc IPhysics.createPhysicsManager }
   */
  createPhysicsManager(): IPhysicsManager {
    return new PhysXPhysicsManager();
  }

  /**
   * {@inheritDoc IPhysics.createPhysicsScene }
   */
  createPhysicsScene(
    physicsManager: PhysXPhysicsManager,
    onContactBegin?: (collision: ICollision) => void,
    onContactEnd?: (collision: ICollision) => void,
    onContactStay?: (collision: ICollision) => void,
    onTriggerBegin?: (obj1: number, obj2: number) => void,
    onTriggerEnd?: (obj1: number, obj2: number) => void,
    onTriggerStay?: (obj1: number, obj2: number) => void
  ): IPhysicsScene {
    const scene = new PhysXPhysicsScene(
      this,
      physicsManager,
      onContactBegin,
      onContactEnd,
      onContactStay,
      onTriggerBegin,
      onTriggerEnd,
      onTriggerStay
    );
    return scene;
  }

  /**
   * {@inheritDoc IPhysics.createStaticCollider }
   */
  createStaticCollider(position: Vector3, rotation: Quaternion): IStaticCollider {
    return new PhysXStaticCollider(this, position, rotation);
  }

  /**
   * {@inheritDoc IPhysics.createDynamicCollider }
   */
  createDynamicCollider(position: Vector3, rotation: Quaternion): IDynamicCollider {
    return new PhysXDynamicCollider(this, position, rotation);
  }

  /**
   * {@inheritDoc IPhysics.createCharacterController }
   */
  createCharacterController(): ICharacterController {
    return new PhysXCharacterController(this);
  }

  /**
   * {@inheritDoc IPhysics.createPhysicsMaterial }
   */
  createPhysicsMaterial(
    staticFriction: number,
    dynamicFriction: number,
    bounciness: number,
    frictionCombine: number,
    bounceCombine: number
  ): IPhysicsMaterial {
    return new PhysXPhysicsMaterial(this, staticFriction, dynamicFriction, bounciness, frictionCombine, bounceCombine);
  }

  /**
   * {@inheritDoc IPhysics.createBoxColliderShape }
   */
  createBoxColliderShape(uniqueID: number, size: Vector3, material: PhysXPhysicsMaterial): IBoxColliderShape {
    return new PhysXBoxColliderShape(this, uniqueID, size, material);
  }

  /**
   * {@inheritDoc IPhysics.createSphereColliderShape }
   */
  createSphereColliderShape(uniqueID: number, radius: number, material: PhysXPhysicsMaterial): ISphereColliderShape {
    return new PhysXSphereColliderShape(this, uniqueID, radius, material);
  }

  /**
   * {@inheritDoc IPhysics.createPlaneColliderShape }
   */
  createPlaneColliderShape(uniqueID: number, material: PhysXPhysicsMaterial): IPlaneColliderShape {
    return new PhysXPlaneColliderShape(this, uniqueID, material);
  }

  /**
   * {@inheritDoc IPhysics.createCapsuleColliderShape }
   */
  createCapsuleColliderShape(
    uniqueID: number,
    radius: number,
    height: number,
    material: PhysXPhysicsMaterial
  ): ICapsuleColliderShape {
    return new PhysXCapsuleColliderShape(this, uniqueID, radius, height, material);
  }

  /**
   * {@inheritDoc IPhysics.createMeshColliderShape }
   */
  createMeshColliderShape(
    uniqueID: number,
    vertices: Float32Array,
    vertexCount: number,
    indices: Uint16Array | Uint32Array | null,
    isConvex: boolean,
    material: PhysXPhysicsMaterial
  ): IMeshColliderShape {
    return new PhysXMeshColliderShape(this, uniqueID, vertices, vertexCount, indices, isConvex, material);
  }

  /**
   * {@inheritDoc IPhysics.createFixedJoint }
   */
  createFixedJoint(collider: PhysXCollider): IFixedJoint {
    return new PhysXFixedJoint(this, collider);
  }

  /**
   * {@inheritDoc IPhysics.createHingeJoint }
   */
  createHingeJoint(collider: PhysXCollider): IHingeJoint {
    return new PhysXHingeJoint(this, collider);
  }

  /**
   * {@inheritDoc IPhysics.createSpringJoint }
   */
  createSpringJoint(collider: PhysXCollider): ISpringJoint {
    return new PhysXSpringJoint(this, collider);
  }

  /**
   * {@inheritDoc IPhysics.getColliderLayerCollision }
   */
  getColliderLayerCollision(layer1: number, layer2: number): boolean {
    return this._physX.getGroupCollisionFlag(layer1, layer2);
  }

  /**
   * {@inheritDoc IPhysics.setColliderLayerCollision }
   */
  setColliderLayerCollision(layer1: number, layer2: number, isCollide: boolean): void {
    this._physX.setGroupCollisionFlag(layer1, layer2, isCollide);
  }

  private _init(physX: any): void {
    const version = physX.PX_PHYSICS_VERSION;
    const defaultErrorCallback = new physX.PxDefaultErrorCallback();
    const allocator = new physX.PxDefaultAllocator();
    const pxFoundation = physX.PxCreateFoundation(version, allocator, defaultErrorCallback);
    const tolerancesScale = new physX.PxTolerancesScale();
    const pxPhysics = physX.PxCreatePhysics(version, pxFoundation, tolerancesScale, false, null);

    physX.PxInitExtensions(pxPhysics, null);

    // Initialize cooking for mesh colliders
    const cookingParams = new physX.PxCookingParams(tolerancesScale);
    // Set default cooking params (WeldVertices + small tolerance)
    physX.setCookingMeshPreprocessParams(cookingParams, 1); // WeldVertices = 1
    cookingParams.meshWeldTolerance = 0.001;
    const pxCooking = physX.PxCreateCooking(version, pxFoundation, cookingParams);
    // Keep cookingParams for runtime modification (don't delete)

    this._physX = physX;
    this._pxFoundation = pxFoundation;
    this._pxPhysics = pxPhysics;
    this._pxCooking = pxCooking;
    this._pxCookingParams = cookingParams;
    this._defaultErrorCallback = defaultErrorCallback;
    this._allocator = allocator;
    this._tolerancesScale = tolerancesScale;
  }
}

enum InitializeState {
  Uninitialized,
  Initializing,
  Initialized
}

interface PhysXRuntimeUrls {
  /*** The URL of `PhysXRuntimeMode.WebAssembly` mode. */
  wasmModeUrl?: string;
  /*** The URL of `PhysXRuntimeMode.JavaScript` mode. */
  javaScriptModeUrl?: string;
}
