import { describe, expect, it } from "vitest";
import { curvedMainRiverExample } from "../example/curvedMainRiver";
import { multiTributaryRiverExample } from "../example/multiTributaryRiver";
import { RiverDiagnosticCode } from "../river/constants";
import { RiverNetworkCompiler } from "../river/RiverNetworkCompiler";
import { RiverNetworkDescriptor } from "../river/types";
import { invalidNetworkFixture } from "./fixtures/riverFixtures";

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
});
