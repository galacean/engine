import { AssetType, Texture2D, TextureFilterMode, TextureWrapMode, type Engine } from "@galacean/engine-core";
import { LAKE_NORMAL_ASSET_ID, LAKE_NORMAL_CONTENT_HASH } from "./LakeNormalAssetIdentity";
import { digestSha256Hex } from "../sha256";
import { BUILTIN_WATER_PROJECT_URL } from "../../native/WaterBuiltinAssets";

export { LAKE_NORMAL_ASSET_ID, LAKE_NORMAL_CONTENT_HASH };
export const LAKE_NORMAL_WIDTH = 512;
export const LAKE_NORMAL_HEIGHT = 512;
export const LAKE_LOCAL_NORMAL_WIDTH = 1024;
export const LAKE_LOCAL_NORMAL_HEIGHT = 1024;
export const LAKE_TRACKED_NORMAL_URL = new URL(`Water/Textures/${LAKE_NORMAL_ASSET_ID}.ktx2`, BUILTIN_WATER_PROJECT_URL)
  .href;
export const LAKE_TRACKED_NORMAL_SHA256 = "4ba55626a9d761edf5d5beb7d71eafdf2e9d393e3029b33491b0dd3d44159594";

export type LakeNormalAssetSource = "tracked" | "local-override";

export type LakeNormalAssetFallbackReason =
  | "grasslands-local-override-not-enabled"
  | "grasslands-normal-fetch-failed"
  | "grasslands-normal-hash-verification-failed"
  | "grasslands-normal-hash-mismatch"
  | "grasslands-normal-dimensions-mismatch"
  | "grasslands-normal-texture-load-failed";

export interface LakeNormalAssetLoaderDependencies {
  fetchBytes(url: string): Promise<ArrayBuffer>;
  digestSha256(bytes: ArrayBuffer): Promise<string>;
  loadTexture(engine: Engine, url: string, type: AssetType.Texture | AssetType.KTX2): Promise<Texture2D>;
}

export interface LakeNormalAssetLoaderOptions {
  /** Strict is the public/CI default and rejects instead of substituting a placeholder. */
  readonly strict?: boolean;
  /** Tracked is always the default. Local override requires the explicit development gate below. */
  readonly source?: LakeNormalAssetSource;
  /** Caller-resolved URL; required for a development local override. */
  readonly sourceUrl?: string;
  readonly enableDevelopmentLocalOverride?: boolean;
  readonly dependencies?: Partial<LakeNormalAssetLoaderDependencies>;
}

export interface LakeAppearanceBindingTextureMetadata {
  readonly assetId: typeof LAKE_NORMAL_ASSET_ID;
  readonly contentHash: typeof LAKE_NORMAL_CONTENT_HASH;
  readonly texture: Texture2D;
  readonly ownership: "borrowed";
}

export interface LakeNormalTextureResource {
  readonly source: LakeNormalAssetSource;
  readonly sourceUrl: string;
  readonly assetId: typeof LAKE_NORMAL_ASSET_ID;
  readonly contentHash: typeof LAKE_NORMAL_CONTENT_HASH;
  readonly width: typeof LAKE_NORMAL_WIDTH | typeof LAKE_LOCAL_NORMAL_WIDTH;
  readonly height: typeof LAKE_NORMAL_HEIGHT | typeof LAKE_LOCAL_NORMAL_HEIGHT;
  readonly colorSpace: "linear";
  readonly wrapU: "repeat";
  readonly wrapV: "repeat";
  readonly filter: "bilinear";
  readonly mipmaps: true;
  readonly anisotropy: 1;
  readonly texture: Texture2D;
  readonly bindingMetadata: LakeAppearanceBindingTextureMetadata;
}

