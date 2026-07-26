import { TextureFilterMode, TextureFormat, TextureWrapMode, type Engine, type Texture2D } from "@galacean/engine-core";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  GRASSLANDS_LOCAL_NORMAL_URL,
  GRASSLANDS_NORMAL_ASSET_ID as LOADER_NORMAL_ASSET_ID,
  GRASSLANDS_NORMAL_CONTENT_HASH as LOADER_NORMAL_CONTENT_HASH,
  GRASSLANDS_NORMAL_HEIGHT,
  GRASSLANDS_NORMAL_WIDTH,
  GRASSLANDS_TRACKED_NORMAL_URL,
  GrasslandsAssetLoadError,
  GrasslandsAssetLoader,
  type GrasslandsAssetLoaderDependencies,
  type GrasslandsDecodedImage
} from "../../demo/grasslands/GrasslandsAssetLoader";
import {
  GRASSLANDS_NORMAL_ASSET_ID,
  GRASSLANDS_NORMAL_CONTENT_HASH,
  GRASSLANDS_SURFACE_APPEARANCE_ASSET
} from "../../demo/grasslands/GrasslandsPcgPreset";

interface FakeTexture {
  name: string;
  readonly width: number;
  readonly height: number;
  filterMode: TextureFilterMode;
  wrapModeU: TextureWrapMode;
  wrapModeV: TextureWrapMode;
  anisoLevel: number;
  isGCIgnored: boolean;
  readonly setImageSource: ReturnType<typeof vi.fn>;
  readonly generateMipmaps: ReturnType<typeof vi.fn>;
  readonly destroy: ReturnType<typeof vi.fn>;
}

interface PreflightResult {
  readonly status: "copied" | "already-current";
  readonly assetId: string;
  readonly manifestPath: string;
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly sha256: string;
  readonly byteLength: number;
}

interface PreflightModule {
  prepareGrasslandsLocalAssets(options?: {
    readonly caseRoot?: string;
    readonly destinationPath?: string;
    readonly localAssetsDirectory?: string;
    readonly manifestPath?: string;
  }): Promise<PreflightResult>;
}

function asPreflightModule(value: unknown): PreflightModule {
  if (
    typeof value !== "object" ||
    value === null ||
    !("prepareGrasslandsLocalAssets" in value && typeof value.prepareGrasslandsLocalAssets === "function")
  ) {
    throw new Error("Grasslands preflight module contract is unavailable.");
  }
  return value as PreflightModule;
}

