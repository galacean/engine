import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lifecycleSpies = vi.hoisted(() => ({
  materialConstructCount: 0,
  materialDestroy: vi.fn(),
  textureDestroy: vi.fn(),
  resourceDestroy: vi.fn(),
  meshDestroy: vi.fn(),
  templateDestroy: vi.fn(),
  revokeObjectUrl: vi.fn(),
  throwAtMaterialIndex: -1
}));

const MODEL_BOUNDS = {
  "stone-1": {
    minimum: [-1.28130853176117, -0.147414058446884, -1.06346702575684],
    maximum: [1.2482236623764, 1.1863214969635, 1.0417959690094]
  },
  "stone-2": {
    minimum: [-1.23965513706207, -0.131109550595284, -1.0032331943512],
    maximum: [1.23315167427063, 0.977715611457825, 1.1462664604187]
  },
  "small-stone-1": {
    minimum: [-0.219502449035645, -0.19648551940918, -0.239813566207886],
    maximum: [0.200043201446533, 0.423587411642075, 0.216506436467171]
  },
  "small-stone-2": {
    minimum: [-0.337080717086792, -0.0822588875889778, -0.264825254678726],
    maximum: [0.359418094158173, 0.287805616855621, 0.245734646916389]
  },
  "small-stone-3": {
    minimum: [-0.286103248596191, -0.168853282928467, -0.284043580293655],
    maximum: [0.26789665222168, 0.305978089570999, 0.278161972761154]
  }
} as const;

vi.mock("@galacean/engine", () => {
  class FakeTexture2D {
    name = "";
    filterMode: unknown;
    wrapModeU: unknown;
    wrapModeV: unknown;
    anisoLevel = 0;
    isGCIgnored = false;

    setImageSource(_source: unknown): void {}
    generateMipmaps(): void {}
    destroy(forceDestroy: boolean): void {
      lifecycleSpies.textureDestroy(forceDestroy);
    }
  }

  class FakePbrMaterial {
    name = "";
    baseColor: unknown;
    baseTexture: unknown;
    normalTexture: unknown;
    metallic = 0;
    roughness = 0;
    normalTextureIntensity = 0;
    tilingOffset: unknown;
    isGCIgnored = false;

    constructor() {
      const index = lifecycleSpies.materialConstructCount++;
      if (index === lifecycleSpies.throwAtMaterialIndex) {
        throw new Error(`injected PBR material failure ${index}`);
      }
    }

    destroy(forceDestroy: boolean): void {
      lifecycleSpies.materialDestroy(forceDestroy);
    }
  }

  return {
    AssetType: { GLTF: "GLTF" },
    Engine: class FakeEngine {},
    Entity: class FakeEntity {},
    GLTFResource: class FakeGltfResource {},
    MeshRenderer: class FakeMeshRenderer {},
    PBRMaterial: FakePbrMaterial,
    Texture2D: FakeTexture2D,
    TextureFilterMode: { Bilinear: "Bilinear" },
    TextureFormat: { R8G8B8A8: "R8G8B8A8" },
    TextureWrapMode: { Repeat: "Repeat" }
  };
});

vi.mock("@galacean/engine-math", () => ({
  Color: class FakeColor {
    constructor(
      readonly r: number,
      readonly g: number,
      readonly b: number,
      readonly a: number
    ) {}
  },
  Vector4: class FakeVector4 {
    constructor(
      readonly x: number,
      readonly y: number,
      readonly z: number,
      readonly w: number
    ) {}
  }
}));

interface AssetEntry {
  readonly id: string;
  readonly trackedPath: string;
  readonly trackedSha256: string;
  readonly byteLength: number;
}

interface BufferMetadata {
  readonly id: string;
  readonly sha256: string;
}

function hexToArrayBuffer(value: string): ArrayBuffer {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16)).buffer;
}

