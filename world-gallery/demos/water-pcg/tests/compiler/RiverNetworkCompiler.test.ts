import { describe, expect, it } from "vitest";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";
import { RiverDiagnosticCode } from "../../compiler/shared/diagnostics";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import type { RiverNetworkDescriptor } from "../../authoring/river/RiverDescriptor";
import { invalidNetworkFixture } from "../fixtures/riverFixtures";

function containsTrianglePoint(
  point: readonly [number, number],
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number]
): boolean {
  const sign = (p1: readonly [number, number], p2: readonly [number, number], p3: readonly [number, number]) =>
    (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const pointA = sign(point, [a[0], a[2]], [b[0], b[2]]);
  const pointB = sign(point, [b[0], b[2]], [c[0], c[2]]);
  const pointC = sign(point, [c[0], c[2]], [a[0], a[2]]);
  return !((pointA < -1e-6 || pointB < -1e-6 || pointC < -1e-6) && (pointA > 1e-6 || pointB > 1e-6 || pointC > 1e-6));
}

describe("RiverNetworkCompiler", () => {
  it("retains topology and emits deterministic typed runtime data", () => {
    const descriptor = multiTributaryRiverExample.riverDescriptor;
    const first = RiverNetworkCompiler.compile(descriptor);
    const second = RiverNetworkCompiler.compile(descriptor);

    expect(first.valid).toBe(true);
    expect(first.data?.stats).toMatchObject({
      nodeCount: 7,
      reachCount: 6,
      sourceCount: 4,
      mouthCount: 1,
      junctionCount: 2
    });
    expect(Array.from(first.data?.topologicalNodeIndices ?? [])).toEqual(
      Array.from(second.data?.topologicalNodeIndices ?? [])
    );
    expect(Array.from(first.data?.waterSurfaceElevations ?? [])).toEqual(
      Array.from(second.data?.waterSurfaceElevations ?? [])
    );
    expect(Array.from(first.data?.nodes[4].incomingReachIndices ?? [])).toEqual([0, 1]);
    expect(Array.from(first.data?.nodes[4].outgoingReachIndices ?? [])).toEqual([2]);
    expect(first.data?.reaches[2]).toMatchObject({
      id: "main-middle",
      fromNodeIndex: 4,
      toNodeIndex: 5,
      order: 4
    });
    expect(first.data?.junctions).toHaveLength(2);
    expect(first.data?.stats.chunkCount).toBe(first.data?.chunks.length);
    expect(first.data?.chunks.length).toBeGreaterThanOrEqual(first.data!.reaches.length + first.data!.junctions.length);
    expect(first.data?.stats.queryPrimitiveCount).toBe(first.data?.queryIndex.primitiveCount);
    expect(first.data?.stats.queryCellCount).toBe(first.data?.queryIndex.cellCount);
    expect(first.data?.stats.localMapRegionCount).toBe(first.data?.junctions.length);
    expect(first.data?.junctions.map((junction) => junction.surfaceGeometry.positions)).toEqual(
      second.data?.junctions.map((junction) => junction.surfaceGeometry.positions)
    );
  });

  it("trims connected reaches and stitches confluence patch boundaries to reach ribbons", () => {
    const result = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor);
    const junction = result.data!.junctions.find((candidate) => candidate.id === "upper-confluence")!;
    const incoming = Array.from(junction.incomingReachIndices);
    const outgoing = Array.from(junction.outgoingReachIndices);

    expect(incoming).toEqual([0, 1]);
    expect(outgoing).toEqual([2]);
    expect(junction.materialSourceReachIndex).toBe(2);
    const boundaryVertexCount = junction.queryBoundary.length;
    expect(junction.surfaceGeometry.positions.length).toBeGreaterThan(boundaryVertexCount + 1);
    expect(junction.surfaceGeometry.uvs).toHaveLength(junction.surfaceGeometry.positions.length);
    expect(junction.surfaceGeometry.uv1s).toHaveLength(junction.surfaceGeometry.positions.length);
    expect(junction.surfaceGeometry.colors).toHaveLength(junction.surfaceGeometry.positions.length);
    expect(junction.bankFoamGeometry?.positions).toHaveLength(boundaryVertexCount * 2);
    for (const reachIndex of incoming) {
      const reach = result.data!.reaches[reachIndex];
      expect(reach.artifact.samples.at(-1)!.distance).toBeCloseTo(reach.length - junction.mergeRadius, 4);
    }
    expect(result.data!.reaches[outgoing[0]].artifact.samples[0].distance).toBeCloseTo(junction.mergeRadius, 4);

    const connectedSurfacePositions = [...incoming, ...outgoing].flatMap(
      (reachIndex) => result.data!.reaches[reachIndex].artifact.surfaceGeometry.positions
    );
    for (const boundary of junction.surfaceGeometry.positions.slice(1, boundaryVertexCount + 1)) {
      expect(
        connectedSurfacePositions.some(
          (position) =>
            Math.abs(position[0] - boundary[0]) < 1e-6 &&
            Math.abs(position[1] - boundary[1]) < 1e-6 &&
            Math.abs(position[2] - boundary[2]) < 1e-6
        )
      ).toBe(true);
    }
    const connectedSurfaceVertices = [...incoming, ...outgoing].flatMap((reachIndex) => {
      const geometry = result.data!.reaches[reachIndex].artifact.surfaceGeometry;
      return geometry.positions.map((position, vertexIndex) => ({ position, uv: geometry.uvs[vertexIndex] }));
    });
    for (let vertexIndex = 0; vertexIndex < boundaryVertexCount; vertexIndex++) {
      const boundaryPosition = junction.surfaceGeometry.positions[vertexIndex + 1];
      const connected = connectedSurfaceVertices.find(
        ({ position }) =>
          Math.abs(position[0] - boundaryPosition[0]) < 1e-6 &&
          Math.abs(position[1] - boundaryPosition[1]) < 1e-6 &&
          Math.abs(position[2] - boundaryPosition[2]) < 1e-6
      );
      expect(connected).toBeDefined();
      expect(junction.surfaceGeometry.uvs[vertexIndex + 1]).toEqual(connected?.uv);
    }
    const connectedSurfaceUv1s = [...incoming, ...outgoing].flatMap(
      (reachIndex) => result.data!.reaches[reachIndex].artifact.surfaceGeometry.uv1s
    );
    for (const boundaryUv1 of junction.surfaceGeometry.uv1s.slice(1, boundaryVertexCount + 1)) {
      expect(
        connectedSurfaceUv1s.some(
          (uv1) => Math.abs(uv1[0] - boundaryUv1[0]) < 1e-6 && Math.abs(uv1[1] - boundaryUv1[1]) < 1e-6
        )
      ).toBe(true);
    }
    const outgoingTangent = result.data!.reaches[outgoing[0]].artifact.samples[0].tangent;
    expect(
      junction.flowDirection[0] * outgoingTangent[0] + junction.flowDirection[2] * outgoingTangent[2]
    ).toBeGreaterThan(0.99);
  });

  it("rejects a confluence radius that cannot contain connected surface boundaries", () => {
    const source = multiTributaryRiverExample.riverDescriptor;
    const descriptor: RiverNetworkDescriptor = {
      ...source,
      nodes: source.nodes.map((node) => (node.id === "upper-confluence" ? { ...node, mergeRadius: 1 } : node))
    };
    const result = RiverNetworkCompiler.compile(descriptor);

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      RiverDiagnosticCode.JunctionRadiusTooSmall
    );
  });

  it("does not generate overlapping junction triangles", () => {
    const data = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor).data!;
    for (const junction of data.junctions) {
      const geometry = junction.surfaceGeometry;
      const indices = Array.from(geometry.indices);
      for (let triangleIndex = 0; triangleIndex < indices.length; triangleIndex += 3) {
        const a = geometry.positions[indices[triangleIndex]];
        const b = geometry.positions[indices[triangleIndex + 1]];
        const c = geometry.positions[indices[triangleIndex + 2]];
        const centroid = [(a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3] as const;
        const coveringTriangleIndices: number[] = [];
        for (let candidateIndex = 0; candidateIndex < indices.length; candidateIndex += 3) {
          if (
            containsTrianglePoint(
              centroid,
              geometry.positions[indices[candidateIndex]],
              geometry.positions[indices[candidateIndex + 1]],
              geometry.positions[indices[candidateIndex + 2]]
            )
          ) {
            coveringTriangleIndices.push(candidateIndex / 3);
          }
        }
        expect(
          coveringTriangleIndices,
          `${junction.id} triangle ${triangleIndex / 3} covered by ${coveringTriangleIndices.join(",")}`
        ).toEqual([triangleIndex / 3]);
      }
    }
  });

  it("snaps curve endpoints to compiler-resolved node positions with a diagnostic", () => {
    const source = curvedMainRiverExample.riverDescriptor;
    const descriptor: RiverNetworkDescriptor = {
      ...source,
      segments: source.segments.map((segment) => ({
        ...segment,
        curve: {
          ...segment.curve,
          points: segment.curve.points.map((point, pointIndex) =>
            pointIndex === 0 ? { ...point, position: [-100, 12, -100] } : point
          )
        }
      }))
    };
    const result = RiverNetworkCompiler.compile(descriptor);

    expect(result.valid).toBe(true);
    expect(result.data?.stats.endpointSnapCount).toBe(1);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: RiverDiagnosticCode.SegmentEndpointMismatch })])
    );
    expect(result.data?.reaches[0].config.path.points[0].position).toEqual(result.data?.nodes[0].position);
  });

  it("resolves a monotonic downstream water profile from authored elevations", () => {
    const source = curvedMainRiverExample.riverDescriptor;
    const descriptor: RiverNetworkDescriptor = {
      ...source,
      nodes: source.nodes.map((node) =>
        node.id === "main-mouth" ? { ...node, position: [42, 2, 26], elevation: 2 } : node
      )
    };
    const result = RiverNetworkCompiler.compile(descriptor);

    expect(result.valid).toBe(true);
    expect(result.data?.stats.reversedElevationCount).toBe(1);
    expect(result.data?.stats.waterProfileAdjustmentCount).toBe(1);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: RiverDiagnosticCode.WaterProfileAdjusted,
          repair: { originalValue: 2, repairedValue: expect.closeTo(0.2) }
        })
      ])
    );
    expect(result.data?.waterSurfaceElevations.at(1)).toBeCloseTo(0.2);
    expect(result.data?.reaches[0].elevationDrop).toBeCloseTo(0);
    expect(result.data?.reaches[0].config.path.points.at(-1)?.position[1]).toBeCloseTo(0.2);
  });

  it("freezes compiler-owned containers and reach configs", () => {
    const result = RiverNetworkCompiler.compile(curvedMainRiverExample.riverDescriptor);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.data)).toBe(true);
    expect(Object.isFrozen(result.data?.nodes)).toBe(true);
    expect(Object.isFrozen(result.data?.reaches[0].config)).toBe(true);
    expect(Object.isFrozen(result.data?.reaches[0].config.path.points)).toBe(true);
  });

  it("does not emit compiled data for an invalid graph", () => {
    const result = RiverNetworkCompiler.compile(invalidNetworkFixture);

    expect(result.valid).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([RiverDiagnosticCode.DuplicateId, RiverDiagnosticCode.MissingNodeReference])
    );
  });

  it("accepts unknown input and rejects malformed runtime values without throwing", () => {
    expect(() => RiverNetworkCompiler.compile({ id: "broken" })).not.toThrow();
    const result = RiverNetworkCompiler.compile({ id: "broken" });
    expect(result.valid).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("isolates compiler-owned numeric buffers from caller mutation", () => {
    const result = RiverNetworkCompiler.compile(curvedMainRiverExample.riverDescriptor);
    const originalElevation = result.data?.waterSurfaceElevations.at(0);
    const copiedElevations = result.data?.waterSurfaceElevations.toTypedArray();
    const copiedTopology = result.data?.topologicalNodeIndices.toTypedArray();
    if (!copiedElevations || !copiedTopology) throw new Error("Expected compiled buffers.");

    copiedElevations[0] = 999;
    copiedTopology[0] = 999;

    expect(result.data?.waterSurfaceElevations.at(0)).toBe(originalElevation);
    expect(result.data?.topologicalNodeIndices.at(0)).not.toBe(999);
  });

  it("redistributes the real adaptive sample count within whole-network budgets", () => {
    const source = curvedMainRiverExample.riverDescriptor;
    const descriptor: RiverNetworkDescriptor = {
      ...source,
      budget: {
        maxSegmentCount: 1,
        maxSampleCount: 12,
        maxVertexCount: 48,
        maxChunkCount: 1,
        maxMapPixelCount: 0
      }
    };
    const result = RiverNetworkCompiler.compile(descriptor);

    expect(result.valid).toBe(true);
    expect(result.data?.stats).toMatchObject({
      sampleCount: 12,
      vertexCount: 48,
      chunkCount: 1,
      mapPixelCount: 0,
      budgetRedistributed: true
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: RiverDiagnosticCode.NetworkBudgetRedistributed })])
    );
  });

  it("assigns deterministic network-distance offsets to downstream reaches", () => {
    const result = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor);
    const middle = result.data?.reaches.find((reach) => reach.id === "main-middle");
    const lowerConfluence = result.data?.nodes.find((node) => node.id === "lower-confluence");
    const downstream = result.data?.reaches.find((reach) => reach.id === "main-lower");
    const expectedOffset = Math.max(
      ...Array.from(lowerConfluence?.incomingReachIndices ?? []).map((reachIndex) => {
        const reach = result.data!.reaches[reachIndex];
        return reach.networkDistanceOffset + reach.length;
      })
    );

    expect(middle?.networkDistanceOffset).toBeGreaterThan(0);
    expect(downstream?.networkDistanceOffset).toBeCloseTo(expectedOffset, 4);
  });

  it("assigns continuous network flow-time offsets without reversing local phase", () => {
    const result = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor);
    const lowerConfluence = result.data?.nodes.find((node) => node.id === "lower-confluence");
    const downstream = result.data?.reaches.find((reach) => reach.id === "main-lower");
    const expectedOffset = Math.max(
      ...Array.from(lowerConfluence?.incomingReachIndices ?? []).map((reachIndex) => {
        const reach = result.data!.reaches[reachIndex];
        return reach.networkFlowTimeOffset + reach.flowTravelDuration;
      })
    );

    expect(downstream?.networkFlowTimeOffset).toBeCloseTo(expectedOffset, 4);
    for (const reach of result.data?.reaches ?? []) {
      const flowCoordinates = reach.artifact.surfaceGeometry.uvs.map((uv) => uv[1]);
      for (let index = 1; index < flowCoordinates.length; index++) {
        expect(flowCoordinates[index]).toBeGreaterThanOrEqual(flowCoordinates[index - 1]);
      }
    }
  });
});
