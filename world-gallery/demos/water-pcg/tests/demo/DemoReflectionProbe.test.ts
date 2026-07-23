import type { Camera, Engine, Entity, TextureCube } from "@galacean/engine-core";
import { Layer, TextureCubeFace, TextureFilterMode, TextureFormat, TextureWrapMode } from "@galacean/engine-core";
import { describe, expect, it } from "vitest";
import {
  createDemoReflectionProbeFaces,
  DEMO_REFLECTION_PROBE_BYTE_LENGTH,
  DEMO_REFLECTION_PROBE_FACE_COUNT,
  DEMO_REFLECTION_PROBE_PROVENANCE,
  DEMO_REFLECTION_PROBE_SIZE,
  DemoReflectionProbe,
  hashDemoReflectionProbePixels,
  type DemoReflectionProbeTextureDescriptor,
  type DemoReflectionProbeTextureFactory
} from "../../demo/examples/water-optics-lab/DemoReflectionProbe";
import { WaterReflectionService } from "../../runtime/optics/WaterReflectionService";

interface FakeUpload {
  readonly face: TextureCubeFace;
  readonly pixels: Uint8Array;
  readonly mipLevel: number | undefined;
  readonly x: number | undefined;
  readonly y: number | undefined;
  readonly width: number | undefined;
  readonly height: number | undefined;
}

interface FakeTexture {
  name: string;
  filterMode: TextureFilterMode;
  wrapModeU: TextureWrapMode;
  wrapModeV: TextureWrapMode;
  isGCIgnored: boolean;
  readonly uploads: FakeUpload[];
  readonly destroyForces: Array<boolean | undefined>;
  setPixelBuffer(
    face: TextureCubeFace,
    pixels: ArrayBufferView,
    mipLevel?: number,
    x?: number,
    y?: number,
    width?: number,
    height?: number
  ): void;
  destroy(force?: boolean): boolean;
}

interface FakeTextureHarness {
  readonly descriptors: DemoReflectionProbeTextureDescriptor[];
  readonly textures: FakeTexture[];
  readonly factory: DemoReflectionProbeTextureFactory;
}

function createFakeTextureHarness(failAtUpload = -1): FakeTextureHarness {
  const descriptors: DemoReflectionProbeTextureDescriptor[] = [];
  const textures: FakeTexture[] = [];
  return {
    descriptors,
    textures,
    factory: {
      create(_engine, descriptor): TextureCube {
        descriptors.push({ ...descriptor });
        const texture: FakeTexture = {
          name: "",
          filterMode: TextureFilterMode.Point,
          wrapModeU: TextureWrapMode.Repeat,
          wrapModeV: TextureWrapMode.Repeat,
          isGCIgnored: false,
          uploads: [],
          destroyForces: [],
          setPixelBuffer(face, pixels, mipLevel, x, y, width, height): void {
            if (this.uploads.length === failAtUpload) throw new Error("injected upload failure");
            const bytes = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
            this.uploads.push({ face, pixels: bytes.slice(), mipLevel, x, y, width, height });
          },
          destroy(force): boolean {
            this.destroyForces.push(force);
            return true;
          }
        };
        textures.push(texture);
        return texture as unknown as TextureCube;
      }
    }
  };
}

function readPixel(pixels: Uint8Array, x: number, y: number): readonly number[] {
  const offset = (y * DEMO_REFLECTION_PROBE_SIZE + x) * 4;
  return Array.from(pixels.slice(offset, offset + 4));
}

