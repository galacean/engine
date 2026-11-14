import {
  createSeedWorldSurfaceNormalTexture,
  SEED_WORLD_SURFACE_NORMAL_RESOLUTION
} from "@galacean/engine-terrain/world/SeedWorldSurfaceNormalTexture";
import { SURFACE_NORMAL_REPEAT_PERIOD } from "@galacean/engine-terrain/world/SeedWorldSurfaceNormalBake";
import {
  reversibleTerrainSteps,
  type PreparedTerrainUpdate
} from "@galacean/engine-terrain/terrain/clipmap/TerrainPreparedUpdate";
import {
  type Engine,
  type ShaderData,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector4
} from "@galacean/engine";
import type { SeedWorldSurfaceMaterialIntent } from "./SeedWorldSurfaceIntent.ts";
import {
  bakeSeedWorldSurfaceReliefMask,
  packSeedWorldSurfaceReliefMask,
  DEFAULT_SURFACE_RELIEF_MASK_TUNING,
  validateSurfaceReliefMaskTuning,
  type SeedWorldSurfaceReliefFields,
  type SeedWorldSurfaceReliefMaskTuning
} from "./SeedWorldSurfaceRelief.ts";

/** Near-surface normal controls; source height, mask and physical terrain are independent of light. */
export interface SeedWorldSurfaceReliefTuning extends Partial<SeedWorldSurfaceReliefMaskTuning> {
  readonly enabled: boolean;
  readonly roadEnabled: boolean;
}

const bindingOwner = new WeakMap<ShaderData, SeedWorldSurfaceReliefRuntime>();

function createMaskTexture(engine: Engine, resolution: number, sizeMetres: number, mask: Uint8Array): Texture2D {
  const pixels = packSeedWorldSurfaceReliefMask(mask, resolution, sizeMetres);
  const texture = new Texture2D(engine, resolution, resolution, TextureFormat.R8G8B8, false, false);
  try {
    texture.filterMode = TextureFilterMode.Bilinear;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    texture.setPixelBuffer(pixels);
    return texture;
  } catch (error) {
    texture.destroy();
    throw error;
  }
}

/** Borrows the shared local pattern and owns derived coverage and one repeating normal tile. */
export class SeedWorldSurfaceReliefRuntime {
  private readonly bindings = new Set<ShaderData>();
  private tuning: Required<SeedWorldSurfaceReliefTuning> = {
    enabled: true,
    roadEnabled: true,
    ...DEFAULT_SURFACE_RELIEF_MASK_TUNING
  };
  private maskTexture: Texture2D | undefined;
  private disposed = false;
  private normalTexture?: Texture2D;
  /**
   * Prepares derived coverage using the shared color pattern without publishing active-scene bindings.
   * @param engine Texture owner.
   * @param fields Immutable published world extent and water mask.
   * @param intent Immutable published material ownership, retained for optional mask generation.
   * @param sharedPattern Borrowed 256-square local color texture, retained by the owning world.
   * @param signal Cancels resources for an abandoned world publication.
   * @returns Runtime with its default normal tile ready before publication.
   */
  static async create(
    engine: Engine,
    fields: SeedWorldSurfaceReliefFields,
    intent: SeedWorldSurfaceMaterialIntent,
    sharedPattern: Texture2D,
    signal?: AbortSignal
  ): Promise<SeedWorldSurfaceReliefRuntime> {
    signal?.throwIfAborted();
    const runtime = new SeedWorldSurfaceReliefRuntime(engine, sharedPattern, fields, intent);
    const request = new AbortController();
    const abort = () => request.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      runtime.maskTexture = runtime.createMaskTexture(runtime.tuning);
      runtime.normalTexture = await createSeedWorldSurfaceNormalTexture(engine, request.signal);
      request.signal.throwIfAborted();
      return runtime;
    } catch (error) {
      runtime.dispose();
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }

  private constructor(
    private readonly engine: Engine,
    private readonly heightTexture: Texture2D,
    private fields: SeedWorldSurfaceReliefFields,
    private intent: SeedWorldSurfaceMaterialIntent
  ) {}

  /** Additional GPU payload owned by relief; the shared color pattern is counted by its owner. */
  get gpuTextureBytes(): number {
    return (
      (this.maskTexture ? this.intent.resolution ** 2 * 3 : 0) +
      (this.normalTexture ? SEED_WORLD_SURFACE_NORMAL_RESOLUTION ** 2 * 3 : 0)
    );
  }

  /** Publishes this world's field to a camera; a newer owner supersedes old-world teardown. */
  bind(data: ShaderData): void {
    if (this.disposed) throw new Error("Cannot bind disposed surface relief");
    this.bindings.add(data);
    bindingOwner.set(data, this);
    data.setTexture("camera_SurfaceReliefHeightTexture", this.heightTexture);
    data.setTexture("camera_SurfaceReliefMaskTexture", this.maskTexture ?? null!);
    this.bindDomain(data);
    this.bindTuning(data);
    this.bindNormal(data);
  }

  private bindDomain(data: ShaderData, fields = this.fields, resolution = this.intent.resolution): void {
    const origin = fields.worldOrigin ?? [-fields.sizeMetres / 2, -fields.sizeMetres / 2];
    data.setVector4("camera_SurfaceReliefDomain", new Vector4(origin[0], origin[1], fields.sizeMetres, resolution));
  }

