export class PhysXManager {
  static PhysX: any;
  static physics: any;

  static setup() {
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
