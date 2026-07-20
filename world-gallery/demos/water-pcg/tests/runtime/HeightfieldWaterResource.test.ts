import { describe, expect, it } from "vitest";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { HeightfieldWaterCompiler } from "../../compiler/heightfield/HeightfieldWaterCompiler";
import { createHeightfieldWaterFixture } from "../../demo/heightfield/heightfieldFixture";
import { HeightfieldWaterResource } from "../../runtime/heightfield/HeightfieldWaterResource";

describe("HeightfieldWaterResource", () => {
  it("owns immutable compiled data and exposes stable metadata and byte accounting", () => {
    const compiled = HeightfieldWaterCompiler.compile(
      createHeightfieldWaterFixture(WaterQualityTier.Low).descriptor
    ).data!;
    const resource = HeightfieldWaterResource.create(compiled);

    expect(resource.metadata).toEqual({
      sourceId: compiled.sourceId,
      compiledHash: compiled.sourceHash,
      chunkCount: compiled.chunks.length
    });
    expect(resource.data).toBe(compiled);
    expect(resource.byteLength).toBeGreaterThan(compiled.localMapAtlas.pixels.length);
    expect(resource.isDisposed).toBe(false);
  });

  it("defers disposal until every runtime reference is released", () => {
    const compiled = HeightfieldWaterCompiler.compile(
      createHeightfieldWaterFixture(WaterQualityTier.Low).descriptor
    ).data!;
    const resource = HeightfieldWaterResource.create(compiled);

    resource.retain();
    resource.retain();
    resource.dispose();
    expect(resource.isDisposed).toBe(false);
    expect(resource.disposeRequested).toBe(true);
    expect(() => resource.retain()).toThrow(/disposing/);

    resource.release();
    expect(resource.isDisposed).toBe(false);
    resource.release();
    expect(resource.isDisposed).toBe(true);
    expect(resource.byteLength).toBe(0);
    expect(() => resource.data).toThrow(/disposed/);
    expect(() => resource.release()).toThrow(/already zero/);
  });
});
