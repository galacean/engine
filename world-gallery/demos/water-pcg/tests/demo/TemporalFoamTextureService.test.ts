import type { Engine, Texture2D } from "@galacean/engine-core";
import { describe, expect, it } from "vitest";
import {
  TemporalFoamTextureService,
  type TemporalFoamTextureFactory
} from "../../runtime/interaction/TemporalFoamTextureService";
import { TemporalFoamField } from "../../runtime/interaction/TemporalFoamField";
import { createUniformWaterCurrentFieldSnapshot } from "../../runtime/interaction/WaterCurrentFieldSnapshot";

interface FakeTexture {
  readonly name: string;
  readonly uploads: Uint8Array[];
  destroyed: boolean;
  setPixelBuffer(pixels: Uint8Array): void;
  destroy(force?: boolean): void;
}

function createField(decayRatePerSecond = 1): TemporalFoamField {
  return new TemporalFoamField({
    centerX: 0,
    centerZ: 0,
    length: 8,
    width: 4,
    resolutionX: 8,
    resolutionZ: 4,
    decayRatePerSecond
  });
}

function createFakeFactory(textures: FakeTexture[]): TemporalFoamTextureFactory {
  return {
    create(_engine, _width, _height, name): Texture2D {
      const texture: FakeTexture = {
        name,
        uploads: [],
        destroyed: false,
        setPixelBuffer(pixels): void {
          this.uploads.push(pixels.slice());
        },
        destroy(): void {
          this.destroyed = true;
        }
      };
      textures.push(texture);
      return texture as unknown as Texture2D;
    }
  };
}