function createFakeTexture(width: number, height: number): FakeTexture {
  return {
    name: "",
    width,
    height,
    filterMode: TextureFilterMode.Point,
    wrapModeU: TextureWrapMode.Clamp,
    wrapModeV: TextureWrapMode.Clamp,
    anisoLevel: 4,
    isGCIgnored: false,
    setImageSource: vi.fn(),
    generateMipmaps: vi.fn(),
    destroy: vi.fn()
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function createDependencies(overrides: Partial<GrasslandsAssetLoaderDependencies> = {}): {
  readonly dependencies: GrasslandsAssetLoaderDependencies;
  readonly texture: FakeTexture;
  readonly decodedRelease: ReturnType<typeof vi.fn>;
  readonly fetchBytes: ReturnType<typeof vi.fn>;
  readonly decodeImage: ReturnType<typeof vi.fn>;
  readonly createTexture: ReturnType<typeof vi.fn>;
} {
  const bytes = new Uint8Array([7, 2, 0, 2, 6]).buffer;
  const texture = createFakeTexture(GRASSLANDS_NORMAL_WIDTH, GRASSLANDS_NORMAL_HEIGHT);
  const decodedRelease = vi.fn();
  const fetchBytes = vi.fn(async () => bytes);
  const decodeImage = vi.fn(
    async (): Promise<GrasslandsDecodedImage> => ({
      source: {} as TexImageSource,
      width: GRASSLANDS_NORMAL_WIDTH,
      height: GRASSLANDS_NORMAL_HEIGHT,
      release: decodedRelease
    })
  );
  const createTexture = vi.fn(
    (
      _engine: Engine,
      _width: number,
      _height: number,
      _format: TextureFormat,
      _mipmap: boolean,
      _isSRGBColorSpace: boolean
    ): Texture2D => texture as unknown as Texture2D
  );
  return {
    dependencies: {
      fetchBytes,
      digestSha256: async () => GRASSLANDS_NORMAL_CONTENT_HASH,
      decodeImage,
      createTexture,
      ...overrides
    },
    texture,
    decodedRelease,
    fetchBytes,
    decodeImage,
    createTexture
  };
}

describe("GrasslandsAssetLoader", () => {
  it("matches the tracked manifest identity, URL, hash, dimensions, sampling, and ownership contract", async () => {
    const manifestPath = fileURLToPath(new URL("../../demo/grasslands/assets/manifest.json", import.meta.url));
    const manifest = asRecord(JSON.parse(await readFile(manifestPath, "utf8")), "Grasslands test manifest");
    const assets = manifest.assets;
    if (!Array.isArray(assets) || assets.length !== 1) {
      throw new Error("Grasslands test manifest must contain one asset.");
    }
    const normalAsset = asRecord(assets[0], "Grasslands test normal asset");
    const trackedPath = fileURLToPath(
      new URL("../../demo/grasslands/assets/grasslands-water-normal-1024.png", import.meta.url)
    );
    const trackedBytes = await readFile(trackedPath);

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      caseId: "showcase-grasslands-stylized-water",
      assets: [
        {
          id: GRASSLANDS_NORMAL_ASSET_ID,
          trackedUrl: GRASSLANDS_TRACKED_NORMAL_URL,
          trackedSha256: GRASSLANDS_NORMAL_CONTENT_HASH,
          width: GRASSLANDS_NORMAL_WIDTH,
          height: GRASSLANDS_NORMAL_HEIGHT,
          sampling: {
            colorSpace: "linear",
            wrapU: "repeat",
            wrapV: "repeat",
            filter: "bilinear",
            mipmaps: true,
            anisotropy: 1
          },
          ownership: {
            creator: "GrasslandsAssetLoader",
            runtime: "borrowed",
            destroyer: "GrasslandsAssetLoader"
          }
        }
      ]
    });
    expect(LOADER_NORMAL_ASSET_ID).toBe(GRASSLANDS_NORMAL_ASSET_ID);
    expect(LOADER_NORMAL_CONTENT_HASH).toBe(GRASSLANDS_NORMAL_CONTENT_HASH);
    expect(GRASSLANDS_SURFACE_APPEARANCE_ASSET.normal).toMatchObject({
      textureAssetId: normalAsset.id,
      textureContentHash: normalAsset.trackedSha256
    });
    expect(normalAsset.sourceSha256).toBe(GRASSLANDS_NORMAL_CONTENT_HASH);
    expect(normalAsset.byteLength).toBe(trackedBytes.byteLength);
    expect(createHash("sha256").update(trackedBytes).digest("hex")).toBe(GRASSLANDS_NORMAL_CONTENT_HASH);
  });

  it("uses the tracked same-origin URL by default and creates the exact caller-owned linear texture", async () => {
    const fixture = createDependencies();
    const loader = new GrasslandsAssetLoader({} as Engine, {
      dependencies: fixture.dependencies
    });

    const resource = await loader.load();
    expect(resource).not.toBeNull();
    expect(await loader.load()).toBe(resource);
    expect(fixture.fetchBytes).toHaveBeenCalledTimes(1);
    expect(fixture.fetchBytes).toHaveBeenCalledWith(GRASSLANDS_TRACKED_NORMAL_URL);
    expect(fixture.createTexture).toHaveBeenCalledWith(
      expect.anything(),
      1024,
      1024,
      TextureFormat.R8G8B8A8,
      true,
      false
    );
    expect(fixture.texture).toMatchObject({
      name: "GrasslandsWaterNormal1024",
      filterMode: TextureFilterMode.Bilinear,
      wrapModeU: TextureWrapMode.Repeat,
      wrapModeV: TextureWrapMode.Repeat,
      anisoLevel: 1,
      isGCIgnored: true
    });
    expect(fixture.texture.setImageSource).toHaveBeenCalledTimes(1);
    expect(fixture.texture.generateMipmaps).toHaveBeenCalledTimes(1);
    expect(fixture.decodedRelease).toHaveBeenCalledTimes(1);
    expect(resource?.bindingMetadata).toEqual({
      assetId: GRASSLANDS_NORMAL_ASSET_ID,
      contentHash: GRASSLANDS_NORMAL_CONTENT_HASH,
      texture: fixture.texture,
      ownership: "borrowed"
    });
    expect(loader.readback).toMatchObject({
      strict: true,
      requestedSource: "tracked",
      sourceUrl: GRASSLANDS_TRACKED_NORMAL_URL,
      ready: true,
      actualContentHash: GRASSLANDS_NORMAL_CONTENT_HASH,
      width: 1024,
      height: 1024,
      colorSpace: "linear",
      wrapU: "repeat",
      wrapV: "repeat",
      filter: "bilinear",
      mipmaps: true,
      anisotropy: 1,
      textureCreateCount: 1,
      textureDestroyCount: 0
    });
  });

  it("requires an explicit development gate before using local-assets", async () => {
    const rejectedFixture = createDependencies();
    const rejected = new GrasslandsAssetLoader({} as Engine, {
      source: "local-override",
      dependencies: rejectedFixture.dependencies
    });

    await expect(rejected.load()).rejects.toMatchObject({
      name: "GrasslandsAssetLoadError",
      fallbackReason: "grasslands-local-override-not-enabled"
    });
    expect(rejectedFixture.fetchBytes).not.toHaveBeenCalled();
    expect(rejected.resource).toBeNull();
    expect(rejected.readback.fallbackMessage).toMatch(/explicit development-only/);

    const allowedFixture = createDependencies();
    const allowed = new GrasslandsAssetLoader({} as Engine, {
      source: "local-override",
      enableDevelopmentLocalOverride: true,
      dependencies: allowedFixture.dependencies
    });
    await expect(allowed.load()).resolves.toMatchObject({
      source: "local-override",
      sourceUrl: GRASSLANDS_LOCAL_NORMAL_URL
    });
    expect(allowedFixture.fetchBytes).toHaveBeenCalledWith(GRASSLANDS_LOCAL_NORMAL_URL);
  });

  it("fails closed with readable strict diagnostics when the asset is missing", async () => {
    const fixture = createDependencies({
      fetchBytes: async () => {
        throw new Error("404 Not Found");
      }
    });
    const loader = new GrasslandsAssetLoader({} as Engine, {
      dependencies: fixture.dependencies
    });

    await expect(loader.load()).rejects.toEqual(
      expect.objectContaining<Partial<GrasslandsAssetLoadError>>({
        fallbackReason: "grasslands-normal-fetch-failed",
        message: expect.stringContaining("404 Not Found")
      })
    );
    expect(loader.resource).toBeNull();
    expect(fixture.createTexture).not.toHaveBeenCalled();
    expect(loader.readback).toMatchObject({
      ready: false,
      fallbackReason: "grasslands-normal-fetch-failed"
    });
  });

  it("never decodes or substitutes a placeholder after a SHA mismatch", async () => {
    const fixture = createDependencies({
      digestSha256: async () => "f".repeat(64)
    });
    const loader = new GrasslandsAssetLoader({} as Engine, {
      dependencies: fixture.dependencies
    });

    await expect(loader.load()).rejects.toMatchObject({
      fallbackReason: "grasslands-normal-hash-mismatch"
    });
    expect(fixture.decodeImage).not.toHaveBeenCalled();
    expect(fixture.createTexture).not.toHaveBeenCalled();
    expect(loader.resource).toBeNull();
    expect(loader.readback).toMatchObject({
      actualContentHash: "f".repeat(64),
      fallbackReason: "grasslands-normal-hash-mismatch"
    });
  });

  it("reports non-strict fallback without creating a placeholder", async () => {
    const fixture = createDependencies({
      fetchBytes: async () => {
        throw new Error("missing");
      }
    });
    const loader = new GrasslandsAssetLoader({} as Engine, {
      strict: false,
      dependencies: fixture.dependencies
    });

    await expect(loader.load()).resolves.toBeNull();
    expect(loader.resource).toBeNull();
    expect(fixture.createTexture).not.toHaveBeenCalled();
    expect(loader.readback.fallbackReason).toBe("grasslands-normal-fetch-failed");
  });

  it("releases decoded input and rejects the wrong dimensions before GPU allocation", async () => {
    const decodedRelease = vi.fn();
    const fixture = createDependencies({
      decodeImage: async () => ({
        source: {} as TexImageSource,
        width: 512,
        height: 1024,
        release: decodedRelease
      })
    });
    const loader = new GrasslandsAssetLoader({} as Engine, {
      dependencies: fixture.dependencies
    });

    await expect(loader.load()).rejects.toMatchObject({
      fallbackReason: "grasslands-normal-dimensions-mismatch"
    });
    expect(decodedRelease).toHaveBeenCalledTimes(1);
    expect(fixture.createTexture).not.toHaveBeenCalled();
  });

  it("refuses disposal while borrowed and destroys exactly once after Runtime detach", async () => {
    const fixture = createDependencies();
    const loader = new GrasslandsAssetLoader({} as Engine, {
      dependencies: fixture.dependencies
    });
    await loader.load();
    const releaseBorrow = loader.acquireRuntimeBorrow();

    expect(() => loader.disposeAfterRuntimeDetach()).toThrow(/still borrowed by Runtime/);
    expect(fixture.texture.destroy).not.toHaveBeenCalled();
    releaseBorrow();
    releaseBorrow();
    loader.disposeAfterRuntimeDetach();
    loader.disposeAfterRuntimeDetach();

    expect(fixture.texture.destroy).toHaveBeenCalledTimes(1);
    expect(fixture.texture.destroy).toHaveBeenCalledWith(true);
    expect(loader.resource).toBeNull();
    expect(loader.readback).toMatchObject({
      ready: false,
      activeRuntimeBorrowCount: 0,
      textureCreateCount: 1,
      textureDestroyCount: 1,
      disposeRequested: true,
      disposed: true
    });
  });

  it("aborts before GPU texture creation when teardown is requested during fetch", async () => {
    let resolveFetch: ((bytes: ArrayBuffer) => void) | undefined;
    const bytes = new Uint8Array([7, 2, 0, 2, 6]).buffer;
    const fixture = createDependencies({
      fetchBytes: () =>
        new Promise<ArrayBuffer>((resolve) => {
          resolveFetch = resolve;
        })
    });
    const loader = new GrasslandsAssetLoader({} as Engine, {
      dependencies: fixture.dependencies
    });

    const pending = loader.load();
    loader.requestDisposeAfterRuntimeDetach();
    expect(loader.readback).toMatchObject({
      disposeRequested: true,
      disposed: false,
      textureCreateCount: 0,
      textureDestroyCount: 0
    });
    resolveFetch?.(bytes);
    await expect(pending).resolves.toBeNull();

    expect(fixture.createTexture).not.toHaveBeenCalled();
    expect(fixture.texture.destroy).not.toHaveBeenCalled();
    expect(loader.resource).toBeNull();
    expect(loader.readback).toMatchObject({
      ready: false,
      disposeRequested: true,
      disposed: true,
      textureCreateCount: 0,
      textureDestroyCount: 0
    });
    loader.requestDisposeAfterRuntimeDetach();
    expect(fixture.texture.destroy).not.toHaveBeenCalled();
  });

  it("releases a decoded image without creating a GPU texture when teardown wins the decode race", async () => {
    let resolveDecode: ((decoded: GrasslandsDecodedImage) => void) | undefined;
    const decodedRelease = vi.fn();
    const fixture = createDependencies({
      decodeImage: () =>
        new Promise<GrasslandsDecodedImage>((resolve) => {
          resolveDecode = resolve;
        })
    });
    const loader = new GrasslandsAssetLoader({} as Engine, {
      dependencies: fixture.dependencies
    });

    const pending = loader.load();
    await vi.waitFor(() => expect(resolveDecode).toBeTypeOf("function"));
    loader.requestDisposeAfterRuntimeDetach();
    resolveDecode?.({
      source: {} as TexImageSource,
      width: GRASSLANDS_NORMAL_WIDTH,
      height: GRASSLANDS_NORMAL_HEIGHT,
      release: decodedRelease
    });
    await expect(pending).resolves.toBeNull();

    expect(decodedRelease).toHaveBeenCalledTimes(1);
    expect(fixture.createTexture).not.toHaveBeenCalled();
    expect(loader.readback).toMatchObject({
      ready: false,
      disposeRequested: true,
      disposed: true,
      textureCreateCount: 0,
      textureDestroyCount: 0
    });
  });
});

