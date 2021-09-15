/**
 * Store and Init the foundation of PhysX Object
 * @internal
 */
export class PhysXManager {
  /** PhysX wasm object */
  static PhysX: any;
  /** Physx physics object */
  static physics: any;

  /**
   * Initialize PhysX Object.
   * */
  public static init(): Promise<void> {
    const scriptPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      document.body.appendChild(script);
      script.async = true;
      script.onload = resolve;
      script.src = "http://30.50.28.4:8000/physx.release.js";
    });

    return new Promise((resolve) => {
      scriptPromise.then(() => {
        (<any>window).PHYSX().then((PHYSX) => {
          PhysXManager.PhysX = PHYSX;
          PhysXManager._setup();
          console.log("PHYSX loaded");
          resolve();
        });
      });
    });
  }

  private static _setup() {
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
