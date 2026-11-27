/** Registered bridge from scene-owned providers to detached Water-owned source data. */
import type { ResolvedWaterBodyInstance } from "../../authoring/body/ResolvedWaterBodyInstance";
import type { TerrainRegionWaterBodySourceV1 } from "../../authoring/body/WaterBodyAuthoringTypes";
import { WaterBodyRegistryError, WaterBodyRegistryErrorCode } from "./WaterBodyAssetRegistry";

export interface WaterBodyProviderResolveContext {
  readonly resolved: ResolvedWaterBodyInstance;
  readonly providerContext?: unknown;
  readonly signal?: AbortSignal;
}

export interface WaterBodySourceProviderFactory {
  readonly id: string;
  resolve(source: TerrainRegionWaterBodySourceV1, context: WaterBodyProviderResolveContext): unknown | Promise<unknown>;
}

export class WaterBodyProviderRegistry {
  private readonly _factories = new Map<string, WaterBodySourceProviderFactory>();
  private _activeResolveCount = 0;

  register(factory: WaterBodySourceProviderFactory): void {
    if (factory.id.trim().length === 0) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.InvalidSource,
        "$.providerId",
        "WaterBody provider id must be non-empty."
      );
    }
    if (this._factories.has(factory.id)) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.DuplicateRegistration,
        "$.providerId",
        `WaterBody provider '${factory.id}' is already registered.`
      );
    }
    this._factories.set(factory.id, factory);
  }

  unregister(providerId: string): boolean {
    return this._factories.delete(providerId);
  }

  has(providerId: string): boolean {
    return this._factories.has(providerId);
  }

  clear(): void {
    if (this._activeResolveCount !== 0) {
      throw new Error("WaterBody providers cannot be cleared while a source resolution is active.");
    }
    this._factories.clear();
  }

  async resolve(source: TerrainRegionWaterBodySourceV1, context: WaterBodyProviderResolveContext): Promise<unknown> {
    const factory = this._factories.get(source.providerId);
    if (!factory) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.InvalidSource,
        "$.providerId",
        `WaterBody provider '${source.providerId}' is not registered.`
      );
    }
    if (context.signal?.aborted) {
      throw new DOMException("WaterBody provider resolution was aborted.", "AbortError");
    }
    this._activeResolveCount++;
    try {
      const value = await factory.resolve(source, context);
      if (context.signal?.aborted) {
        throw new DOMException("WaterBody provider resolution was aborted.", "AbortError");
      }
      return value;
    } finally {
      this._activeResolveCount--;
    }
  }
}