describe("GrasslandsEnvironmentAssets failed-construction lifecycle", () => {
  const originalImage = globalThis.Image;
  const originalBlob = globalThis.Blob;
  const originalFetch = globalThis.fetch;
  const originalCrypto = globalThis.crypto;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    lifecycleSpies.materialConstructCount = 0;
    lifecycleSpies.materialDestroy.mockClear();
    lifecycleSpies.textureDestroy.mockClear();
    lifecycleSpies.resourceDestroy.mockClear();
    lifecycleSpies.meshDestroy.mockClear();
    lifecycleSpies.templateDestroy.mockClear();
    lifecycleSpies.revokeObjectUrl.mockClear();
    lifecycleSpies.throwAtMaterialIndex = -1;
  });

  afterEach(() => {
    vi.stubGlobal("Image", originalImage);
    vi.stubGlobal("Blob", originalBlob);
    vi.stubGlobal("fetch", originalFetch);
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it("destroys all successful loads and earlier materials when a later material constructor throws", async () => {
    const manifestPath = fileURLToPath(new URL("../../demo/grasslands/assets/manifest.json", import.meta.url));
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      readonly environmentAssetSet: { readonly assets: readonly AssetEntry[] };
    };
    const assetsByFilename = new Map(
      manifest.environmentAssetSet.assets.map((asset) => [basename(asset.trackedPath), asset])
    );
    const bufferMetadata = new WeakMap<ArrayBuffer, BufferMetadata>();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const filename = basename(new URL(String(input)).pathname);
        const asset = assetsByFilename.get(filename);
        if (!asset) throw new Error(`unexpected environment URL ${String(input)}`);
        const bytes = new ArrayBuffer(asset.byteLength);
        bufferMetadata.set(bytes, { id: asset.id, sha256: asset.trackedSha256 });
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => bytes
        };
      })
    );
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        subtle: {
          digest: async (_algorithm: string, bytes: ArrayBuffer) => {
            const metadata = bufferMetadata.get(bytes);
            if (!metadata) throw new Error("missing digest metadata");
            return hexToArrayBuffer(metadata.sha256);
          }
        }
      }
    });

    class FakeBlob {
      readonly metadata: BufferMetadata;

      constructor(parts: readonly ArrayBuffer[]) {
        const metadata = bufferMetadata.get(parts[0]);
        if (!metadata) throw new Error("missing blob metadata");
        this.metadata = metadata;
      }
    }
    class FakeImage {
      decoding = "";
      naturalWidth = 1024;
      naturalHeight = 1024;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Blob", FakeBlob);
    vi.stubGlobal("Image", FakeImage);
    let objectUrlIndex = 0;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      const metadata = (blob as unknown as FakeBlob).metadata;
      return `blob:${metadata.id}:${objectUrlIndex++}`;
    });
    URL.revokeObjectURL = lifecycleSpies.revokeObjectUrl;

    const createTemplateRoot = () => ({
      children: [{ children: [] }],
      destroy: lifecycleSpies.templateDestroy
    });
    const engine = {
      resourceManager: {
        load: vi.fn(async ({ url }: { readonly url: string }) => {
          const id = url.split(":")[1] as keyof typeof MODEL_BOUNDS;
          const bounds = MODEL_BOUNDS[id];
          if (!bounds) throw new Error(`unexpected model id ${id}`);
          return {
            meshes: [
              [
                {
                  bounds: {
                    min: { x: bounds.minimum[0], y: bounds.minimum[1], z: bounds.minimum[2] },
                    max: { x: bounds.maximum[0], y: bounds.maximum[1], z: bounds.maximum[2] }
                  },
                  destroy: lifecycleSpies.meshDestroy
                }
              ]
            ],
            materials: [],
            textures: [],
            sceneRoots: [createTemplateRoot()],
            destroy: lifecycleSpies.resourceDestroy
          };
        })
      }
    };
    lifecycleSpies.throwAtMaterialIndex = 3;
    const { GrasslandsEnvironmentAssets } = await import("../../demo/grasslands/GrasslandsEnvironmentAssets");

    await expect(GrasslandsEnvironmentAssets.load(engine as never)).rejects.toThrow("injected PBR material failure 3");
    expect(lifecycleSpies.materialConstructCount).toBe(4);
    expect(lifecycleSpies.materialDestroy).toHaveBeenCalledTimes(3);
    expect(lifecycleSpies.textureDestroy).toHaveBeenCalledTimes(10);
    expect(lifecycleSpies.resourceDestroy).toHaveBeenCalledTimes(5);
    expect(lifecycleSpies.meshDestroy).toHaveBeenCalledTimes(5);
    expect(lifecycleSpies.templateDestroy).toHaveBeenCalledTimes(5);
    expect(lifecycleSpies.revokeObjectUrl).toHaveBeenCalledTimes(15);
  });
});
