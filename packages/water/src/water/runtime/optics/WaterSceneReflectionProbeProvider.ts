import { registerWaterContentRestorer } from "../resources/WaterContentRestorer";
/** Scene-owned local cubemap capture published to Water as a borrowed environment binding. */
import {
  Camera,
  Engine,
  EngineEventType,
  Entity,
  Layer,
  RenderTarget,
  SystemInfo,
  TextureCube,
  TextureCubeFace,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine-core";
import { Matrix, Vector3 } from "@galacean/engine-math";
import {
  isValidWaterEnvironmentReflectionProjection,
  type WaterEnvironmentReflectionBinding,
  type WaterEnvironmentReflectionBoxProjection
} from "./WaterEnvironmentReflectionTypes";
import type { WaterReflectionService } from "./WaterReflectionService";

const DEFAULT_RESOLUTION = 128;
const DEFAULT_NEAR_CLIP = 0.3;
const DEFAULT_FAR_CLIP = 1000;
const CUBE_FACE_COUNT = 6;

const CUBE_FACE_BASIS = Object.freeze([
  Object.freeze({ face: TextureCubeFace.PositiveX, direction: [1, 0, 0] as const, up: [0, -1, 0] as const }),
  Object.freeze({ face: TextureCubeFace.NegativeX, direction: [-1, 0, 0] as const, up: [0, -1, 0] as const }),
  Object.freeze({ face: TextureCubeFace.PositiveY, direction: [0, 1, 0] as const, up: [0, 0, 1] as const }),
  Object.freeze({ face: TextureCubeFace.NegativeY, direction: [0, -1, 0] as const, up: [0, 0, -1] as const }),
  Object.freeze({ face: TextureCubeFace.PositiveZ, direction: [0, 0, 1] as const, up: [0, -1, 0] as const }),
  Object.freeze({ face: TextureCubeFace.NegativeZ, direction: [0, 0, -1] as const, up: [0, -1, 0] as const })
]);

export interface WaterSceneReflectionProbeProviderOptions {
  readonly engine: Engine;
  readonly parent: Entity;
  readonly sourceCamera: Camera;
  readonly service: Pick<WaterReflectionService, "setEnvironmentProvider" | "removeEnvironmentProvider">;
  readonly id: string;
  readonly projection: Readonly<WaterEnvironmentReflectionBoxProjection>;
  readonly priority?: number;
  /** Dynamic scene-owned contribution gate. Defaults to one. */
  readonly intensity?: number | (() => number);
  readonly resolution?: number;
  readonly nearClip?: number;
  readonly farClip?: number;
  readonly hdr?: boolean;
  /** Defaults to the source Camera's culling mask at capture time. */
  readonly cullingMask?: Layer;
  /** Water layers must be excluded to avoid self-reflection and feedback. */
  readonly excludedLayerMask?: Layer;
}

interface WaterSceneReflectionProbeResource {
  readonly entity: Entity;
  readonly camera: Camera;
  readonly texture: TextureCube;
  readonly renderTarget: RenderTarget;
  readonly hdr: boolean;
  readonly colorFormat: "r16g16b16a16-float" | "r8g8b8a8-unorm";
}

function requireFinite(name: string, value: number, minimum: number): number {
  if (!Number.isFinite(value) || value < minimum) {
    throw new RangeError(`${name} must be finite and at least ${minimum}.`);
  }
  return value;
}

function readFiniteValue(name: string, value: number | (() => number), minimum: number): number {
  return requireFinite(name, typeof value === "function" ? value() : value, minimum);
}

/**
 * Captures a finite local environment once (or on an explicit recapture) and
 * publishes it through the same generic environment source used by all Water
 * backends. The provider owns the Camera, RT, and cubemap; Water only borrows
 * the resulting binding and never destroys it.
 */
export class WaterSceneReflectionProbeProvider {
  private readonly _engine: Engine;
  private readonly _sourceCamera: Camera;
  private readonly _service: WaterSceneReflectionProbeProviderOptions["service"];
  private readonly _id: string;
  private readonly _priority: number;
  private readonly _intensitySource: number | (() => number);
  private readonly _projection: Readonly<WaterEnvironmentReflectionBoxProjection>;
  private readonly _requestedHDR: boolean;
  private readonly _configuredCullingMask?: Layer;
  private readonly _excludedLayerMask: Layer;
  private readonly _resource: WaterSceneReflectionProbeResource;
  private readonly _probePosition = new Vector3();
  private readonly _faceTarget = new Vector3();
  private readonly _faceUp = new Vector3();
  private readonly _viewMatrix = new Matrix();
  private _revision?: number;
  private _binding?: Readonly<WaterEnvironmentReflectionBinding>;
  private _captured = false;
  private _restorePending = false;
  private readonly _onDeviceRestored = () => {
    if (!this._destroyed && this._restorePending) {
      this.capture();
      this._restorePending = false;
    }
  };
  private _destroyed = false;

  constructor(options: WaterSceneReflectionProbeProviderOptions) {
    const id = options.id.trim();
    if (!id) throw new Error("Water scene reflection probe id must be non-empty.");
    if (!Number.isFinite(options.priority ?? 0)) {
      throw new RangeError("Water scene reflection probe priority must be finite.");
    }
    if (!isValidWaterEnvironmentReflectionProjection(options.projection)) {
      throw new TypeError("Water scene reflection probe projection must be a finite non-empty box.");
    }
    const resolution = Math.floor(
      requireFinite("Water scene reflection probe resolution", options.resolution ?? DEFAULT_RESOLUTION, 1)
    );
    const nearClip = requireFinite(
      "Water scene reflection probe near clip",
      options.nearClip ?? DEFAULT_NEAR_CLIP,
      0.0001
    );
    const farClip = requireFinite(
      "Water scene reflection probe far clip",
      options.farClip ?? DEFAULT_FAR_CLIP,
      nearClip + 0.0001
    );

    this._engine = options.engine;
    this._sourceCamera = options.sourceCamera;
    this._service = options.service;
    this._id = id;
    this._priority = options.priority ?? 0;
    this._intensitySource = options.intensity ?? 1;
    this._projection = options.projection;
    this._requestedHDR = options.hdr !== false;
    this._configuredCullingMask = options.cullingMask;
    this._excludedLayerMask = options.excludedLayerMask ?? (0 as Layer);
    this._probePosition.set(...options.projection.probePosition);
    this._resource = this._createPreferredResource(options.parent, resolution, nearClip, farClip);
    // This probe is captured once, unlike frame-repainted reflection targets. Recapture only
    // after ALL asynchronous asset restorers finish, so scene textures and geometry are ready.
    registerWaterContentRestorer(this._engine, this._resource.texture, () => {
      this._restorePending = this._captured;
    });
    this._engine.on(EngineEventType.DeviceRestored, this._onDeviceRestored);
  }

  /** Synchronous six-face capture. Call only after the scene contents are ready. */
  capture(): Readonly<WaterEnvironmentReflectionBinding> {
    this._assertActive();
    const intensity = readFiniteValue("Water scene reflection probe intensity", this._intensitySource, 0);
    const resource = this._resource;
    const camera = resource.camera;
    const cullingMask = this._configuredCullingMask ?? this._sourceCamera.cullingMask;
    camera.clearFlags = this._sourceCamera.clearFlags;
    camera.cullingMask = (cullingMask & ~this._excludedLayerMask) as Layer;
    camera.entity.transform.setWorldPosition(this._probePosition.x, this._probePosition.y, this._probePosition.z);

    for (const basis of CUBE_FACE_BASIS) {
      this._faceTarget.set(
        this._probePosition.x + basis.direction[0],
        this._probePosition.y + basis.direction[1],
        this._probePosition.z + basis.direction[2]
      );
      this._faceUp.set(basis.up[0], basis.up[1], basis.up[2]);
      Matrix.lookAt(this._probePosition, this._faceTarget, this._faceUp, this._viewMatrix);
      camera.viewMatrix = this._viewMatrix;
      camera.render(basis.face);
    }
    resource.texture.generateMipmaps();

    const binding: Readonly<WaterEnvironmentReflectionBinding> = Object.freeze({
      providerId: this._id,
      role: "local-probe" as const,
      texture: resource.texture,
      ownership: "borrowed" as const,
      rotationDegrees: 0,
      exposure: 1,
      intensity,
      colorSpace: resource.texture.isSRGBColorSpace ? ("srgb" as const) : ("linear" as const),
      hdr: resource.hdr,
      maximumMipLevel: Math.max(0, resource.texture.mipmapCount - 1),
      projection: this._projection
    });
    this._publish(binding);
    this._captured = true;
    return binding;
  }

  /** Republishes numeric scene state without recapturing or replacing the cubemap. */
  refresh(): Readonly<WaterEnvironmentReflectionBinding> | undefined {
    this._assertActive();
    const previous = this._binding;
    if (!previous) return undefined;
    const intensity = readFiniteValue("Water scene reflection probe intensity", this._intensitySource, 0);
    const next =
      previous.intensity === intensity
        ? previous
        : Object.freeze({
            ...previous,
            intensity
          });
    if (next === previous && this._revision !== undefined) return next;
    this._publish(next);
    return next;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._engine.off(EngineEventType.DeviceRestored, this._onDeviceRestored);
    this._service.removeEnvironmentProvider(this._id, this._revision);
    this._revision = undefined;
    this._binding = undefined;
    const resource = this._resource;
    resource.camera.renderTarget = null;
    resource.renderTarget.destroy(true);
    resource.texture.destroy(true);
    resource.entity.destroy();
  }

  private _createPreferredResource(
    parent: Entity,
    resolution: number,
    nearClip: number,
    farClip: number
  ): WaterSceneReflectionProbeResource {
    if (this._requestedHDR && SystemInfo.supportsTextureFormat(this._engine, TextureFormat.R16G16B16A16)) {
      try {
        return this._createResource(parent, resolution, nearClip, farClip, true);
      } catch {
        // A texture format can be sampleable without being color-renderable.
        // The explicit LDR retry keeps the provider available and observable.
      }
    }
    return this._createResource(parent, resolution, nearClip, farClip, false);
  }

  private _createResource(
    parent: Entity,
    resolution: number,
    nearClip: number,
    farClip: number,
    hdr: boolean
  ): WaterSceneReflectionProbeResource {
    let texture: TextureCube | undefined;
    let renderTarget: RenderTarget | undefined;
    let entity: Entity | undefined;
    let camera: Camera | undefined;
    try {
      texture = new TextureCube(
        this._engine,
        resolution,
        hdr ? TextureFormat.R16G16B16A16 : TextureFormat.R8G8B8A8,
        true,
        !hdr
      );
      texture.name = `${this._id}-cubemap`;
      texture.filterMode = TextureFilterMode.Bilinear;
      texture.wrapModeU = TextureWrapMode.Clamp;
      texture.wrapModeV = TextureWrapMode.Clamp;
      texture.isGCIgnored = true;
      renderTarget = new RenderTarget(this._engine, resolution, resolution, texture, TextureFormat.Depth24, 1);
      renderTarget.autoGenerateMipmaps = false;
      entity = parent.createChild(`${this._id}-capture-camera`);
      camera = entity.addComponent(Camera);
      camera.enabled = false;
      camera.fieldOfView = 90;
      camera.aspectRatio = 1;
      camera.nearClipPlane = nearClip;
      camera.farClipPlane = farClip;
      camera.enableHDR = hdr;
      camera.enablePostProcess = false;
      camera.opaqueTextureEnabled = false;
      camera.isAlphaOutputRequired = hdr;
      camera.renderTarget = renderTarget;
      return Object.freeze({
        entity,
        camera,
        texture,
        renderTarget,
        hdr,
        colorFormat: hdr ? "r16g16b16a16-float" : "r8g8b8a8-unorm"
      });
    } catch (error) {
      if (camera && camera.renderTarget === renderTarget) camera.renderTarget = null;
      renderTarget?.destroy(true);
      texture?.destroy(true);
      entity?.destroy();
      throw error;
    }
  }

  private _assertActive(): void {
    if (this._destroyed) throw new Error("Water scene reflection probe has been destroyed.");
  }

  private _publish(binding: Readonly<WaterEnvironmentReflectionBinding>): void {
    this._binding = binding;
    this._revision = this._service.setEnvironmentProvider(
      Object.freeze({
        id: this._id,
        role: "local-probe" as const,
        priority: this._priority,
        active: true,
        binding
      })
    );
  }
}
