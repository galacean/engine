import { describe, expect, it } from "vitest";
import {
  OceanNearshoreDiagnosticCode,
  OceanNearshoreOutsidePolicy
} from "../../authoring/ocean/OceanNearshoreTypes";
import { validateOceanNearshoreDescriptor } from "../../compiler/ocean/OceanNearshoreValidator";
import { createOceanNearshoreFixture } from "../fixtures/oceanNearshoreFixture";

function errorCodes(source: unknown): OceanNearshoreDiagnosticCode[] {
  return validateOceanNearshoreDescriptor(source).diagnostics.map(
    (diagnostic) => diagnostic.code
  );
}

describe("OceanNearshoreValidator", () => {
  it("clones and freezes a valid explicit four-edge descriptor", () => {
    const source = createOceanNearshoreFixture();
    const result = validateOceanNearshoreDescriptor(source);

    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.value).toMatchObject({
      id: "unit-beach-nearshore",
      waterLevel: 0,
      outsidePolicy: {
        negativeZ: OceanNearshoreOutsidePolicy.DeepOcean,
        positiveZ: OceanNearshoreOutsidePolicy.Dry
      }
    });
    expect(result.value?.bedHeights).not.toBe(source.bedHeights);
    expect(result.value?.baseCurrentsXZ).not.toBe(source.baseCurrentsXZ);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value?.outsidePolicy)).toBe(true);
  });

  it.each([
    [
      "negative cell size",
      () => ({
        ...createOceanNearshoreFixture(),
        grid: { ...createOceanNearshoreFixture().grid, cellSizeXZ: [-1, 1] }
      }),
      OceanNearshoreDiagnosticCode.ValueOutOfRange
    ],
    [
      "bed length mismatch",
      () => ({
        ...createOceanNearshoreFixture(),
        bedHeights: new Float32Array(4)
      }),
      OceanNearshoreDiagnosticCode.BufferLengthMismatch
    ],
    [
      "non-finite bed",
      () => {
        const source = createOceanNearshoreFixture();
        source.bedHeights[3] = Number.NaN;
        return source;
      },
      OceanNearshoreDiagnosticCode.InvalidNumber
    ],
    [
      "non-finite current",
      () => {
        const source = createOceanNearshoreFixture();
        source.baseCurrentsXZ![2] = Number.POSITIVE_INFINITY;
        return source;
      },
      OceanNearshoreDiagnosticCode.InvalidNumber
    ],
    [
      "invalid outside policy",
      () => ({
        ...createOceanNearshoreFixture(),
        outsidePolicy: {
          ...createOceanNearshoreFixture().outsidePolicy,
          positiveZ: "clamp"
        }
      }),
      OceanNearshoreDiagnosticCode.InvalidEnum
    ],
    [
      "out-of-bounds obstacle",
      () => ({
        ...createOceanNearshoreFixture(),
        obstacles: [
          {
            id: "outside",
            shape: "circle",
            centerXZ: [2.4, 0] as const,
            radius: 0.5,
            height: 1
          }
        ]
      }),
      OceanNearshoreDiagnosticCode.ObstacleOutOfBounds
    ],
    [
      "texel budget",
      () => ({
        ...createOceanNearshoreFixture(),
        budget: { maxTexelCount: 24 }
      }),
      OceanNearshoreDiagnosticCode.BudgetExceeded
    ]
  ])("fails closed for %s", (_label, createSource, expectedCode) => {
    const result = validateOceanNearshoreDescriptor(createSource());

    expect(result.valid).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: expectedCode })])
    );
  });

  it("rejects masked wet texels whose authored bed has no valid water column", () => {
    const source = createOceanNearshoreFixture();
    const mask = new Uint8Array(source.grid.width * source.grid.height);
    mask[24] = 1;
    const result = validateOceanNearshoreDescriptor({
      ...source,
      wetSource: { kind: "mask", mask, minimumDepth: 0.05 }
    });

    expect(result.valid).toBe(false);
    expect(errorCodes({ ...source, wetSource: { kind: "mask", mask } })).toContain(
      OceanNearshoreDiagnosticCode.InvalidDepth
    );
  });
});
