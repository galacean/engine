/** Scene adapter that publishes AmbientLight reflection data as a borrowed Water binding. */
import type { AmbientLight } from "@galacean/engine-core";
import type {
  WaterEnvironmentReflectionBinding,
  WaterEnvironmentReflectionFrame,
  WaterEnvironmentReflectionLobe,
  WaterEnvironmentReflectionProjection,
  WaterEnvironmentReflectionRole,
  WaterEnvironmentReflectionProviderRequest
} from "./WaterEnvironmentReflectionTypes";
import { isValidWaterEnvironmentReflectionFrame } from "./WaterEnvironmentReflectionTypes";
import type { WaterReflectionService } from "./WaterReflectionService";

export type WaterEnvironmentReflectionProviderService = Pick<
  WaterReflectionService,
  "setEnvironmentProvider" | "removeEnvironmentProvider"
>;

export interface WaterEnvironmentReflectionSource {
  readonly ambientLight: Pick<AmbientLight, "specularTexture" | "specularIntensity"> &
    Partial<Pick<AmbientLight, "secondarySpecularTexture" | "specularTextureBlend">>;
  readonly rotationDegrees: number | (() => number);
  readonly exposure: number | (() => number);
  /** The scene loader knows whether its source was authored as HDR. */
  readonly hdr: boolean;
  /** Omitted for sky IBL; local scene cubemaps may publish box projection. */
  readonly projection?: Readonly<WaterEnvironmentReflectionProjection>;
  /** Optional authoritative scene frame. When present, Water does not infer scene time or phase. */
  readonly readFrame?: () => Readonly<WaterEnvironmentReflectionFrame> | undefined;
}

export interface WaterEnvironmentReflectionProviderOptions {
  readonly service: WaterEnvironmentReflectionProviderService;
  readonly id: string;
  readonly priority?: number;
  /** Distant procedural-sky IBL by default; finite scene captures must opt into Local Probe. */
  readonly role?: WaterEnvironmentReflectionRole;
  readonly source: WaterEnvironmentReflectionSource;
  readonly active?: boolean;
}

export interface WaterEnvironmentReflectionProviderInspection {
  readonly id: string;
  readonly role: WaterEnvironmentReflectionRole;
  readonly active: boolean;
  readonly published: boolean;
  readonly available: boolean;
  readonly ownership: "borrowed" | "unavailable";
  readonly publishCount: number;
  readonly refreshCount: number;
  readonly rotationDegrees: number;
  readonly exposure: number;
  readonly intensity: number;
  readonly colorSpace: "linear" | "srgb";
  readonly hdr: boolean;
  readonly maximumMipLevel: number;
  readonly revision: number;
  readonly secondaryAvailable: boolean;
  readonly secondaryWeight: number;
  readonly secondaryMaximumMipLevel: number;
  readonly projectionMode: "infinite" | "box";
}

function readFiniteValue(name: string, value: number | (() => number), minimum: number): number {
  const resolved = typeof value === "function" ? value() : value;
  if (!Number.isFinite(resolved) || resolved < minimum) {
    throw new RangeError(`${name} must be finite and at least ${minimum}.`);
  }
  return resolved;
}

function readRotation(value: number | (() => number)): number {
  const resolved = typeof value === "function" ? value() : value;
  if (!Number.isFinite(resolved)) throw new RangeError("Environment reflection rotation must be finite.");
  return resolved;
}

/**
 * One provider is scene-scoped, not water-body-scoped. Multiple water bodies
 * consume the service's selected snapshot without duplicating the cubemap.
 */
export class WaterEnvironmentReflectionProvider {
  private readonly _service: WaterEnvironmentReflectionProviderService;
  private readonly _id: string;
  private readonly _priority: number;
  private readonly _role: WaterEnvironmentReflectionRole;
  private _source: WaterEnvironmentReflectionSource;
  private _active: boolean;
  private _revision?: number;
  private _binding?: Readonly<WaterEnvironmentReflectionBinding>;
  private _frame?: Readonly<WaterEnvironmentReflectionFrame>;
  private _frameRevision = 0;
  private _publishCount = 0;
  private _refreshCount = 0;
  private _destroyed = false;