describe("DemoReflectionProbe", () => {
  it("generates six deterministic, distinguishable, asymmetric linear RGBA8 faces", () => {
    const first = createDemoReflectionProbeFaces();
    const second = createDemoReflectionProbeFaces();

    expect(first).toHaveLength(DEMO_REFLECTION_PROBE_FACE_COUNT);
    expect(first.map((face) => face.face)).toEqual([
      TextureCubeFace.PositiveX,
      TextureCubeFace.NegativeX,
      TextureCubeFace.PositiveY,
      TextureCubeFace.NegativeY,
      TextureCubeFace.PositiveZ,
      TextureCubeFace.NegativeZ
    ]);
    expect(first.map((face) => face.name)).toEqual([
      "positive-x",
      "negative-x",
      "positive-y",
      "negative-y",
      "positive-z",
      "negative-z"
    ]);
    expect(first.map((face) => face.hash)).toEqual(second.map((face) => face.hash));
    expect(new Set(first.map((face) => face.hash)).size).toBe(DEMO_REFLECTION_PROBE_FACE_COUNT);

    for (const face of first) {
      expect(face.pixels).toHaveLength(DEMO_REFLECTION_PROBE_SIZE * DEMO_REFLECTION_PROBE_SIZE * 4);
      expect(face.hash).toBe(hashDemoReflectionProbePixels(face.pixels));
      expect(face.pixels.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
      expect(readPixel(face.pixels, 8, 8)).toEqual([255, 255, 255, 255]);
      expect(readPixel(face.pixels, 64, Math.floor(DEMO_REFLECTION_PROBE_SIZE * 0.34))).toEqual([255, 248, 32, 255]);
      expect(readPixel(face.pixels, Math.floor(DEMO_REFLECTION_PROBE_SIZE * 0.28), 80)).toEqual([28, 246, 255, 255]);
      expect(readPixel(face.pixels, 20, 24)).not.toEqual(readPixel(face.pixels, 107, 103));
    }
  });

  it("creates one linear RGBA8 TextureCube and uploads every full mip-0 face", () => {
    const harness = createFakeTextureHarness();
    const probe = new DemoReflectionProbe({} as Engine, { textureFactory: harness.factory });
    const texture = harness.textures[0];

    expect(harness.descriptors).toEqual([
      {
        name: "WaterOpticsLabProceduralLinearProbe",
        size: DEMO_REFLECTION_PROBE_SIZE,
        format: TextureFormat.R8G8B8A8,
        mipmap: false,
        isSRGBColorSpace: false
      }
    ]);
    expect(probe.texture).toBe(texture as unknown as TextureCube);
    expect(texture).toMatchObject({
      name: "WaterOpticsLabProceduralLinearProbe",
      filterMode: TextureFilterMode.Bilinear,
      wrapModeU: TextureWrapMode.Clamp,
      wrapModeV: TextureWrapMode.Clamp,
      isGCIgnored: true
    });
    expect(texture.uploads).toHaveLength(DEMO_REFLECTION_PROBE_FACE_COUNT);
    expect(texture.uploads.map((upload) => upload.face)).toEqual([
      TextureCubeFace.PositiveX,
      TextureCubeFace.NegativeX,
      TextureCubeFace.PositiveY,
      TextureCubeFace.NegativeY,
      TextureCubeFace.PositiveZ,
      TextureCubeFace.NegativeZ
    ]);
    for (const upload of texture.uploads) {
      expect(upload).toMatchObject({
        mipLevel: 0,
        x: 0,
        y: 0,
        width: DEMO_REFLECTION_PROBE_SIZE,
        height: DEMO_REFLECTION_PROBE_SIZE
      });
    }
    expect(Object.values(probe.faceHashes)).toEqual(
      texture.uploads.map((upload) => hashDemoReflectionProbePixels(upload.pixels))
    );
    expect(probe).toMatchObject({
      size: DEMO_REFLECTION_PROBE_SIZE,
      byteLength: DEMO_REFLECTION_PROBE_BYTE_LENGTH,
      provenance: DEMO_REFLECTION_PROBE_PROVENANCE,
      destroyed: false
    });
    expect(probe.metrics).toEqual({
      textureCreateCount: 1,
      textureDestroyCount: 0,
      activeTextureCount: 1,
      faceUploadCount: 6,
      activeResourceBytes: DEMO_REFLECTION_PROBE_BYTE_LENGTH
    });
  });

  it("destroys its single texture exactly once and clears active resource metrics", () => {
    const harness = createFakeTextureHarness();
    const probe = new DemoReflectionProbe({} as Engine, { textureFactory: harness.factory });
    const texture = harness.textures[0];

    probe.destroy();
    probe.destroy();

    expect(texture.destroyForces).toEqual([true]);
    expect(probe.texture).toBeUndefined();
    expect(probe.destroyed).toBe(true);
    expect(probe.metrics).toEqual({
      textureCreateCount: 1,
      textureDestroyCount: 1,
      activeTextureCount: 0,
      faceUploadCount: 6,
      activeResourceBytes: 0
    });
  });

  it("resolves an explicit Probe request to the same non-empty procedural texture", () => {
    const harness = createFakeTextureHarness();
    const probe = new DemoReflectionProbe({} as Engine, { textureFactory: harness.factory });
    const service = new WaterReflectionService({} as Engine, {} as Entity, {} as Camera);

    service.setProbeTexture(probe.texture);
    service.setRequest({
      id: "water-optics-lab",
      preferredSource: "probe",
      quality: "high",
      visible: true,
      priority: 100,
      planeY: 0,
      cullingMask: Layer.Everything,
      waterLayerMask: Layer.Layer30
    });

    const binding = service.getBinding("water-optics-lab");
    expect(binding).toMatchObject({ requestedSource: "probe", resolvedSource: "probe" });
    expect(binding?.probeTexture).toBe(probe.texture);

    service.setProbeTexture(undefined);
    expect(service.getBinding("water-optics-lab")).toMatchObject({
      requestedSource: "probe",
      resolvedSource: "sky",
      fallbackReason: "probe-unavailable"
    });
    expect(service.getBinding("water-optics-lab")?.probeTexture).toBeUndefined();
    service.destroy();
    probe.destroy();
  });

  it("force-destroys a partially uploaded texture when construction fails", () => {
    const harness = createFakeTextureHarness(2);

    expect(() => new DemoReflectionProbe({} as Engine, { textureFactory: harness.factory })).toThrow(
      "injected upload failure"
    );
    expect(harness.textures).toHaveLength(1);
    expect(harness.textures[0].uploads).toHaveLength(2);
    expect(harness.textures[0].destroyForces).toEqual([true]);
  });
});
