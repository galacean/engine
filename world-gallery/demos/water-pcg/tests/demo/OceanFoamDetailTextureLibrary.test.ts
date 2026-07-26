import { TextureFilterMode, TextureFormat, TextureWrapMode, type Engine, type Texture2D } from "@galacean/engine-core";
import { describe, expect, it } from "vitest";
import {
  calculateOceanFoamDetailMipLevelCount,
  calculateOceanFoamDetailResourceBytes,
  calibrateOceanFoamOpacity,
  OceanFoamDetailTextureLibrary,
  packOceanFoamDetailChannels,
  validateOceanFoamDetailGrayscaleSource,
  type OceanFoamDetailChannelSources,
  type OceanFoamDetailGrayscaleSource,
  type OceanFoamDetailTextureFactory
} from "../../demo/ocean/OceanFoamDetailTextureLibrary";

interface FakeTextureRecord {
  readonly texture: Texture2D;
  readonly uploads: Uint8Array[];
  readonly format: TextureFormat;
  readonly mipmap: boolean;
  readonly isSRGBColorSpace: boolean;
  mipmapGenerationCount: number;
  destroyCount: number;
}

function createSource(pixels: readonly number[], width = 2, height = 2): OceanFoamDetailGrayscaleSource {
  return {
    width,
    height,
    pixels: new Uint8Array(pixels)
  };
}

function createSources(): OceanFoamDetailChannelSources {
  return {
    thick: createSource([10, 20, 30, 40]),
    medium: createSource([50, 60, 70, 80]),
    fine: createSource([90, 100, 110, 120])
  };
}

function createTextureFactory(records: FakeTextureRecord[], failUpload = false): OceanFoamDetailTextureFactory {
  return {
    create(
      _engine: Engine,
      width: number,
      height: number,
      format: TextureFormat,
      mipmap: boolean,
      isSRGBColorSpace: boolean,
      name: string
    ): Texture2D {
      const record = {
        uploads: [],
        format,
        mipmap,
        isSRGBColorSpace,
        mipmapGenerationCount: 0,
        destroyCount: 0
      } as Omit<FakeTextureRecord, "texture"> & {
        texture?: Texture2D;
      };
      const texture = {
        width,
        height,
        name,
        filterMode: TextureFilterMode.Bilinear,
        wrapModeU: TextureWrapMode.Clamp,
        wrapModeV: TextureWrapMode.Clamp,
        isGCIgnored: false,
        setPixelBuffer(buffer: Uint8Array): void {
          if (failUpload) {
            throw new Error("synthetic foam detail upload failure");
          }
          record.uploads.push(new Uint8Array(buffer));
        },
        generateMipmaps(): void {
          record.mipmapGenerationCount++;
        },
        destroy(): void {
          record.destroyCount++;
        }
      } as unknown as Texture2D;
      record.texture = texture;
      records.push(record as FakeTextureRecord);
      return texture;
    }
  };
}

describe("OceanFoamDetailTextureLibrary", () => {
  it("calibrates authored opacity into the shared shader coverage window", () => {
    expect(calibrateOceanFoamOpacity(0)).toBe(0);
    expect(calibrateOceanFoamOpacity(16)).toBe(20);
    expect(calibrateOceanFoamOpacity(61)).toBe(78);
    expect(calibrateOceanFoamOpacity(200)).toBe(255);
    expect(calibrateOceanFoamOpacity(255)).toBe(255);
  });

  it("validates grayscale sources and packs thick, medium, and fine masks into RGB", () => {
    const sources = createSources();
    expect(() => validateOceanFoamDetailGrayscaleSource(sources.thick, "thick")).not.toThrow();

    const packed = packOceanFoamDetailChannels(sources);
    expect(packed.width).toBe(2);
    expect(packed.height).toBe(2);
    expect(Array.from(packed.pixels)).toEqual([10, 50, 90, 255, 20, 60, 100, 255, 30, 70, 110, 255, 40, 80, 120, 255]);
    expect(Array.from(sources.thick.pixels)).toEqual([10, 20, 30, 40]);
  });

  it("rejects malformed or dimensionally incompatible grayscale sources", () => {
    expect(() => validateOceanFoamDetailGrayscaleSource(createSource([1, 2, 3], 2, 2))).toThrow(
      /grayscale source is invalid/
    );
    expect(() =>
      packOceanFoamDetailChannels({
        ...createSources(),
        fine: createSource([1, 2], 1, 2)
      })
    ).toThrow(/must share dimensions/);
  });

  it("creates one linear repeat texture with exact mip metrics and destroys only that texture", () => {
    const records: FakeTextureRecord[] = [];
    const library = OceanFoamDetailTextureLibrary.createFromSources({} as Engine, createSources(), {
      textureFactory: createTextureFactory(records)
    });
    const record = records[0];
    const texture = record.texture as Texture2D & {
      readonly name: string;
      readonly filterMode: TextureFilterMode;
      readonly wrapModeU: TextureWrapMode;
      readonly wrapModeV: TextureWrapMode;
      readonly isGCIgnored: boolean;
    };

    expect(records).toHaveLength(1);
    expect(texture.name).toBe("OceanFoamDetailPacked");
    expect(record.format).toBe(TextureFormat.R8G8B8A8);
    expect(record.mipmap).toBe(true);
    expect(record.isSRGBColorSpace).toBe(false);
    expect(texture.filterMode).toBe(TextureFilterMode.Trilinear);
    expect(texture.wrapModeU).toBe(TextureWrapMode.Repeat);
    expect(texture.wrapModeV).toBe(TextureWrapMode.Repeat);
    expect(texture.isGCIgnored).toBe(true);
    expect(record.uploads).toHaveLength(1);
    expect(record.mipmapGenerationCount).toBe(1);
    expect(library.binding).toEqual({
      texture: record.texture,
      ownership: "borrowed",
      resourceBytes: 20
    });
    expect(library.metrics).toMatchObject({
      ownership: "borrowed",
      sourceImageCount: 3,
      textureCount: 1,
      textureCreateCount: 1,
      textureDestroyCount: 0,
      textureUploadCount: 1,
      mipmapGenerationCount: 1,
      width: 2,
      height: 2,
      mipLevelCount: 2,
      resourceBytes: 20,
      channelPacking: "r-thick-g-medium-b-fine",
      destroyed: false
    });
    expect(calculateOceanFoamDetailMipLevelCount(512, 512)).toBe(10);
    expect(calculateOceanFoamDetailResourceBytes(512, 512)).toBe(1_398_100);

    library.destroy();
    library.destroy();
    expect(record.destroyCount).toBe(1);
    expect(library.metrics).toMatchObject({
      textureCount: 0,
      textureCreateCount: 1,
      textureDestroyCount: 1,
      resourceBytes: 0,
      destroyed: true
    });
    expect(() => library.binding).toThrow(/is destroyed/);
  });

  it("releases its texture when upload fails", () => {
    const records: FakeTextureRecord[] = [];
    expect(() =>
      OceanFoamDetailTextureLibrary.createFromSources({} as Engine, createSources(), {
        textureFactory: createTextureFactory(records, true)
      })
    ).toThrow(/synthetic foam detail upload failure/);
    expect(records).toHaveLength(1);
    expect(records[0].destroyCount).toBe(1);
  });
});