describe("TemporalFoamTextureService", () => {
  it("keeps Low/disabled on analytic fallback without allocating textures", () => {
    const textures: FakeTexture[] = [];
    const field = createField();
    const service = new TemporalFoamTextureService({} as Engine, field, {
      enabled: true,
      quality: "low",
      textureFactory: createFakeFactory(textures)
    });

    field.addSourceWorld(0, 0, 1, 1);
    expect(service.updateFrame(1, 1 / 60)).toBe(false);
    expect(textures).toHaveLength(0);
    expect(service.texture).toBeNull();
    expect(service.metrics).toMatchObject({
      enabled: false,
      analyticFallback: true,
      textureCount: 0,
      uploadCount: 0,
      resourceBytes: 0
    });
    service.destroy();
  });

  it("preserves source before step and uploads only the selected R8 channel once per render frame", () => {
    const textures: FakeTexture[] = [];
    const field = createField(0);
    const service = new TemporalFoamTextureService({} as Engine, field, {
      enabled: true,
      quality: "medium",
      debugView: "source",
      textureFactory: createFakeFactory(textures)
    });
    expect(textures).toHaveLength(3);
    expect(service.metrics.resourceBytes).toBe(8 * 4 * 3);

    field.addSourceWorld(0, 0, 1.1, 1);
    expect(service.updateFrame(1, 1 / 30)).toBe(true);
    expect(field.sourceBuffer.every((value) => value === 0)).toBe(true);
    expect(textures[0].uploads).toHaveLength(1);
    expect(textures[0].uploads[0].some((value) => value > 0)).toBe(true);
    expect(service.metrics.lastFrameUploadCount).toBe(1);
    expect(service.updateFrame(1, 1 / 60)).toBe(false);
    expect(service.metrics.lastFrameUploadCount).toBe(1);

    expect(service.updateFrame(2, 1 / 30)).toBe(true);
    expect(textures[0].uploads).toHaveLength(2);
    expect(textures[0].uploads[1].every((value) => value === 0)).toBe(true);
    expect(service.metrics.uploadCount).toBe(2);
    expect(service.metrics.active).toBe(true);
    expect(service.metrics.peak).toBeGreaterThan(0);
  });

  it("forces one synchronization after debug switches and destroys all bounded resources", () => {
    const textures: FakeTexture[] = [];
    const field = createField(0);
    const service = new TemporalFoamTextureService({} as Engine, field, {
      enabled: true,
      quality: "medium",
      debugView: "history",
      textureFactory: createFakeFactory(textures)
    });

    expect(service.updateFrame(1, 1 / 60)).toBe(true);
    expect(service.metrics.lastFrameUploadCount).toBe(1);
    const historyTexture = service.texture;
    service.setDebugView("final");
    expect(service.updateFrame(2, 1 / 60)).toBe(true);
    expect(service.texture).not.toBe(historyTexture);
    expect(service.metrics.lastFrameUploadCount).toBe(1);
    service.setDebugView("source");
    expect(service.updateFrame(3, 0)).toBe(true);
    expect(service.texture).toBe(textures[0] as unknown as Texture2D);

    service.destroy();
    expect(textures.every((texture) => texture.destroyed)).toBe(true);
    expect(service.texture).toBeNull();
    expect(service.metrics).toMatchObject({
      enabled: false,
      analyticFallback: true,
      active: false,
      textureCount: 0,
      resourceBytes: 0
    });
  });

  it("synchronizes a forced fixed-time view without advancing history", () => {
    const textures: FakeTexture[] = [];
    const field = createField(0);
    const service = new TemporalFoamTextureService(
      {} as Engine,
      field,
      {
        enabled: true,
        quality: "medium",
        debugView: "final",
        textureFactory: createFakeFactory(textures)
      }
    );

    field.addSourceWorld(0, 0, 1.1, 1);
    service.updateFrame(1, 1 / 30);
    const historyUpdateCount =
      service.metrics.historyUpdateCount;
    service.setDebugView("history");

    expect(service.updateFrame(2, 0)).toBe(true);
    expect(service.metrics.historyUpdateCount).toBe(
      historyUpdateCount
    );
    expect(
      (service.texture as unknown as FakeTexture).uploads.at(-1)
    ).toEqual(field.historyBuffer);
  });

  it("uploads one zero history after clear and then stops uploading while idle", () => {
    const textures: FakeTexture[] = [];
    const field = createField(0.8);
    const service = new TemporalFoamTextureService({} as Engine, field, {
      enabled: true,
      quality: "medium",
      debugView: "history",
      textureFactory: createFakeFactory(textures)
    });

    field.addSourceWorld(0, 0, 1.1, 1);
    expect(service.updateFrame(1, 1 / 30)).toBe(true);
    expect((service.texture as unknown as FakeTexture).uploads.at(-1)?.some((value) => value > 0)).toBe(true);

    service.clear();
    expect(field.isIdle).toBe(true);
    expect(service.updateFrame(2, 1 / 60)).toBe(true);
    expect((service.texture as unknown as FakeTexture).uploads.at(-1)?.every((value) => value === 0)).toBe(true);
    expect(service.metrics).toMatchObject({ active: false, peak: 0, lastFrameUploadCount: 1 });

    const uploadCount = service.metrics.uploadCount;
    expect(service.updateFrame(3, 1 / 60)).toBe(false);
    expect(service.metrics.uploadCount).toBe(uploadCount);
    expect(service.metrics.lastFrameUploadCount).toBe(0);
  });

  it("caps active CPU history simulation at 30 Hz without catch-up loops", () => {
    const textures: FakeTexture[] = [];
    const field = createField(0);
    const current = createUniformWaterCurrentFieldSnapshot({ revision: 4, currentX: 0.04, currentZ: 0 });
    const service = new TemporalFoamTextureService({} as Engine, field, {
      enabled: true,
      quality: "medium",
      debugView: "history",
      textureFactory: createFakeFactory(textures)
    });

    field.addSourceWorld(0, 0, 1.1, 1);
    for (let frame = 1; frame <= 120; frame++) service.updateFrame(frame, 1 / 120, current);

    expect(service.metrics).toMatchObject({
      historyUpdateCount: 30,
      targetUpdateRateHz: 30,
      rateLimitedFrameCount: 90,
      currentSnapshotKind: "uniform",
      currentSnapshotRevision: 4
    });
    expect(service.metrics.lastStepDeltaSeconds).toBeCloseTo(1 / 30, 6);
    expect(field.metrics.updateCount).toBe(30);
    expect(field.metrics.currentLookupCount).toBe(30);
    expect(field.metrics.currentSurfaceQueryCount).toBe(0);
    expect(service.metrics.uploadCount).toBeLessThanOrEqual(31);
  });

  it.each([30, 60, 120])("runs exactly 30 history updates across one second rendered at %i FPS", (renderRate) => {
    const textures: FakeTexture[] = [];
    const field = createField(0);
    const service = new TemporalFoamTextureService({} as Engine, field, {
      enabled: true,
      quality: "medium",
      textureFactory: createFakeFactory(textures)
    });

    field.addSourceWorld(0, 0, 1.1, 1);
    for (let frame = 1; frame <= renderRate; frame++) service.updateFrame(frame, 1 / renderRate);

    expect(field.metrics.updateCount).toBe(30);
    expect(service.metrics.historyUpdateCount).toBe(30);
  });

  it("treats 30 Hz as an upper bound at non-divisible frame rates and never catches up within one frame", () => {
    const textures: FakeTexture[] = [];
    const field = createField(0);
    const service = new TemporalFoamTextureService({} as Engine, field, {
      enabled: true,
      quality: "medium",
      debugView: "source",
      textureFactory: createFakeFactory(textures)
    });

    field.addSourceWorld(0, 0, 1.1, 1);
    for (let frame = 1; frame <= 50; frame++) service.updateFrame(frame, 1 / 50);
    expect(field.metrics.updateCount).toBe(25);
    expect(service.metrics.uploadCount).toBeLessThanOrEqual(26);

    const updateCountBeforeLongFrame = field.metrics.updateCount;
    service.updateFrame(51, 1);
    expect(field.metrics.updateCount - updateCountBeforeLongFrame).toBe(1);
    expect(service.metrics.lastStepDeltaSeconds).toBe(1);
  });
});