export interface LakeNormalAssetLoaderReadback {
  readonly strict: boolean;
  readonly requestedSource: LakeNormalAssetSource;
  readonly sourceUrl: string;
  readonly ready: boolean;
  readonly assetId: typeof LAKE_NORMAL_ASSET_ID;
  readonly expectedContentHash: string;
  readonly actualContentHash?: string;
  readonly width: number;
  readonly height: number;
  readonly colorSpace?: "linear";
  readonly wrapU?: "repeat";
  readonly wrapV?: "repeat";
  readonly filter?: "bilinear";
  readonly mipmaps?: true;
  readonly anisotropy?: 1;
  readonly activeRuntimeBorrowCount: number;
  readonly textureCreateCount: number;
  readonly textureDestroyCount: number;
  readonly disposeRequested: boolean;
  readonly disposed: boolean;
  readonly fallbackReason?: LakeNormalAssetFallbackReason;
  readonly fallbackMessage?: string;
}

type MutableLakeNormalAssetLoaderReadback = {
  -readonly [Property in keyof LakeNormalAssetLoaderReadback]: LakeNormalAssetLoaderReadback[Property];
};

export class LakeNormalAssetLoadError extends Error {
  constructor(
    readonly fallbackReason: LakeNormalAssetFallbackReason,
    message: string
  ) {
    super(message);
    this.name = "LakeNormalAssetLoadError";
  }
}

async function fetchAssetBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    cache: "no-cache",
    credentials: "same-origin"
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}

const defaultDependencies: LakeNormalAssetLoaderDependencies = {
  fetchBytes: fetchAssetBytes,
  digestSha256: digestSha256Hex,
  async loadTexture(engine, url, type): Promise<Texture2D> {
    return engine.resourceManager.load<Texture2D>({
      type,
      url,
      ...(type === AssetType.Texture ? { params: { isSRGBColorSpace: false, mipmap: true } } : {})
    });
  }
};

/**
 * Strict, caller-owned loader for the one tracked Grasslands normal texture.
 *
 * Runtime use is borrowed. Call {@link acquireRuntimeBorrow} before binding,
 * release the returned lease only after Runtime detach/dispose, then call
 * {@link disposeAfterRuntimeDetach}. The Loader is the only code here that
 * destroys the Texture2D, and repeated disposal remains a no-op.
 */
export class LakeNormalAssetLoader {
  readonly readback: LakeNormalAssetLoaderReadback;

  private readonly _strict: boolean;
  private readonly _source: LakeNormalAssetSource;
  private readonly _sourceUrl: string;
  private readonly _enableDevelopmentLocalOverride: boolean;
  private readonly _dependencies: LakeNormalAssetLoaderDependencies;
  private readonly _mutableReadback: MutableLakeNormalAssetLoaderReadback;
  private _resource: LakeNormalTextureResource | null = null;
  private _loadPromise: Promise<LakeNormalTextureResource | null> | null = null;
  private _disposeRequested = false;
  private _disposed = false;

  constructor(
    private readonly _engine: Engine,
    options: LakeNormalAssetLoaderOptions = {}
  ) {
    this._strict = options.strict ?? true;
    this._source = options.source ?? "tracked";
    this._sourceUrl = options.sourceUrl ?? (this._source === "local-override" ? "" : LAKE_TRACKED_NORMAL_URL);
    this._enableDevelopmentLocalOverride = options.enableDevelopmentLocalOverride ?? false;
    this._dependencies = {
      ...defaultDependencies,
      ...options.dependencies
    };
    this._mutableReadback = {
      strict: this._strict,
      requestedSource: this._source,
      sourceUrl: this._sourceUrl,
      ready: false,
      assetId: LAKE_NORMAL_ASSET_ID,
      expectedContentHash: this._source === "tracked" ? LAKE_TRACKED_NORMAL_SHA256 : LAKE_NORMAL_CONTENT_HASH,
      actualContentHash: undefined,
      width: 0,
      height: 0,
      colorSpace: undefined,
      wrapU: undefined,
      wrapV: undefined,
      filter: undefined,
      mipmaps: undefined,
      anisotropy: undefined,
      activeRuntimeBorrowCount: 0,
      textureCreateCount: 0,
      textureDestroyCount: 0,
      disposeRequested: false,
      disposed: false,
      fallbackReason: undefined,
      fallbackMessage: undefined
    };
    this.readback = Object.seal(this._mutableReadback);
  }

