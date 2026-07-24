import { describe, expect, it } from "vitest";
import { OceanNearshoreCompiler } from "../../compiler/ocean/OceanNearshoreCompiler";
import {
  createOceanNearshoreFieldSample,
  OceanNearshoreFieldProvider,
  OceanNearshoreSampleRegion
} from "../../runtime/ocean/OceanNearshoreFieldProvider";
import { OceanNearshoreFieldResource } from "../../runtime/ocean/OceanNearshoreFieldResource";
import { createOceanNearshoreFixture } from "../fixtures/oceanNearshoreFixture";

function createProvider(): {
  readonly resource: OceanNearshoreFieldResource;
  readonly provider: OceanNearshoreFieldProvider;
} {
  const result = OceanNearshoreCompiler.compile(createOceanNearshoreFixture());
  if (!result.valid || !result.data) throw new Error("Nearshore fixture did not compile.");
  const resource = OceanNearshoreFieldResource.create(result.data);
  const provider = new OceanNearshoreFieldProvider(resource);
  return { resource, provider };
}

describe("OceanNearshoreFieldProvider", () => {
  it("bilinearly samples finite shallow-water facts into caller-owned output", () => {
    const { provider } = createProvider();
    const sample = createOceanNearshoreFieldSample();
    const identity = sample;

    expect(provider.sample(0, -1, sample)).toBe(
      OceanNearshoreSampleRegion.InsideWet
    );
    expect(sample).toBe(identity);
    expect(sample.insideField).toBe(true);
    expect(sample.wet).toBe(true);
    expect(sample.waterDepth).toBeCloseTo(2.5);
    expect(sample.bedHeight).toBeCloseTo(-2.5);
    expect(sample.shoreDistance).toBeGreaterThan(0);
    expect(sample.shoreNormalZ).toBeGreaterThan(0.9);
    expect(sample.baseCurrentX).toBeCloseTo(0);
    expect(sample.baseCurrentZ).toBeCloseTo(-0.22);

    provider.destroy();
  });

  it("returns dry inside/land outside while preserving unbounded deep-ocean edges", () => {
    const { provider } = createProvider();
    const sample = createOceanNearshoreFieldSample();

    expect(provider.sample(0, 2, sample)).toBe(
      OceanNearshoreSampleRegion.InsideDry
    );
    expect(sample.wet).toBe(false);
    expect(sample.waterDepth).toBe(0);

    expect(provider.sample(0, 20, sample)).toBe(
      OceanNearshoreSampleRegion.OutsideDry
    );
    expect(sample.wet).toBe(false);
    expect(sample.waterDepth).toBe(0);

    expect(provider.sample(0, -20, sample)).toBe(
      OceanNearshoreSampleRegion.OutsideDeepOcean
    );
    expect(sample.wet).toBe(true);
    expect(sample.waterDepth).toBe(Number.POSITIVE_INFINITY);

    // At a corner, any explicit dry edge wins over a deep-ocean edge.
    expect(provider.sample(-20, 20, sample)).toBe(
      OceanNearshoreSampleRegion.OutsideDry
    );

    provider.destroy();
  });

  it("retains/disposes the shared resource without exposing mutable compiler arrays", () => {
    const { resource, provider } = createProvider();
    expect(resource.referenceCount).toBe(1);
    expect(resource.byteLength).toBeGreaterThan(0);

    resource.dispose();
    expect(resource.disposeRequested).toBe(true);
    expect(resource.isDisposed).toBe(false);
    provider.destroy();
    expect(resource.referenceCount).toBe(0);
    expect(resource.isDisposed).toBe(true);
    expect(resource.byteLength).toBe(0);
    expect(() => resource.bedHeightAt(0)).toThrow(/disposed/);
  });

  it("fails closed for non-finite coordinates and rejects use after destroy", () => {
    const { provider } = createProvider();
    const sample = createOceanNearshoreFieldSample();

    expect(provider.sample(Number.NaN, 0, sample)).toBe(
      OceanNearshoreSampleRegion.Invalid
    );
    expect(sample.wet).toBe(false);
    provider.destroy();
    expect(() => provider.sample(0, 0, sample)).toThrow(/destroyed/);
  });
});