  constructor(options: WaterEnvironmentReflectionProviderOptions) {
    const id = options.id.trim();
    if (!id) throw new Error("Environment reflection provider id must be non-empty.");
    if (!Number.isFinite(options.priority ?? 0)) {
      throw new RangeError("Environment reflection provider priority must be finite.");
    }
    this._service = options.service;
    this._id = id;
    this._priority = options.priority ?? 0;
    this._role = options.role ?? "distant-environment";
    if (this._role === "distant-environment" && options.source.projection !== undefined) {
      throw new TypeError("Distant environment reflection must not publish a finite projection.");
    }
    if (this._role === "local-probe" && options.source.projection?.mode !== "box") {
      throw new TypeError("Local environment reflection must publish a finite box projection.");
    }
    this._source = options.source;
    this._active = options.active !== false;
    this.refresh();
  }

  get inspection(): Readonly<WaterEnvironmentReflectionProviderInspection> {
    const binding = this._binding;
    return Object.freeze({
      id: this._id,
      role: this._role,
      active: this._active && !this._destroyed,
      published: this._revision !== undefined && !this._destroyed,
      available: binding !== undefined && this._active && !this._destroyed,
      ownership: binding && this._active && !this._destroyed ? "borrowed" : "unavailable",
      publishCount: this._publishCount,
      refreshCount: this._refreshCount,
      rotationDegrees: binding?.rotationDegrees ?? 0,
      exposure: binding?.exposure ?? 0,
      intensity: binding?.intensity ?? 0,
      colorSpace: binding?.colorSpace ?? "linear",
      hdr: binding?.hdr ?? false,
      maximumMipLevel: binding?.maximumMipLevel ?? 0,
      revision: this._frame?.revision ?? 0,
      secondaryAvailable: this._frame?.secondary !== undefined,
      secondaryWeight: this._frame?.secondaryWeight ?? 0,
      secondaryMaximumMipLevel: this._frame?.secondary?.maximumMipLevel ?? 0,
      projectionMode: binding?.projection?.mode ?? "infinite"
    });
  }

  /** Atomically switches the scene source; the previous cubemap is never destroyed. */
  setSource(source: WaterEnvironmentReflectionSource): void {
    this._assertActive();
    if (this._role === "distant-environment" && source.projection !== undefined) {
      throw new TypeError("Distant environment reflection must not publish a finite projection.");
    }
    if (this._role === "local-probe" && source.projection?.mode !== "box") {
      throw new TypeError("Local environment reflection must publish a finite box projection.");
    }
    this._refresh(source, this._active);
  }

  setActive(active: boolean): void {
    this._assertActive();
    if (typeof active !== "boolean") throw new TypeError("Environment reflection active state must be boolean.");
    if (this._active === active) return;
    this._refresh(this._source, active);
  }

  /** Publishes only when identity or numeric scene state changes. */
  refresh(): Readonly<WaterEnvironmentReflectionBinding> | undefined {
    this._assertActive();
    return this._refresh(this._source, this._active);
  }

