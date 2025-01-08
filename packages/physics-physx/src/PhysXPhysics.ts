import { Quaternion, Vector3, version } from "@galacean/engine";
import {
  IBoxColliderShape,
  ICapsuleColliderShape,
  ICharacterController,
  ICollision,
  IDynamicCollider,
  IFixedJoint,
  IHingeJoint,
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

  private _runTimeMode: PhysXRuntimeMode;
  private _initializeState: InitializeState = InitializeState.Uninitialized;
  private _initializePromise: Promise<void>;

  constructor(runtimeMode: PhysXRuntimeMode = PhysXRuntimeMode.Auto) {
    this._runTimeMode = runtimeMode;
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
              const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
              if (module instanceof WebAssembly.Module)
                return new WebAssembly.Instance(module) instanceof WebAssembly.Instance;
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
        script.src = `https://mdn.alipayobjects.com/rms/afts/file/A*CfV8RrDQk5oAAAAAAAAAAAAAARQnAQ/physx.release.downgrade.js`;
      } else if (runtimeMode == PhysXRuntimeMode.WebAssembly) {
        script.src = `https://mdn.alipayobjects.com/rms/afts/file/A*ZDDgR4ERdfwAAAAAAAAAAAAAARQnAQ/physx.release.js`;
      }
    });

    const initializePromise = new Promise<void>((resolve, reject) => {
      scriptPromise
        .then(
          () =>
            (<any>window).PHYSX().then((PHYSX) => {
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
  public destroy(): void {
    this._physX.PxCloseExtensions();
    this._pxPhysics.release();
    this._pxFoundation.release();
    this._physX = null;
    this._pxFoundation = null;
    this._pxPhysics = null;
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
    const manager = new PhysXPhysicsScene(
      this,
      physicsManager,
      onContactBegin,
      onContactEnd,
      onContactStay,
      onTriggerBegin,
      onTriggerEnd,
      onTriggerStay
    );
    return manager;
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

  private _init(physX: any): void {
    const version = physX.PX_PHYSICS_VERSION;
    const defaultErrorCallback = new physX.PxDefaultErrorCallback();
    const allocator = new physX.PxDefaultAllocator();
    const pxFoundation = physX.PxCreateFoundation(version, allocator, defaultErrorCallback);
    const pxPhysics = physX.PxCreatePhysics(version, pxFoundation, new physX.PxTolerancesScale(), false, null);

    physX.PxInitExtensions(pxPhysics, null);
    this._physX = physX;
    this._pxFoundation = pxFoundation;
    this._pxPhysics = pxPhysics;
  }
}

enum InitializeState {
  Uninitialized,
  Initializing,
  Initialized
}
