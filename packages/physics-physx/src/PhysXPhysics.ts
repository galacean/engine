import {
  IBoxColliderShape,
  ICapsuleColliderShape,
  ICharacterController,
  IDynamicCollider,
  IPhysics,
  IPhysicsManager,
  IPhysicsMaterial,
  IPlaneColliderShape,
  ISphereColliderShape,
  IStaticCollider,
  IFixedJoint,
  IHingeJoint,
  ISpringJoint
} from "@oasis-engine/design";
import { Quaternion, Vector3 } from "oasis-engine";
import { PhysXRuntimeMode } from "./enum/PhysXRuntimeMode";
import { PhysXCharacterController } from "./PhysXCharacterController";
import { PhysXDynamicCollider } from "./PhysXDynamicCollider";
import { PhysXPhysicsManager } from "./PhysXPhysicsManager";
import { PhysXPhysicsMaterial } from "./PhysXPhysicsMaterial";
import { PhysXStaticCollider } from "./PhysXStaticCollider";
import { PhysXBoxColliderShape } from "./shape/PhysXBoxColliderShape";
import { PhysXCapsuleColliderShape } from "./shape/PhysXCapsuleColliderShape";
import { PhysXPlaneColliderShape } from "./shape/PhysXPlaneColliderShape";
import { PhysXSphereColliderShape } from "./shape/PhysXSphereColliderShape";
import { PhysXFixedJoint } from "./joint/PhysXFixedJoint";
import { PhysXHingeJoint } from "./joint/PhysXHingeJoint";
import { PhysXSpringJoint } from "./joint/PhysXSpringJoint";
import { StaticInterfaceImplement } from "./StaticInterfaceImplement";
import { PhysXCollider } from "./PhysXCollider";

/**
 * PhysX object creation.
 */
@StaticInterfaceImplement<IPhysics>()
export class PhysXPhysics {
  /** @internal PhysX wasm object */
  static _physX: any;
  /** @internal PhysX Foundation SDK singleton class */
  static _pxFoundation: any;
  /** @internal Physx physics object */
  static _pxPhysics: any;

