export class PhysXManager {
  /*PhysX wasm object*/
  static PhysX: any;
  /*Physx physics object*/
  static physics: any;

  /**
   * called in Engine
   * @internal
   */
  static _setup() {
    const version = PhysXManager.PhysX.PX_PHYSICS_VERSION;
    const defaultErrorCallback = new PhysXManager.PhysX.PxDefaultErrorCallback();
    const allocator = new PhysXManager.PhysX.PxDefaultAllocator();
    const foundation = PhysXManager.PhysX.PxCreateFoundation(version, allocator, defaultErrorCallback);

    this.physics = PhysXManager.PhysX.PxCreatePhysics(
      version,
      foundation,
      new PhysXManager.PhysX.PxTolerancesScale(),
      false,
      null
    );
    PhysXManager.PhysX.PxInitExtensions(this.physics, null);
  }
}
