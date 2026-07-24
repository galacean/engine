import type { Engine, Texture2D } from "@galacean/engine-core";
import { TextureFormat } from "@galacean/engine-core";
import { describe, expect, it, vi } from "vitest";
import { OceanNearshoreCompiler } from "../../compiler/ocean/OceanNearshoreCompiler";
import { OceanNearshoreFieldResource } from "../../runtime/ocean/OceanNearshoreFieldResource";
import { OceanNearshoreStateField } from "../../runtime/ocean/OceanNearshoreStateField";
import {
  OceanNearshoreStateTextureService,
  type OceanNearshoreStateTextureFactory
} from "../../runtime/ocean/OceanNearshoreStateTextureService";
import { createOceanNearshoreFixture } from "../fixtures/oceanNearshoreFixture";

interface FakeTexture {
  readonly format: TextureFormat;
  readonly setPixelBuffer: ReturnType<typeof vi.fn>;
  readonly destroy: ReturnType<typeof vi.fn>;
}

function createHarness(): {
  readonly resource: OceanNearshoreFieldResource;
  readonly field: OceanNearshoreStateField;
  readonly service: OceanNearshoreStateTextureService;
  readonly textures: FakeTexture[];
} {
  const compiled = OceanNearshoreCompiler.compile(
    createOceanNearshoreFixture()
  );
  if (!compiled.valid || !compiled.data) {
    throw new Error("Nearshore fixture did not compile.");
  }
  const resource = OceanNearshoreFieldResource.create(compiled.data);
  const field = new OceanNearshoreStateField(resource);
  const textures: FakeTexture[] = [];
  const factory: OceanNearshoreStateTextureFactory = {
    create(_engine, _width, _height, format) {
      const texture: FakeTexture = {
        format,
        setPixelBuffer: vi.fn(),
        destroy: vi.fn()
      };
      textures.push(texture);
      return texture as unknown as Texture2D;
    }
  };
  const service = new OceanNearshoreStateTextureService(
    {} as Engine,
    field,
    { wetnessUploadRateHz: 10, textureFactory: factory }
  );
  return { resource, field, service, textures };
}

describe("OceanNearshoreStateTextureService", () => {
  it("owns one RGBA state and one R8 wetness texture", () => {
    const { service, textures } = createHarness();
    expect(textures.map((texture) => texture.format)).toEqual([
      TextureFormat.R8G8B8A8,
      TextureFormat.R8
    ]);
    expect(service.metrics.textureCount).toBe(2);
    expect(service.metrics.resourceBytes).toBe(5 * 5 * 5);
  });

  it("caps state at 30 Hz, wetness lower, and each texture to one upload per frame", () => {
    const { service, textures } = createHarness();
    expect(service.updateFrame(1, 1 / 120)).toBe(true);
    expect(service.metrics.lastFrameStateUploadCount).toBe(1);
    expect(service.metrics.lastFrameWetnessUploadCount).toBe(1);
    expect(service.updateFrame(1, 1)).toBe(false);
    expect(textures[0].setPixelBuffer).toHaveBeenCalledTimes(1);
    expect(textures[1].setPixelBuffer).toHaveBeenCalledTimes(1);

    for (let frame = 2; frame <= 13; frame++) {
      service.updateFrame(frame, 1 / 120);
      expect(service.metrics.lastFrameStateUploadCount).toBeLessThanOrEqual(1);
      expect(service.metrics.lastFrameWetnessUploadCount).toBeLessThanOrEqual(1);
    }
    expect(service.metrics.stateUpdateCount).toBe(3);
    expect(service.metrics.stateUploadCount).toBe(4);
    expect(service.metrics.wetnessUploadCount).toBe(2);
    expect(service.metrics.stateUpdateRateHz).toBe(30);
    expect(service.metrics.wetnessUploadRateHz).toBe(10);
  });

  it("seeks deterministically and uploads a fixed time only once", () => {
    const { service } = createHarness();
    expect(service.updateFrame(1, 0, 2)).toBe(true);
    const revision = service.metrics.stateRevision;
    expect(service.updateFrame(2, 0, 2)).toBe(false);
    expect(service.metrics.stateRevision).toBe(revision);
    expect(service.metrics.lastFrameStateUploadCount).toBe(0);
    expect(service.metrics.lastFrameWetnessUploadCount).toBe(0);
  });

  it("resets and balances texture destruction", () => {
    const { resource, field, service, textures } = createHarness();
    service.updateFrame(1, 0, 2);
    service.reset();
    service.updateFrame(2, 0, 0);
    expect(field.metrics.activeWetnessTexelCount).toBe(0);
    service.destroy();
    expect(textures.every((texture) => texture.destroy.mock.calls.length === 1)).toBe(
      true
    );
    expect(service.metrics.textureCount).toBe(0);
    expect(service.metrics.resourceBytes).toBe(0);
    field.destroy();
    resource.dispose();
  });
});
