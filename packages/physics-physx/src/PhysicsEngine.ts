import {
  IPhysicsEngine,
  IPhysicsMaterial,
  IPlaneCollider,
  IPhysicsManager,
  IPhysicsBox,
  IPhysicsSphere,
  IPhysicsCapsule,
  IDynamicCollider,
  IStaticCollider
} from "@oasis-engine/design";
import { PhysicsMaterial } from "./PhysicsMaterial";
import { PlaneCollider } from "./PlaneCollider";
import { PhysicsManager } from "./PhysicsManager";
import { PhysXManager } from "./PhysXManager";
import { PhysicsBox } from "./PhysicsBox";
import { PhysicsSphere } from "./PhysicsSphere";
import { PhysicsCapsule } from "./PhysicsCapsule";
import { DynamicCollider } from "./DynamicCollider";
import { StaticCollider } from "./StaticCollider";

export class PhysicsEngine implements IPhysicsEngine {
  createPhysicsMaterial(staticFriction: number, dynamicFriction: number, bounciness: number): IPhysicsMaterial {
    return new PhysicsMaterial(staticFriction, dynamicFriction, bounciness);
  }

  createPhysicsBox(): IPhysicsBox {
    return new PhysicsBox();
  }

  createPhysicsSphere(): IPhysicsSphere {
    return new PhysicsSphere();
  }

  createPhysicsCapsule(): IPhysicsCapsule {
    return new PhysicsCapsule();
  }

  createPlaneCollider(): IPlaneCollider {
    return new PlaneCollider();
  }

  createDynamicCollider(): IDynamicCollider {
    return new DynamicCollider();
  }

  createStaticCollider(): IStaticCollider {
    return new StaticCollider();
  }

  createPhysicsManager(
    onContactBegin?: Function,
    onContactEnd?: Function,
    onContactPersist?: Function,
    onTriggerBegin?: Function,
    onTriggerEnd?: Function,
    onTriggerPersist?: Function
  ): IPhysicsManager {
    return new PhysicsManager(
      onContactBegin,
      onContactEnd,
      onContactPersist,
      onTriggerBegin,
      onTriggerEnd,
      onTriggerPersist
    );
  }

  static init(): Promise<void> {
    return new Promise((resolve) => {
      PhysXManager.init().then(() => {
        resolve();
      });
    });
  }
}