  /**
   * Initialize PhysXPhysics.
   * @param runtimeMode - Runtime mode
   * @returns Promise object
   */
  public static initialize(runtimeMode: PhysXRuntimeMode = PhysXRuntimeMode.Auto): Promise<void> {
    const scriptPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      document.body.appendChild(script);
      script.async = true;
      script.onload = resolve;

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
      if (runtimeMode == PhysXRuntimeMode.Auto) {
        if (supported) {
          runtimeMode = PhysXRuntimeMode.WebAssembly;
        } else {
          runtimeMode = PhysXRuntimeMode.JavaScript;
        }
      }

      if (runtimeMode == PhysXRuntimeMode.JavaScript) {
        script.src =
          "https://gw.alipayobjects.com/os/lib/oasis-engine/physics-physx/0.8.0-alpha.6/libs/physx.release.js.js";
      } else if (runtimeMode == PhysXRuntimeMode.WebAssembly) {
        script.src =
          "https://gw.alipayobjects.com/os/lib/oasis-engine/physics-physx/0.8.0-alpha.6/libs/physx.release.js";
      }
    });

    return new Promise((resolve) => {
      scriptPromise.then(() => {
        (<any>window).PHYSX().then((PHYSX) => {
          PhysXPhysics._init(PHYSX);
          PhysXPhysicsManager._init();
          console.log("PhysX loaded.");
          resolve();
        });
      });
    });
  }

  /**
   * Destroy PhysXPhysics.
   */
  public static destroy(): void {
    this._pxFoundation.release();
    this._pxPhysics.release();
  }

  /**
   * {@inheritDoc IPhysics.createPhysicsManager }
   */
  static createPhysicsManager(
    onContactBegin?: (obj1: number, obj2: number) => void,
    onContactEnd?: (obj1: number, obj2: number) => void,
    onContactStay?: (obj1: number, obj2: number) => void,
    onTriggerBegin?: (obj1: number, obj2: number) => void,
    onTriggerEnd?: (obj1: number, obj2: number) => void,
    onTriggerStay?: (obj1: number, obj2: number) => void
  ): IPhysicsManager {
    return new PhysXPhysicsManager(
      onContactBegin,
      onContactEnd,
      onContactStay,
      onTriggerBegin,
      onTriggerEnd,
      onTriggerStay
    );
  }

  /**
   * {@inheritDoc IPhysics.createStaticCollider }
   */
  static createStaticCollider(position: Vector3, rotation: Quaternion): IStaticCollider {
    return new PhysXStaticCollider(position, rotation);
  }

  /**
   * {@inheritDoc IPhysics.createDynamicCollider }
   */
  static createDynamicCollider(position: Vector3, rotation: Quaternion): IDynamicCollider {
    return new PhysXDynamicCollider(position, rotation);
  }

  /**
   * {@inheritDoc IPhysics.createCharacterController }
   */
  static createCharacterController(): ICharacterController {
    return new PhysXCharacterController();
  }

  /**
   * {@inheritDoc IPhysics.createPhysicsMaterial }
   */
  static createPhysicsMaterial(
    staticFriction: number,
    dynamicFriction: number,
    bounciness: number,
    frictionCombine: number,
    bounceCombine: number
  ): IPhysicsMaterial {
    return new PhysXPhysicsMaterial(staticFriction, dynamicFriction, bounciness, frictionCombine, bounceCombine);
  }

  /**
   * {@inheritDoc IPhysics.createBoxColliderShape }
   */
  static createBoxColliderShape(uniqueID: number, size: Vector3, material: PhysXPhysicsMaterial): IBoxColliderShape {
    return new PhysXBoxColliderShape(uniqueID, size, material);
  }

  /**
   * {@inheritDoc IPhysics.createSphereColliderShape }
   */
  static createSphereColliderShape(
    uniqueID: number,
    radius: number,
    material: PhysXPhysicsMaterial
  ): ISphereColliderShape {
    return new PhysXSphereColliderShape(uniqueID, radius, material);
  }

  /**
   * {@inheritDoc IPhysics.createPlaneColliderShape }
   */
  static createPlaneColliderShape(uniqueID: number, material: PhysXPhysicsMaterial): IPlaneColliderShape {
    return new PhysXPlaneColliderShape(uniqueID, material);
  }

  /**
   * {@inheritDoc IPhysics.createCapsuleColliderShape }
   */
  static createCapsuleColliderShape(
    uniqueID: number,
    radius: number,
    height: number,
    material: PhysXPhysicsMaterial
  ): ICapsuleColliderShape {
    return new PhysXCapsuleColliderShape(uniqueID, radius, height, material);
  }

  /**
   * {@inheritDoc IPhysics.createFixedJoint }
   */
  static createFixedJoint(collider: PhysXCollider): IFixedJoint {
    return new PhysXFixedJoint(collider);
  }

  /**
   * {@inheritDoc IPhysics.createHingeJoint }
   */
  static createHingeJoint(collider: PhysXCollider): IHingeJoint {
    return new PhysXHingeJoint(collider);
  }

  /**
   * {@inheritDoc IPhysics.createSpringJoint }
   */
  static createSpringJoint(collider: PhysXCollider): ISpringJoint {
    return new PhysXSpringJoint(collider);
  }

  private static _init(PHYSX: any): void {
    PhysXPhysics._physX = PHYSX;
    const version = PhysXPhysics._physX.PX_PHYSICS_VERSION;
    const defaultErrorCallback = new PhysXPhysics._physX.PxDefaultErrorCallback();
    const allocator = new PhysXPhysics._physX.PxDefaultAllocator();
    PhysXPhysics._pxFoundation = PhysXPhysics._physX.PxCreateFoundation(version, allocator, defaultErrorCallback);

    this._pxPhysics = PhysXPhysics._physX.PxCreatePhysics(
      version,
      PhysXPhysics._pxFoundation,
      new PhysXPhysics._physX.PxTolerancesScale(),
      false,
      null
    );

    PhysXPhysics._physX.PxInitExtensions(this._pxPhysics, null);
  }
}
