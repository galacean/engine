import { Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode, type Engine } from "@galacean/engine-core";
import { GRASSLANDS_NORMAL_ASSET_ID, GRASSLANDS_NORMAL_CONTENT_HASH } from "./GrasslandsPcgPreset";

export { GRASSLANDS_NORMAL_ASSET_ID, GRASSLANDS_NORMAL_CONTENT_HASH };
export const GRASSLANDS_NORMAL_WIDTH = 1024;
export const GRASSLANDS_NORMAL_HEIGHT = 1024;
export const GRASSLANDS_TRACKED_NORMAL_URL = "./demo/grasslands/assets/grasslands-water-normal-1024.png";
export const GRASSLANDS_LOCAL_NORMAL_URL = "./demo/grasslands/local-assets/grasslands-water-normal-1024.png";

export type GrasslandsNormalAssetSource = "tracked" | "local-override";

export type GrasslandsAssetFallbackReason =
  | "grasslands-local-override-not-enabled"
  | "grasslands-normal-fetch-failed"
  | "grasslands-normal-hash-verification-failed"
  | "grasslands-normal-hash-mismatch"
  | "grasslands-normal-decode-failed"
  | "grasslands-normal-dimensions-mismatch"
  | "grasslands-normal-texture-create-failed";

export interface GrasslandsDecodedImage {
  readonly source: TexImageSource;
  readonly width: number;
  readonly height: number;
  release(): void;
}

export interface GrasslandsAssetLoaderDependencies {
  fetchBytes(url: string): Promise<ArrayBuffer>;
  digestSha256(bytes: ArrayBuffer): Promise<string>;
  decodeImage(bytes: ArrayBuffer, sourceUrl: string): Promise<GrasslandsDecodedImage>;
  createTexture(
    engine: Engine,
    width: number,
    height: number,
    format: TextureFormat,
    mipmap: boolean,
    isSRGBColorSpace: boolean
  ): Texture2D;
}

export interface GrasslandsAssetLoaderOptions {
  /** Strict is the public/CI default and rejects instead of substituting a placeholder. */
  readonly strict?: boolean;
  /** Tracked is always the default. Local override requires the explicit development gate below. */
  readonly source?: GrasslandsNormalAssetSource;
  readonly enableDevelopmentLocalOverride?: boolean;
  readonly dependencies?: Partial<GrasslandsAssetLoaderDependencies>;
}

export interface GrasslandsAppearanceBindingTextureMetadata {
  readonly assetId: typeof GRASSLANDS_NORMAL_ASSET_ID;
  readonly contentHash: typeof GRASSLANDS_NORMAL_CONTENT_HASH;
  readonly texture: Texture2D;
  readonly ownership: "borrowed";
}

export interface GrasslandsNormalTextureResource {
  readonly source: GrasslandsNormalAssetSource;
  readonly sourceUrl: string;
  readonly assetId: typeof GRASSLANDS_NORMAL_ASSET_ID;
  readonly contentHash: typeof GRASSLANDS_NORMAL_CONTENT_HASH;
  readonly width: typeof GRASSLANDS_NORMAL_WIDTH;
  readonly height: typeof GRASSLANDS_NORMAL_HEIGHT;
  readonly colorSpace: "linear";
  readonly wrapU: "repeat";
  readonly wrapV: "repeat";
  readonly filter: "bilinear";
  readonly mipmaps: true;
  readonly anisotropy: 1;
  readonly texture: Texture2D;
  readonly bindingMetadata: GrasslandsAppearanceBindingTextureMetadata;
}

export interface GrasslandsAssetLoaderReadback {
  readonly strict: boolean;
  readonly requestedSource: GrasslandsNormalAssetSource;
  readonly sourceUrl: string;
  readonly ready: boolean;
  readonly assetId: typeof GRASSLANDS_NORMAL_ASSET_ID;
  readonly expectedContentHash: typeof GRASSLANDS_NORMAL_CONTENT_HASH;
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
  readonly fallbackReason?: GrasslandsAssetFallbackReason;
  readonly fallbackMessage?: string;
}

type MutableGrasslandsAssetLoaderReadback = {
  -readonly [Property in keyof GrasslandsAssetLoaderReadback]: GrasslandsAssetLoaderReadback[Property];
};

