import { AssetType, type GLTFResource, type ResourceManager } from "@galacean/engine";
import { readAnimalAssetCatalog, type AnimalAssetCatalog, type AnimalAssetConfig } from "./AnimalAssetCatalog";
import { registerAnimalCatalog, type RegisteredAnimalCatalog } from "./RegisteredAnimalCatalog";
import type { AnimalTaskProfile } from "./AnimalTaskController";
import { validateAnimalPopulationConfig, type AnimalPopulationConfig } from "./AnimalPopulation";

/** Stable content reference; omitted appearance selects the catalog's authored default. */
export interface AnimalAssetReference {
  readonly typeId: string;
  readonly appearanceId?: string;
}

/** Validated content binding, independent of a scene instance and its transform or behavior state. */
export interface ResolvedAnimalAsset {
  readonly reference: Required<AnimalAssetReference>;
  readonly config: AnimalAssetConfig;
  readonly profile: AnimalTaskProfile;
}

/** Borrowed native GLB resource; instances own their entities, never the shared resource. */
export interface LoadedAnimalAsset extends ResolvedAnimalAsset {
  readonly resource: GLTFResource;
}

/**
 * Resolve stable animal references through one authored catalog and the engine's native resource cache.
 * Resources with the same absolute URL share download, parsing, meshes, textures and clips. Different
 * appearance GLBs remain separate resources; this class does not pretend their animation buffers are shared.
 */
export class AnimalAssetLibrary {
  readonly catalog: AnimalAssetCatalog;
  readonly registered: RegisteredAnimalCatalog;
  private readonly assets = new Map<string, AnimalAssetConfig>();
  private readonly bindings = new Map<string, ResolvedAnimalAsset>();

  /**
   * Validate and detach authoring data before any resource request or scene mutation.
   * @param resourceManager The owning engine's native resource manager and cache.
   * @param catalog Versioned resource catalog, whose model ids become stable type ids.
   * @param registrations Semantic animation and behavior registrations for that catalog.
   * @param baseUrl Absolute catalog file URL, or directory URL ending in a slash, used to normalize model URLs.
   */
  constructor(
    private readonly resourceManager: ResourceManager,
    catalog: unknown,
    registrations: unknown,
    private readonly baseUrl: string
  ) {
    new URL(baseUrl);
    this.catalog = readAnimalAssetCatalog(structuredClone(catalog));
    this.registered = registerAnimalCatalog(structuredClone(registrations), this.catalog.animals);
    for (const config of this.catalog.animals) {
      if (config.appearances?.length && !config.appearances.some((a) => a.modelUrl === config.modelUrl))
        throw new Error(`Default appearance is not registered: ${config.id}`);
      this.assets.set(config.id, config);
    }
  }

  /**
   * Resolve a content reference without loading a model or creating an instance.
   * @param reference Stable type/appearance identity; unknown values fail instead of falling back silently.
   * @returns Shared read-only authoring binding with an explicit default appearance identity.
   */
  resolve(reference: AnimalAssetReference): ResolvedAnimalAsset {
    const source = this.assets.get(reference?.typeId);
    if (!source) throw new Error(`Unknown animal type: ${reference?.typeId}`);
    const appearances = source.appearances ?? [];
    const appearanceId =
      reference.appearanceId ?? appearances.find((a) => a.modelUrl === source.modelUrl)?.id ?? "default";
    const appearance = appearances.find((a) => a.id === appearanceId);
    if (!appearance && (appearances.length > 0 || appearanceId !== "default"))
      throw new Error(`Unknown animal appearance: ${source.id}/${appearanceId}`);
    const key = JSON.stringify([source.id, appearanceId]);
    let binding = this.bindings.get(key);
    if (!binding) {
      binding = {
        reference: Object.freeze({ typeId: source.id, appearanceId }),
        config: Object.freeze({
          ...source,
          modelUrl: new URL(appearance?.modelUrl ?? source.modelUrl, this.baseUrl).href
        }),
        profile: this.registered.behaviors.profiles[source.behaviorProfile]
      };
      this.bindings.set(key, binding);
    }
    return binding;
  }

  /** Resolve initialization pools without downloading models. Omitted pools include every registered appearance equally.
   * @param config Population counts, ranges and optional per-type appearance weights.
   * @returns Detached configuration with stable, validated appearance identifiers, sorted independently of catalog order.
   * @throws For invalid weights, ambiguous fixed/pool choices or unknown type/appearance references, including zero weights.
   */
  resolvePopulationConfig(config: AnimalPopulationConfig): AnimalPopulationConfig {
    validateAnimalPopulationConfig(config);
    const result = structuredClone(config);
    for (const type of result.types) {
      const representative = this.resolve(type);
      if (type.appearanceId !== undefined) continue;
      type.appearances ??= this.assets
        .get(type.typeId)!
        .appearances?.map(({ id }) => ({ appearanceId: id, weight: 1 }));
      if (!type.appearances?.length)
        type.appearances = [{ appearanceId: representative.reference.appearanceId, weight: 1 }];
      for (const choice of type.appearances) this.resolve({ typeId: type.typeId, appearanceId: choice.appearanceId });
      type.appearances.sort((a, b) => (a.appearanceId < b.appearanceId ? -1 : a.appearanceId > b.appearanceId ? 1 : 0));
    }
    return result;
  }

  /**
   * Borrow a model through the native completed/in-flight URL cache; no instance-owned cache or download exists.
   * @param reference Stable content identity, also used in saved instance documents.
   * @param signal Cancel this consumer's wait. A pre-aborted signal starts no request; an already dispatched
   * native request may finish and enter the shared cache, because other consumers can borrow the same URL.
   * @returns The resolved binding and shared native GLB. Dispose scene instances without destroying this resource.
   */
  async load(reference: AnimalAssetReference, signal?: AbortSignal): Promise<LoadedAnimalAsset> {
    signal?.throwIfAborted();
    const binding = this.resolve(reference);
    const request = this.resourceManager.load<GLTFResource>({
      url: binding.config.modelUrl,
      type: AssetType.GLTF
    });
    // The first native load returns the shared root promise, not a consumer-owned cancel handle.
    // Cancelling it would also reject unrelated callers loading this URL from the same manager.
    const resource = signal
      ? await new Promise<GLTFResource>((resolve, reject) => {
          const abort = () => {
            signal.removeEventListener("abort", abort);
            reject(signal.reason);
          };
          signal.addEventListener("abort", abort, { once: true });
          request.then(
            (resource) => {
              signal.removeEventListener("abort", abort);
              if (signal.aborted) reject(signal.reason);
              else resolve(resource);
            },
            (error) => {
              signal.removeEventListener("abort", abort);
              reject(error);
            }
          );
          if (signal.aborted) abort();
        })
      : await request;
    signal?.throwIfAborted();
    return { ...binding, resource };
  }
}
