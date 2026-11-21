import { Quaternion, SystemInfo, Vector3 } from "@galacean/engine";
import {
  IBoxColliderShape,
  ICapsuleColliderShape,
  ICharacterController,
  IDynamicCollider,
  IFixedJoint,
  IHingeJoint,
  IMeshColliderShape,
  IPhysics,
  IPhysicsMaterialProperties,
  IPhysicsScene,
  IPlaneColliderShape,
  ISphereColliderShape,
  ISpringJoint,
  IStaticCollider
} from "@galacean/engine-design";
import { PhysXCharacterController } from "./PhysXCharacterController";
import { PhysXCollider } from "./PhysXCollider";
import { PhysXDynamicCollider } from "./PhysXDynamicCollider";
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
  /** @internal PhysX cooking params */
  _pxCookingParams: any;

  private _initializePromise: Promise<void> | null = null;
  private _defaultErrorCallback: any;
  private _allocator: any;

  /**
   * Creates a PhysX backend.
   * @param runtimeMode - Runtime mode. `Auto` prefers WebAssembly SIMD when supported.
   * @param runtimeUrls - Overrides the packaged loaders. Use a module with a default factory in module Workers
   * and Node.js. Each override locates its own WebAssembly binary.
   */
  constructor(
    private readonly _runtimeMode: PhysXRuntimeMode = PhysXRuntimeMode.Auto,
    private readonly _runtimeUrls?: PhysXRuntimeUrls
  ) {}

  /**
   * Loads the selected PhysX runtime and initializes the backend.
   */
  initialize(): Promise<void> {
    return (this._initializePromise ??= this._initialize().catch((error) => {
      this._initializePromise = null;
      throw error;
    }));
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
  }

  /**
   * {@inheritDoc IPhysics.createPhysicsScene }
   */
  createPhysicsScene(): IPhysicsScene {
    const scene = new PhysXPhysicsScene(this);
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
  createCharacterController(uniqueID: number, material: PhysXPhysicsMaterial): ICharacterController {
    return new PhysXCharacterController(this, uniqueID, material);
  }

  /**
   * {@inheritDoc IPhysics.createPhysicsMaterial }
   */
  createPhysicsMaterial(properties: IPhysicsMaterialProperties): PhysXPhysicsMaterial {
    return new PhysXPhysicsMaterial(this, properties);
  }

  /**
   * {@inheritDoc IPhysics.createBoxColliderShape }
   */
  createBoxColliderShape(uniqueID: number, halfExtents: Vector3, material: PhysXPhysicsMaterial): IBoxColliderShape {
    return new PhysXBoxColliderShape(this, uniqueID, halfExtents, material);
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
    halfHeight: number,
    material: PhysXPhysicsMaterial,
    upAxis: number
  ): ICapsuleColliderShape {
    return new PhysXCapsuleColliderShape(this, uniqueID, radius, halfHeight, material, upAxis);
  }

  /**
   * {@inheritDoc IPhysics.createMeshColliderShape }
   */
  createMeshColliderShape(
    uniqueID: number,
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    isConvex: boolean,
    material: PhysXPhysicsMaterial,
    cookingFlags: number,
    scale: Vector3
  ): IMeshColliderShape | null {
    const shape = new PhysXMeshColliderShape(
      this,
      uniqueID,
      positions,
      indices,
      isConvex,
      material,
      cookingFlags,
      scale
    );
    return shape._pxShape ? shape : null;
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

  private async _initialize(): Promise<void> {
    const mode = this._runtimeMode;
    const simd =
      mode === PhysXRuntimeMode.WebAssemblySIMD ||
      (mode === PhysXRuntimeMode.Auto && SystemInfo._detectSIMDSupported());
    const host = globalThis as typeof globalThis & {
      PHYSX: PhysXFactory;
      importScripts?: (...urls: string[]) => void;
    };
    const hasDocument = typeof document !== "undefined";
    const useModule = !hasDocument && !isClassicWorker(host);
    const override = simd ? this._runtimeUrls?.wasmSIMDModeUrl : this._runtimeUrls?.wasmModeUrl;
    const [scriptUrl, wasmUrl] = override
      ? ([override, undefined] as const)
      : (capturedRuntimeUrls?.[simd ? 1 : 0] ?? getPackagedRuntimeUrls(simd, useModule));
    let create: PhysXFactory;
    let locateFile: ((file: string) => string) | undefined = wasmUrl ? () => wasmUrl : undefined;
    if (useModule) {
      create = (await import(/* @vite-ignore */ scriptUrl)).default;
    } else if (!hasDocument) {
      const runtimeUrl = new URL(scriptUrl, location.href).href;
      host.importScripts!(runtimeUrl);
      create = host.PHYSX;
      locateFile ??= (file: string) => new URL(file, runtimeUrl).href;
    } else {
      create = await new Promise<PhysXFactory>((resolve, reject) => {
        const script = document.createElement("script");
        script.crossOrigin = "anonymous";
        script.src = scriptUrl;
        script.onload = () => {
          script.remove();
          resolve(host.PHYSX);
        };
        script.onerror = () => {
          script.remove();
          reject(new Error(`Failed to load PhysX runtime: ${scriptUrl}`));
        };
        document.head.appendChild(script);
      });
    }
    if (typeof create !== "function") throw new Error(`No PhysX factory was exported by ${scriptUrl}.`);
    this._init(await create(locateFile ? { locateFile } : undefined), simd);
  }

  private _init(physX: any, simd: boolean): void {
    const version = physX.PX_PHYSICS_VERSION;
    const defaultErrorCallback = new physX.PxDefaultErrorCallback();
    const allocator = new physX.PxDefaultAllocator();
    const pxFoundation = physX.PxCreateFoundation(version, allocator, defaultErrorCallback);
    const tolerancesScale = new physX.PxTolerancesScale();
    const pxPhysics = physX.PxCreatePhysics(version, pxFoundation, tolerancesScale, false, null);

    physX.PxInitExtensions(pxPhysics, null);

    // Initialize cooking for mesh colliders
    const cookingParams = new physX.PxCookingParams(tolerancesScale);
    // PxPhysics and PxCookingParams copy the scale
    tolerancesScale.delete();
    physX.setCookingMeshPreprocessParams(cookingParams, 1); // eWELD_VERTICES
    cookingParams.meshWeldTolerance = 0.001;
    // BVH34 midphase requires SSE2; SIMD WASM provides SSE2 via WASM SIMD
    if (simd) {
      physX.setCookingMidphaseType(cookingParams, 1); // eBVH34
    }
    const pxCooking = physX.PxCreateCooking(version, pxFoundation, cookingParams);

    this._physX = physX;
    this._pxFoundation = pxFoundation;
    this._pxPhysics = pxPhysics;
    this._pxCooking = pxCooking;
    this._pxCookingParams = cookingParams;
    this._defaultErrorCallback = defaultErrorCallback;
    this._allocator = allocator;
  }
}

// A classic script's URL is available only while its module is evaluating.
const capturedRuntimeUrls =
  typeof document !== "undefined" && document.currentScript?.getAttribute("src")
    ? [getPackagedRuntimeUrls(false), getPackagedRuntimeUrls(true)]
    : undefined;

function isClassicWorker(host: { importScripts?: (...urls: string[]) => void }): boolean {
  if (!host.importScripts) return false;
  try {
    // Module Workers expose importScripts but reject even an empty call.
    host.importScripts();
    return true;
  } catch {
    return false;
  }
}

function getPackagedRuntimeUrls(simd: boolean, useModule = false): [script: string, wasm: string] {
  return simd
    ? [
        useModule
          ? new URL("../libs/physx.release.simd.mjs", import.meta.url).href
          : new URL("../libs/physx.release.simd.js", import.meta.url).href,
        new URL("../libs/physx.release.simd.wasm", import.meta.url).href
      ]
    : [
        useModule
          ? new URL("../libs/physx.release.mjs", import.meta.url).href
          : new URL("../libs/physx.release.js", import.meta.url).href,
        new URL("../libs/physx.release.wasm", import.meta.url).href
      ];
}

type PhysXFactory = (options?: { locateFile: (file: string) => string }) => Promise<any>;

interface PhysXRuntimeUrls {
  /** The URL of `PhysXRuntimeMode.WebAssembly` mode. */
  wasmModeUrl?: string;
  /** The URL of `PhysXRuntimeMode.WebAssemblySIMD` mode. */
  wasmSIMDModeUrl?: string;
}