  get resource(): LakeNormalTextureResource | null {
    return this._resource;
  }

  async load(): Promise<LakeNormalTextureResource | null> {
    if (this._disposed) {
      throw new Error("LakeNormalAssetLoader cannot load after disposal.");
    }
    if (this._resource) return this._resource;
    if (this._loadPromise) return this._loadPromise;

    const pending = this._loadOnce();
    this._loadPromise = pending;
    try {
      return await pending;
    } finally {
      if (this._loadPromise === pending) this._loadPromise = null;
      if (this._disposeRequested && this._mutableReadback.activeRuntimeBorrowCount === 0) {
        this.disposeAfterRuntimeDetach();
      }
    }
  }

  /**
   * Returns an idempotent lease release. Release it only after Runtime has
   * detached the borrowed binding or has itself been disposed.
   */
  acquireRuntimeBorrow(): () => void {
    if (!this._resource || this._disposed) {
      throw new Error("Grasslands normal must be loaded before Runtime borrows it.");
    }
    this._mutableReadback.activeRuntimeBorrowCount++;
    let released = false;
    return (): void => {
      if (released) return;
      released = true;
      this._mutableReadback.activeRuntimeBorrowCount--;
    };
  }

  /**
   * Destroys the caller-owned texture exactly once after all Runtime leases
   * have been released. It refuses to hide an ordering bug.
   */
  disposeAfterRuntimeDetach(): void {
    if (this._disposed) return;
    if (this._loadPromise) {
      throw new Error("Grasslands normal is still loading; await load() before Loader disposal.");
    }
    if (this._mutableReadback.activeRuntimeBorrowCount !== 0) {
      throw new Error("Grasslands normal is still borrowed by Runtime; detach/dispose Runtime before Loader disposal.");
    }
    this._disposeRequested = true;
    this._mutableReadback.disposeRequested = true;
    this._disposed = true;
    this._mutableReadback.disposed = true;
    this._mutableReadback.ready = false;
    const texture = this._resource?.texture;
    this._resource = null;
    if (texture) {
      texture.destroy(true);
      this._mutableReadback.textureDestroyCount++;
    }
  }

  /**
   * Requests caller-owned cleanup even when an async load is still pending.
   * A completed load is destroyed before control returns to a disposed caller.
   */
  requestDisposeAfterRuntimeDetach(): void {
    if (this._disposed) return;
    this._disposeRequested = true;
    this._mutableReadback.disposeRequested = true;
    if (this._loadPromise) return;
    this.disposeAfterRuntimeDetach();
  }