describe("prepare-grasslands-local-assets", () => {
  it("verifies the frozen SHA before and after an idempotent local copy", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "grasslands-preflight-"));
    const previousCaseRoot = process.env.GRASSLANDS_CASE_ROOT;
    try {
      const sourcePath = join(temporaryRoot, "galacean-inputs", "textures", "grasslands-water-normal-1024.png");
      const destinationPath = join(temporaryRoot, "output", "grasslands-water-normal-1024.png");
      await mkdir(dirname(sourcePath), { recursive: true });
      const trackedPath = fileURLToPath(
        new URL("../../demo/grasslands/assets/grasslands-water-normal-1024.png", import.meta.url)
      );
      await copyFile(trackedPath, sourcePath);
      const sourceBytes = await readFile(sourcePath);
      const moduleUrl = new URL("../../scripts/prepare-grasslands-local-assets.mjs", import.meta.url).href;
      const preflight = asPreflightModule(await import(moduleUrl));
      process.env.GRASSLANDS_CASE_ROOT = temporaryRoot;

      const copied = await preflight.prepareGrasslandsLocalAssets({
        localAssetsDirectory: dirname(destinationPath)
      });
      expect(copied).toMatchObject({
        status: "copied",
        assetId: GRASSLANDS_NORMAL_ASSET_ID,
        manifestPath: fileURLToPath(new URL("../../demo/grasslands/assets/manifest.json", import.meta.url)),
        sourcePath,
        destinationPath,
        sha256: GRASSLANDS_NORMAL_CONTENT_HASH,
        byteLength: sourceBytes.byteLength
      });
      const destinationBytes = await readFile(destinationPath);
      expect(createHash("sha256").update(destinationBytes).digest("hex")).toBe(GRASSLANDS_NORMAL_CONTENT_HASH);

      await expect(
        preflight.prepareGrasslandsLocalAssets({
          localAssetsDirectory: dirname(destinationPath)
        })
      ).resolves.toMatchObject({
        status: "already-current",
        sha256: GRASSLANDS_NORMAL_CONTENT_HASH
      });
    } finally {
      if (previousCaseRoot === undefined) {
        delete process.env.GRASSLANDS_CASE_ROOT;
      } else {
        process.env.GRASSLANDS_CASE_ROOT = previousCaseRoot;
      }
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("fails closed on the wrong manifest schema, case, asset count, or identity fields", async () => {
    const moduleUrl = new URL("../../scripts/prepare-grasslands-local-assets.mjs", import.meta.url).href;
    const preflight = asPreflightModule(await import(moduleUrl));
    const productionManifestPath = fileURLToPath(
      new URL("../../demo/grasslands/assets/manifest.json", import.meta.url)
    );
    const productionManifest = asRecord(
      JSON.parse(await readFile(productionManifestPath, "utf8")),
      "Grasslands production manifest"
    );
    const productionAssets = productionManifest.assets;
    if (!Array.isArray(productionAssets) || productionAssets.length !== 1) {
      throw new Error("Grasslands production manifest must contain one asset.");
    }
    const productionAsset = asRecord(productionAssets[0], "Grasslands production normal asset");
    const invalidCases = [
      {
        name: "schema",
        manifest: { ...productionManifest, schemaVersion: 2 },
        message: /schemaVersion must be 1/
      },
      {
        name: "case",
        manifest: { ...productionManifest, caseId: "another-case" },
        message: /caseId must be showcase-grasslands-stylized-water/
      },
      {
        name: "asset-count",
        manifest: { ...productionManifest, assets: [productionAsset, productionAsset] },
        message: /exactly one normal asset/
      },
      {
        name: "asset-id",
        manifest: { ...productionManifest, assets: [{ ...productionAsset, id: "" }] },
        message: /normal asset id must be a non-empty string/
      },
      {
        name: "asset-id-coordinated-drift",
        manifest: { ...productionManifest, assets: [{ ...productionAsset, id: "another-valid-asset-id" }] },
        message: /normal asset id must be grasslands-water-normal-1024/
      },
      {
        name: "asset-hash-single-drift",
        manifest: {
          ...productionManifest,
          assets: [{ ...productionAsset, trackedSha256: "f".repeat(64) }]
        },
        message: /trackedSha256 must be 0d9bf/
      },
      {
        name: "asset-hash-coordinated-drift",
        manifest: {
          ...productionManifest,
          assets: [{ ...productionAsset, sourceSha256: "f".repeat(64), trackedSha256: "f".repeat(64) }]
        },
        message: /sourceSha256 must be 0d9bf/
      },
      {
        name: "asset-byte-length-coordinated-drift",
        manifest: {
          ...productionManifest,
          assets: [{ ...productionAsset, byteLength: 1 }]
        },
        message: /byteLength must be 533511/
      },
      {
        name: "asset-dimensions-coordinated-drift",
        manifest: {
          ...productionManifest,
          assets: [{ ...productionAsset, width: 512, height: 2048 }]
        },
        message: /dimensions must be 1024x1024/
      }
    ] as const;
    const temporaryRoot = await mkdtemp(join(tmpdir(), "grasslands-preflight-manifest-"));
    try {
      for (const invalidCase of invalidCases) {
        const manifestPath = join(temporaryRoot, `${invalidCase.name}.json`);
        await writeFile(manifestPath, JSON.stringify(invalidCase.manifest));
        await expect(
          preflight.prepareGrasslandsLocalAssets({
            caseRoot: temporaryRoot,
            destinationPath: join(temporaryRoot, "output", "normal.png"),
            manifestPath
          })
        ).rejects.toThrow(invalidCase.message);
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects absolute, traversal, and nested destination escapes before copying", async () => {
    const moduleUrl = new URL("../../scripts/prepare-grasslands-local-assets.mjs", import.meta.url).href;
    const preflight = asPreflightModule(await import(moduleUrl));
    const temporaryRoot = await mkdtemp(join(tmpdir(), "grasslands-preflight-destination-"));
    const localAssetsDirectory = join(temporaryRoot, "local-assets");
    const invalidDestinations = [
      join(temporaryRoot, "outside", "grasslands-water-normal-1024.png"),
      join(localAssetsDirectory, "..", "grasslands-water-normal-1024.png"),
      join(localAssetsDirectory, "nested", "grasslands-water-normal-1024.png")
    ];
    try {
      for (const destinationPath of invalidDestinations) {
        await expect(
          preflight.prepareGrasslandsLocalAssets({
            caseRoot: temporaryRoot,
            localAssetsDirectory,
            destinationPath
          })
        ).rejects.toThrow(/destination must be the manifest asset inside localAssetsDirectory/);
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects missing roots and mismatched source bytes before copying", async () => {
    const moduleUrl = new URL("../../scripts/prepare-grasslands-local-assets.mjs", import.meta.url).href;
    const preflight = asPreflightModule(await import(moduleUrl));
    await expect(preflight.prepareGrasslandsLocalAssets({ caseRoot: "" })).rejects.toThrow(/GRASSLANDS_CASE_ROOT/);

    const temporaryRoot = await mkdtemp(join(tmpdir(), "grasslands-preflight-invalid-"));
    try {
      const sourcePath = join(temporaryRoot, "galacean-inputs", "textures", "grasslands-water-normal-1024.png");
      const destinationPath = join(temporaryRoot, "output", "grasslands-water-normal-1024.png");
      await mkdir(dirname(sourcePath), { recursive: true });
      const trackedPath = fileURLToPath(
        new URL("../../demo/grasslands/assets/grasslands-water-normal-1024.png", import.meta.url)
      );
      const corruptedBytes = Buffer.from(await readFile(trackedPath));
      corruptedBytes[0] ^= 0xff;
      await writeFile(sourcePath, corruptedBytes);

      await expect(
        preflight.prepareGrasslandsLocalAssets({
          caseRoot: temporaryRoot,
          localAssetsDirectory: dirname(destinationPath),
          destinationPath
        })
      ).rejects.toThrow(/source normal SHA-256 mismatch/);
      await expect(readFile(destinationPath)).rejects.toThrow();
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
