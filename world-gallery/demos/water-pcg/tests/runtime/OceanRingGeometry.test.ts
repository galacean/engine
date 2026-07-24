import { describe, expect, it } from "vitest";
import {
  OceanPatchSkirt,
  createOceanRingLayout,
  createOceanRingPatchTopology
} from "../../runtime/ocean/OceanRingGeometry";

function config(ringCount: 2 | 3) {
  return {
    size: 96,
    ringCount,
    patchSegments: 8,
    waterLevel: 0,
    maxHorizontalDisplacement: 1.5,
    maxVerticalDisplacement: 0.8
  } as const;
}

describe("OceanRingGeometry topology", () => {
  it("builds one central patch plus twelve immutable patches per ring", () => {
    const twoRings = createOceanRingLayout(config(2));
    const threeRings = createOceanRingLayout(config(3));

    expect(twoRings.patches).toHaveLength(25);
    expect(threeRings.patches).toHaveLength(37);
    expect(threeRings.coverageHalfExtent).toBe(48);
    expect(threeRings.baseCellSize).toBeGreaterThan(0);
    expect(threeRings.patches[0]).toMatchObject({ id: "central", lod: 0, skirtMask: OceanPatchSkirt.All });
    expect(threeRings.patches.filter((patch) => patch.lod === 3)).toHaveLength(12);
  });

  it("keeps every nested square boundary coincident and marks the fine owner of each 2:1 transition", () => {
    const layout = createOceanRingLayout(config(3));
    const central = layout.patches[0];
    let previousOuterExtent = central.size * 0.5;

    for (let lod = 1; lod <= layout.ringCount; lod++) {
      const ring = layout.patches.filter((patch) => patch.lod === lod);
      const patchSize = ring[0].size;
      expect(patchSize).toBe(previousOuterExtent);
      expect(ring.some((patch) => patch.skirtMask !== OceanPatchSkirt.None)).toBe(true);
      previousOuterExtent = patchSize * 2;
    }
    expect(previousOuterExtent).toBe(layout.coverageHalfExtent);
  });

  it("collapses odd fine-edge samples into exact 2:1 transition segments", () => {
    const descriptor = createOceanRingLayout(config(2)).patches[0];
    const topology = createOceanRingPatchTopology(
      descriptor,
      0
    );
    const side = descriptor.segmentCount + 1;
    const negativeZEven = topology.positions[0];
    const negativeZOdd = topology.positions[1];
    const negativeXEven = topology.positions[0];
    const negativeXOdd = topology.positions[side];

    expect(negativeZOdd.x).toBe(negativeZEven.x);
    expect(negativeZOdd.z).toBe(negativeZEven.z);
    expect(negativeXOdd.x).toBe(negativeXEven.x);
    expect(negativeXOdd.z).toBe(negativeXEven.z);
  });

  it("emits bounded index buffers whose skirts add geometry without changing the surface grid", () => {
    const descriptor = createOceanRingLayout(config(2)).patches[0];
    const topology = createOceanRingPatchTopology(descriptor, 1.5);
    const skirtlessTopology = createOceanRingPatchTopology(
      descriptor,
      0
    );
    const surfaceVertexCount = (descriptor.segmentCount + 1) ** 2;

    expect(topology.positions.length).toBeGreaterThan(surfaceVertexCount);
    expect(topology.indices.length % 3).toBe(0);
    expect(Math.max(...topology.indices)).toBeLessThan(topology.positions.length);
    expect(skirtlessTopology.positions).toHaveLength(
      surfaceVertexCount
    );
    expect(skirtlessTopology.indices).toHaveLength(
      descriptor.segmentCount * descriptor.segmentCount * 6
    );
  });
});