export class GrasslandsAssetLoadError extends Error {
  constructor(
    readonly fallbackReason: GrasslandsAssetFallbackReason,
    message: string
  ) {
    super(message);
    this.name = "GrasslandsAssetLoadError";
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

async function digestSha256(bytes: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto SHA-256 is unavailable.");
  }
  const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function decodeImage(bytes: ArrayBuffer, sourceUrl: string): Promise<GrasslandsDecodedImage> {
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
  const image = new Image();
  image.decoding = "async";
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Grasslands normal image failed to decode: ${sourceUrl}`));
  });
  image.src = objectUrl;
  try {
    await loaded;
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
  let released = false;
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release(): void {
      if (released) return;
      released = true;
      URL.revokeObjectURL(objectUrl);
    }
  };
}

const defaultDependencies: GrasslandsAssetLoaderDependencies = {
  fetchBytes: fetchAssetBytes,
  digestSha256,
  decodeImage,
  createTexture(engine, width, height, format, mipmap, isSRGBColorSpace): Texture2D {
    return new Texture2D(engine, width, height, format, mipmap, isSRGBColorSpace);
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
export class GrasslandsAssetLoader {
  readonly readback: GrasslandsAssetLoaderReadback;

  private readonly _strict: boolean;
  private readonly _source: GrasslandsNormalAssetSource;
  private readonly _sourceUrl: string;
  private readonly _enableDevelopmentLocalOverride: boolean;
  private readonly _dependencies: GrasslandsAssetLoaderDependencies;
  private readonly _mutableReadback: MutableGrasslandsAssetLoaderReadback;
  private _resource: GrasslandsNormalTextureResource | null = null;
  private _loadPromise: Promise<GrasslandsNormalTextureResource | null> | null = null;
  private _disposeRequested = false;
  private _disposed = false;

  constructor(
    private readonly _engine: Engine,
    options: GrasslandsAssetLoaderOptions = {}
  ) {
    this._strict = options.strict ?? true;
    this._source = options.source ?? "tracked";
    this._sourceUrl = this._source === "local-override" ? GRASSLANDS_LOCAL_NORMAL_URL : GRASSLANDS_TRACKED_NORMAL_URL;
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
      assetId: GRASSLANDS_NORMAL_ASSET_ID,
      expectedContentHash: GRASSLANDS_NORMAL_CONTENT_HASH,
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

  get resource(): GrasslandsNormalTextureResource | null {
    return this._resource;
  }

  async load(): Promise<GrasslandsNormalTextureResource | null> {
    if (this._disposed) {
      throw new Error("GrasslandsAssetLoader cannot load after disposal.");
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

  private async _loadOnce(): Promise<GrasslandsNormalTextureResource | null> {
    this._clearFailure();
    if (this._source === "local-override" && !this._enableDevelopmentLocalOverride) {
      return this._fail(
        "grasslands-local-override-not-enabled",
        "Grasslands local normal override requires the explicit development-only enableDevelopmentLocalOverride option."
      );
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
    if (actualContentHash !== GRASSLANDS_NORMAL_CONTENT_HASH) {
      return this._fail(
        "grasslands-normal-hash-mismatch",
        `Grasslands normal SHA-256 mismatch: expected ${GRASSLANDS_NORMAL_CONTENT_HASH}, received ${actualContentHash}.`
      );
    }

    let decoded: GrasslandsDecodedImage;
    try {
      decoded = await this._dependencies.decodeImage(bytes, this._sourceUrl);
    } catch (error) {
      return this._fail(
        "grasslands-normal-decode-failed",
        `Grasslands normal failed to decode: ${this._errorMessage(error)}`
      );
    }
    if (this._disposeRequested) {
      decoded.release();
      return null;
    }

    let texture: Texture2D | null = null;
    try {
      if (decoded.width !== GRASSLANDS_NORMAL_WIDTH || decoded.height !== GRASSLANDS_NORMAL_HEIGHT) {
        return this._fail(
          "grasslands-normal-dimensions-mismatch",
          `Grasslands normal dimensions mismatch: expected ${GRASSLANDS_NORMAL_WIDTH}x${GRASSLANDS_NORMAL_HEIGHT}, received ${decoded.width}x${decoded.height}.`
        );
      }
      texture = this._dependencies.createTexture(
        this._engine,
        decoded.width,
        decoded.height,
        TextureFormat.R8G8B8A8,
        true,
        false
      );
      this._mutableReadback.textureCreateCount++;
      texture.name = "GrasslandsWaterNormal1024";
      texture.filterMode = TextureFilterMode.Bilinear;
      texture.wrapModeU = TextureWrapMode.Repeat;
      texture.wrapModeV = TextureWrapMode.Repeat;
      texture.anisoLevel = 1;
      texture.isGCIgnored = true;
      texture.setImageSource(decoded.source);
      texture.generateMipmaps();
    } catch (error) {
      if (texture) {
        texture.destroy(true);
        this._mutableReadback.textureDestroyCount++;
      }
      if (error instanceof GrasslandsAssetLoadError) throw error;
      return this._fail(
        "grasslands-normal-texture-create-failed",
        `Grasslands normal Texture2D creation failed: ${this._errorMessage(error)}`
      );
    } finally {
      decoded.release();
    }

    const bindingMetadata = Object.freeze<GrasslandsAppearanceBindingTextureMetadata>({
      assetId: GRASSLANDS_NORMAL_ASSET_ID,
      contentHash: GRASSLANDS_NORMAL_CONTENT_HASH,
      texture,
      ownership: "borrowed"
    });
    this._resource = Object.freeze({
      source: this._source,
      sourceUrl: this._sourceUrl,
      assetId: GRASSLANDS_NORMAL_ASSET_ID,
      contentHash: GRASSLANDS_NORMAL_CONTENT_HASH,
      width: GRASSLANDS_NORMAL_WIDTH,
      height: GRASSLANDS_NORMAL_HEIGHT,
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

  private _fail(fallbackReason: GrasslandsAssetFallbackReason, fallbackMessage: string): null {
    this._mutableReadback.ready = false;
    this._mutableReadback.fallbackReason = fallbackReason;
    this._mutableReadback.fallbackMessage = fallbackMessage;
    if (this._strict) {
      throw new GrasslandsAssetLoadError(fallbackReason, fallbackMessage);
    }
    return null;
  }

  private _errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