  private async _loadOnce(): Promise<LakeNormalTextureResource | null> {
    this._clearFailure();
    if (this._source === "local-override" && !this._enableDevelopmentLocalOverride) {
      return this._fail(
        "grasslands-local-override-not-enabled",
        "Grasslands local normal override requires the explicit development-only enableDevelopmentLocalOverride option."
      );
    }
    if (this._source === "local-override" && !this._sourceUrl) {
      return this._fail("grasslands-normal-fetch-failed", "Lake local normal override requires an explicit sourceUrl.");
    }

    let bytes: ArrayBuffer;
    try {
      bytes = await this._dependencies.fetchBytes(this._sourceUrl);
    } catch (error) {
      return this._fail(
        "grasslands-normal-fetch-failed",
        `Grasslands normal is unavailable at ${this._sourceUrl}: ${this._errorMessage(error)}`
      );
    }
    if (this._disposeRequested) return null;

    let actualContentHash: string;
    try {
      actualContentHash = await this._dependencies.digestSha256(bytes);
    } catch (error) {
      return this._fail(
        "grasslands-normal-hash-verification-failed",
        `Grasslands normal SHA-256 verification failed: ${this._errorMessage(error)}`
      );
    }
    if (this._disposeRequested) return null;
    this._mutableReadback.actualContentHash = actualContentHash;
    const expectedContentHash = this._source === "tracked" ? LAKE_TRACKED_NORMAL_SHA256 : LAKE_NORMAL_CONTENT_HASH;
    if (actualContentHash !== expectedContentHash) {
      return this._fail(
        "grasslands-normal-hash-mismatch",
        `Grasslands normal SHA-256 mismatch: expected ${expectedContentHash}, received ${actualContentHash}.`
      );
    }

    let texture: Texture2D;
    try {
      texture = await this._dependencies.loadTexture(
        this._engine,
        this._sourceUrl,
        this._source === "tracked" ? AssetType.KTX2 : AssetType.Texture
      );
      this._mutableReadback.textureCreateCount++;
    } catch (error) {
      return this._fail(
        "grasslands-normal-texture-load-failed",
        `Grasslands normal texture failed to load: ${this._errorMessage(error)}`
      );
    }
    if (this._disposeRequested) {
      texture.destroy(true);
      this._mutableReadback.textureDestroyCount++;
      return null;
    }

    const expectedWidth = this._source === "tracked" ? LAKE_NORMAL_WIDTH : LAKE_LOCAL_NORMAL_WIDTH;
    const expectedHeight = this._source === "tracked" ? LAKE_NORMAL_HEIGHT : LAKE_LOCAL_NORMAL_HEIGHT;
    if (!(texture instanceof Texture2D) || texture.width !== expectedWidth || texture.height !== expectedHeight) {
      texture.destroy(true);
      this._mutableReadback.textureDestroyCount++;
      return this._fail(
        "grasslands-normal-dimensions-mismatch",
        `Grasslands normal dimensions mismatch: expected ${expectedWidth}x${expectedHeight}, received ${texture.width}x${texture.height}.`
      );
    }
    texture.name = `GrasslandsWaterNormal${texture.width}`;
    texture.filterMode = TextureFilterMode.Bilinear;
    texture.wrapModeU = TextureWrapMode.Repeat;
    texture.wrapModeV = TextureWrapMode.Repeat;
    texture.anisoLevel = 1;
    texture.isGCIgnored = true;

    const bindingMetadata = Object.freeze<LakeAppearanceBindingTextureMetadata>({
      assetId: LAKE_NORMAL_ASSET_ID,
      contentHash: LAKE_NORMAL_CONTENT_HASH,
      texture,
      ownership: "borrowed"
    });
    this._resource = Object.freeze({
      source: this._source,
      sourceUrl: this._sourceUrl,
      assetId: LAKE_NORMAL_ASSET_ID,
      contentHash: LAKE_NORMAL_CONTENT_HASH,
      width: expectedWidth,
      height: expectedHeight,
      colorSpace: "linear",
      wrapU: "repeat",
      wrapV: "repeat",
      filter: "bilinear",
      mipmaps: true,
      anisotropy: 1,
      texture,
      bindingMetadata
    });
    this._mutableReadback.ready = true;
    this._mutableReadback.width = texture.width;
    this._mutableReadback.height = texture.height;
    this._mutableReadback.colorSpace = "linear";
    this._mutableReadback.wrapU = "repeat";
    this._mutableReadback.wrapV = "repeat";
    this._mutableReadback.filter = "bilinear";
    this._mutableReadback.mipmaps = true;
    this._mutableReadback.anisotropy = 1;
    return this._resource;
  }

  private _clearFailure(): void {
    this._mutableReadback.actualContentHash = undefined;
    this._mutableReadback.fallbackReason = undefined;
    this._mutableReadback.fallbackMessage = undefined;
  }

  private _fail(fallbackReason: LakeNormalAssetFallbackReason, fallbackMessage: string): null {
    this._mutableReadback.ready = false;
    this._mutableReadback.fallbackReason = fallbackReason;
    this._mutableReadback.fallbackMessage = fallbackMessage;
    if (this._strict) {
      throw new LakeNormalAssetLoadError(fallbackReason, fallbackMessage);
    }
    return null;
  }

  private _errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