  private bindNormal(data: ShaderData): void {
    data.setTexture("camera_SurfaceReliefBakedNormal", this.normalTexture ?? null!);
    data.setVector4(
      "camera_SurfaceReliefBakedDomain",
      new Vector4(0, 0, SURFACE_NORMAL_REPEAT_PERIOD, SEED_WORLD_SURFACE_NORMAL_RESOLUTION)
    );
  }

  /** Rebuilds only cached coverage when its curve changes; omitted mask controls retain their values. */
  setTuning(tuning: SeedWorldSurfaceReliefTuning): void {
    if (this.disposed) throw new Error("Cannot tune disposed surface relief");
    if (typeof tuning.enabled !== "boolean" || typeof tuning.roadEnabled !== "boolean")
      throw new TypeError("Surface relief flags must be booleans");
    const nextTuning = {
      ...tuning,
      maskCoverageStart: tuning.maskCoverageStart ?? this.tuning.maskCoverageStart,
      maskSoftnessMetres: tuning.maskSoftnessMetres ?? this.tuning.maskSoftnessMetres
    };
    validateSurfaceReliefMaskTuning(nextTuning);
    const previousMask = this.maskTexture;
    const curveChanged =
      nextTuning.maskCoverageStart !== this.tuning.maskCoverageStart ||
      nextTuning.maskSoftnessMetres !== this.tuning.maskSoftnessMetres;
    const nextMask = !previousMask || curveChanged ? this.createMaskTexture(nextTuning) : previousMask;
    this.maskTexture = nextMask;
    this.tuning = nextTuning;
    for (const data of this.bindings)
      if (bindingOwner.get(data) === this) {
        if (previousMask !== nextMask) data.setTexture("camera_SurfaceReliefMaskTexture", nextMask ?? null!);
        this.bindTuning(data);
      }
    if (previousMask !== nextMask) previousMask?.destroy();
  }

  /** Returns detached current tuning for the world's parameter controls. */
  getTuning(): Required<SeedWorldSurfaceReliefTuning> {
    return { ...this.tuning };
  }

  /** Prepare coverage against a future water/terrain snapshot, retaining the shared height pattern. */
  prepareFields(fields: SeedWorldSurfaceReliefFields, intent: SeedWorldSurfaceMaterialIntent): PreparedTerrainUpdate {
    if (this.disposed) throw Error("Surface relief is disposed");
    const previousFields = this.fields,
      previousIntent = this.intent,
      old = this.maskTexture;
    const nextPixels = old ? bakeSeedWorldSurfaceReliefMask(fields, intent, this.tuning) : undefined;
    const next = nextPixels
      ? createMaskTexture(this.engine, intent.resolution, fields.sizeMetres, nextPixels)
      : undefined;
    const transaction = reversibleTerrainSteps(
      [...this.bindings]
        .filter((data) => bindingOwner.get(data) === this)
        .map((data) => ({
          commit: () => {
            data.setTexture("camera_SurfaceReliefMaskTexture", next ?? null!);
            this.bindDomain(data, fields, intent.resolution);
          },
          rollback: () => {
            data.setTexture("camera_SurfaceReliefMaskTexture", old ?? null!);
            this.bindDomain(data, previousFields, previousIntent.resolution);
          }
        }))
    );
    let state: "prepared" | "committed" | "finished" = "prepared";
    const rollback = () => {
      if (state !== "committed") return;
      try {
        transaction.rollback();
      } finally {
        this.fields = previousFields;
        this.intent = previousIntent;
        this.maskTexture = old;
        state = "prepared";
      }
    };
    return {
      commit: () => {
        if (state !== "prepared" || this.disposed || this.fields !== previousFields || this.maskTexture !== old)
          throw Error("Stale surface relief");
        transaction.commit();
        this.fields = fields;
        this.intent = intent;
        this.maskTexture = next;
        state = "committed";
      },
      rollback,
      finalize: () => {
        if (state !== "committed") throw Error("Surface relief not committed");
        state = "finished";
        old?.destroy();
      },
      discard: () => {
        if (state === "finished") return;
        rollback();
        state = "finished";
        next?.destroy();
      }
    };
  }

  /** Releases each texture once; never clears bindings already claimed by a successor world. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const data of this.bindings)
      if (bindingOwner.get(data) === this) {
        data.setVector4("camera_SurfaceReliefOptions", new Vector4());
        data.setTexture("camera_SurfaceReliefHeightTexture", null!);
        data.setTexture("camera_SurfaceReliefMaskTexture", null!);
        data.setTexture("camera_SurfaceReliefBakedNormal", null!);
        data.setVector4("camera_SurfaceReliefBakedDomain", new Vector4());
        bindingOwner.delete(data);
      }
    this.normalTexture?.destroy();
    this.normalTexture = undefined;
    this.bindings.clear();
    this.maskTexture?.destroy();
    this.maskTexture = undefined;
  }

  private createMaskTexture(tuning: SeedWorldSurfaceReliefMaskTuning): Texture2D {
    const pixels = bakeSeedWorldSurfaceReliefMask(this.fields, this.intent, tuning);
    return createMaskTexture(this.engine, this.intent.resolution, this.fields.sizeMetres, pixels);
  }

  private bindTuning(data: ShaderData): void {
    data.setVector4(
      "camera_SurfaceReliefOptions",
      new Vector4(Number(this.tuning.enabled), Number(this.tuning.roadEnabled), 0, 0)
    );
  }
}