  /** Prepares source/frame/binding locally and commits only after service publication succeeds. */
  private _refresh(
    source: WaterEnvironmentReflectionSource,
    active: boolean
  ): Readonly<WaterEnvironmentReflectionBinding> | undefined {
    this._refreshCount++;
    const publishedFrame = source.readFrame?.();
    if (publishedFrame && !isValidWaterEnvironmentReflectionFrame(publishedFrame)) {
      throw new TypeError("Environment reflection frame must satisfy the immutable dual-lobe contract.");
    }
    if (publishedFrame && publishedFrame.providerId !== this._id) {
      throw new Error(
        `Environment reflection frame provider '${publishedFrame.providerId}' does not match '${this._id}'.`
      );
    }
    if (publishedFrame && publishedFrame.role !== this._role) {
      throw new Error(`Environment reflection frame role '${publishedFrame.role}' does not match '${this._role}'.`);
    }
    const texture = source.ambientLight.specularTexture;
    const rotationDegrees = readRotation(source.rotationDegrees);
    const exposure = readFiniteValue("Environment reflection exposure", source.exposure, 0);
    const intensity = readFiniteValue("Environment reflection intensity", source.ambientLight.specularIntensity, 0);
    const projection = source.projection;
    const colorSpace = texture?.isSRGBColorSpace ? "srgb" : "linear";
    const maximumMipLevel = texture ? Math.max(0, texture.mipmapCount - 1) : 0;
    const createLobe = (
      candidate: typeof texture | null | undefined
    ): Readonly<WaterEnvironmentReflectionLobe> | undefined =>
      candidate
        ? Object.freeze({
            texture: candidate,
            ownership: "borrowed" as const,
            rotationDegrees,
            exposure,
            intensity,
            colorSpace: candidate.isSRGBColorSpace ? ("srgb" as const) : ("linear" as const),
            hdr: source.hdr,
            maximumMipLevel: Math.max(0, candidate.mipmapCount - 1),
            projection
          })
        : undefined;
    const previousFrame = this._frame;
    let nextFrame: Readonly<WaterEnvironmentReflectionFrame> | undefined;
    let nextFrameRevision = this._frameRevision;
    if (active && publishedFrame) {
      nextFrame = publishedFrame;
      nextFrameRevision = Math.max(nextFrameRevision, publishedFrame.revision);
    } else if (texture && active) {
      const secondaryTexture = source.ambientLight.secondarySpecularTexture ?? undefined;
      const secondaryWeight = secondaryTexture
        ? Math.min(1, Math.max(0, source.ambientLight.specularTextureBlend ?? 0))
        : 0;
      const unchanged =
        previousFrame &&
        previousFrame.primary.texture === texture &&
        previousFrame.primary.rotationDegrees === rotationDegrees &&
        previousFrame.primary.exposure === exposure &&
        previousFrame.primary.intensity === intensity &&
        previousFrame.primary.colorSpace === colorSpace &&
        previousFrame.primary.hdr === source.hdr &&
        previousFrame.primary.maximumMipLevel === maximumMipLevel &&
        previousFrame.primary.projection === projection &&
        previousFrame.secondary?.texture === secondaryTexture &&
        previousFrame.secondaryWeight === secondaryWeight;
      nextFrame = unchanged
        ? previousFrame
        : Object.freeze({
            providerId: this._id,
            role: this._role,
            revision: ++nextFrameRevision,
            primary: createLobe(texture)!,
            secondary: createLobe(secondaryTexture),
            secondaryWeight
          });
    }
    const previous = this._binding;
    const primary = nextFrame?.primary;
    const next = primary
      ? previous &&
        previous.providerId === nextFrame!.providerId &&
        previous.texture === primary.texture &&
        previous.rotationDegrees === primary.rotationDegrees &&
        previous.exposure === primary.exposure &&
        previous.intensity === primary.intensity &&
        previous.colorSpace === primary.colorSpace &&
        previous.hdr === primary.hdr &&
        previous.maximumMipLevel === primary.maximumMipLevel &&
        previous.projection === primary.projection
        ? previous
        : Object.freeze({
            providerId: nextFrame!.providerId,
            role: nextFrame!.role,
            ...primary
          })
      : undefined;
    if (next === previous && nextFrame === previousFrame && this._revision !== undefined) {
      this._source = source;
      this._active = active;
      return next;
    }
    const request: WaterEnvironmentReflectionProviderRequest = Object.freeze({
      id: this._id,
      role: this._role,
      priority: this._priority,
      active,
      binding: next,
      frame: nextFrame
    });
    const nextRevision = this._service.setEnvironmentProvider(request);
    this._source = source;
    this._active = active;
    this._binding = next;
    this._frame = nextFrame;
    this._frameRevision = nextFrameRevision;
    this._revision = nextRevision;
    this._publishCount++;
    return next;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._service.removeEnvironmentProvider(this._id, this._revision);
    this._destroyed = true;
    this._revision = undefined;
    this._binding = undefined;
    this._frame = undefined;
  }

  private _assertActive(): void {
    if (this._destroyed) throw new Error("Environment reflection provider has been destroyed.");
  }
}
