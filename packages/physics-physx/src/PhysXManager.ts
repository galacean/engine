import { PHYSX } from "./physx.release";

enum PhysXTarget {
  release,
  profile,
  checked,
  debug,
}

/**
 * Store and Init the foundation of PhysX Object
 * @internal
 */
export class PhysXManager {
  /** PhysX wasm object */
  static PhysX: any;
  /** Physx physics object */
  static physics: any;
  /** Physx Visual Debugger */
  static pvdTransport: any;
  static socket: WebSocket;
  static queue = [];
  static physxTarget: PhysXTarget = PhysXTarget.release;

  /**
   * Initialize PhysX Object.
   * */
  public static init(): Promise<void> {
    return new Promise((resolve) => {
      PHYSX().then(function(PHYSX) {
        PhysXManager.PhysX = PHYSX;
        PhysXManager._setup();
        console.log("PHYSX loaded");

        resolve();
      });
    });
  }

  private static _setupPVD() {
    this.pvdTransport = PhysXManager.PhysX.PxPvdTransport.implement({
      connect: function() {
        PhysXManager.socket = new WebSocket("ws://127.0.0.1:8090", ["binary"]);
        PhysXManager.socket.onopen = () => {
          console.log("Connected to PhysX Debugger");
          PhysXManager.queue.forEach((data) => PhysXManager.socket.send(data));
          PhysXManager.queue = [];
        };
        PhysXManager.socket.onclose = () => {
        };
        return true;
      },
      disconnect: function() {
        console.log("Socket disconnect");
      },
      isConnected: function() {
      },
      write: function(inBytes, inLength) {
        const data = PhysXManager.PhysX.HEAPU8.slice(inBytes, inBytes + inLength);
        if (PhysXManager.socket.readyState === WebSocket.OPEN) {
          if (PhysXManager.queue.length) {
            PhysXManager.queue.forEach((data) => PhysXManager.socket.send(data));
            PhysXManager.queue.length = 0;
          }
          PhysXManager.socket.send(data);
        } else {
          PhysXManager.queue.push(data);
        }
        return true;
      }
    });
  }

  private static _setup() {
    const version = PhysXManager.PhysX.PX_PHYSICS_VERSION;
    const defaultErrorCallback = new PhysXManager.PhysX.PxDefaultErrorCallback();
    const allocator = new PhysXManager.PhysX.PxDefaultAllocator();
    const foundation = PhysXManager.PhysX.PxCreateFoundation(version, allocator, defaultErrorCallback);

    if (PhysXManager.physxTarget != PhysXTarget.release) {
      this._setupPVD();
      const gPvd = PhysXManager.PhysX.PxCreatePvd(foundation);
      gPvd.connect(
        PhysXManager.pvdTransport,
        new PhysXManager.PhysX.PxPvdInstrumentationFlags(PhysXManager.PhysX.PxPvdInstrumentationFlag.eALL.value);

      this.physics = PhysXManager.PhysX.PxCreatePhysics(
        version,
        foundation,
        new PhysXManager.PhysX.PxTolerancesScale(),
        true,
        gPvd
      );
    } else {
      this.physics = PhysXManager.PhysX.PxCreatePhysics(
        version,
        foundation,
        new PhysXManager.PhysX.PxTolerancesScale(),
        false,
        null
      );
    }

    PhysXManager.PhysX.PxInitExtensions(this.physics, null);
  }
}
