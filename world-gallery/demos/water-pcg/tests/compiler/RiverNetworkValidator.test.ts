import { describe, expect, it } from "vitest";
import { RiverNetworkSchemaVersion, RiverNodeKind } from "../../authoring/river/RiverAuthoringEnums";
import { validateRiverNetwork, validateRiverNetworkDescriptor } from "../../compiler/river/RiverNetworkValidator";
import { RiverDiagnosticCode } from "../../compiler/shared/diagnostics";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";
import { bifurcationNetworkFixture, invalidNetworkFixture, straightFixture } from "../fixtures/riverFixtures";

describe("RiverNetworkValidator", () => {
  it.each([curvedMainRiverExample.riverDescriptor, multiTributaryRiverExample.riverDescriptor])(
    "accepts the valid example network $id",
    (network) => expect(validateRiverNetworkDescriptor(network)).toMatchObject({ valid: true, diagnostics: [] })
  );

  it("returns stable diagnostics for invalid references and duplicate ids", () => {
    const first = validateRiverNetworkDescriptor(invalidNetworkFixture);
    const second = validateRiverNetworkDescriptor(invalidNetworkFixture);
    expect(first.valid).toBe(false);
    expect(first.diagnostics).toEqual(second.diagnostics);
    expect(first.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([RiverDiagnosticCode.DuplicateId, RiverDiagnosticCode.MissingNodeReference])
    );
  });

  it("offers one lightweight entry for shape and semantic validation", () => {
    const malformed = validateRiverNetwork({ id: "missing-network-fields" });
    const semantic = validateRiverNetwork(bifurcationNetworkFixture);

    expect(malformed.valid).toBe(false);
    expect(malformed.diagnostics.map((diagnostic) => diagnostic.code)).toContain(RiverDiagnosticCode.MissingField);
    expect(semantic.valid).toBe(false);
    expect(semantic.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      RiverDiagnosticCode.UnsupportedJunctionKind
    );
  });

  it("rejects empty networks instead of returning valid empty compiled data", () => {
    const source = curvedMainRiverExample.riverDescriptor;
    const result = validateRiverNetworkDescriptor({ ...source, nodes: [], segments: [] });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: RiverDiagnosticCode.ValueOutOfRange, path: "nodes" }),
        expect.objectContaining({ code: RiverDiagnosticCode.ValueOutOfRange, path: "segments" })
      ])
    );
  });

  it("reports the actual final control-point index for endpoint repairs", () => {
    const source = curvedMainRiverExample.riverDescriptor;
    const points = source.segments[0].curve.points;
    const result = validateRiverNetworkDescriptor({
      ...source,
      segments: source.segments.map((segment, segmentIndex) =>
        segmentIndex === 0
          ? {
              ...segment,
              curve: {
                ...segment.curve,
                points: segment.curve.points.map((point, pointIndex) =>
                  pointIndex === segment.curve.points.length - 1 ? { ...point, position: [999, 0, 999] } : point
                )
              }
            }
          : segment
      )
    });

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: RiverDiagnosticCode.SegmentEndpointMismatch,
          path: `segments[0].curve.points[${points.length - 1}]`
        })
      ])
    );
  });

  it("rejects reserved bifurcation nodes before geometry compilation", () => {
    const result = validateRiverNetworkDescriptor(bifurcationNetworkFixture);

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: RiverDiagnosticCode.UnsupportedJunctionKind,
          path: "nodes[1].kind"
        })
      ])
    );
  });

  it("detects cycles, merge radius, reversed flow, and network budget overflow", () => {
    const network = {
      ...curvedMainRiverExample.riverDescriptor,
      nodes: [
        { id: "a", kind: RiverNodeKind.Source, position: [0, 0, 0] as [number, number, number], elevation: 0 },
        {
          id: "b",
          kind: RiverNodeKind.Confluence,
          position: [5, 1, 0] as [number, number, number],
          elevation: 1,
          mergeRadius: 0
        },
        { id: "c", kind: RiverNodeKind.Mouth, position: [10, 0, 0] as [number, number, number], elevation: 0 }
      ],
      segments: [
        {
          id: "ab",
          from: "a",
          to: "b",
          curve: {
            ...straightFixture.path,
            points: [
              { id: "a0", position: [0, 0, 0] as [number, number, number] },
              { id: "b0", position: [5, 1, 0] as [number, number, number] }
            ]
          }
        },
        {
          id: "bc",
          from: "b",
          to: "c",
          curve: {
            ...straightFixture.path,
            points: [
              { id: "b1", position: [5, 1, 0] as [number, number, number] },
              { id: "c0", position: [10, 0, 0] as [number, number, number] }
            ]
          }
        },
        {
          id: "ca",
          from: "c",
          to: "a",
          curve: {
            ...straightFixture.path,
            points: [
              { id: "c1", position: [10, 0, 0] as [number, number, number] },
              { id: "a1", position: [0, 0, 0] as [number, number, number] }
            ]
          }
        }
      ],
      budget: { maxSampleCount: 1 }
    };
    const codes = validateRiverNetworkDescriptor(network).diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        RiverDiagnosticCode.NetworkCycle,
        RiverDiagnosticCode.InvalidMergeRadius,
        RiverDiagnosticCode.ReversedElevation,
        RiverDiagnosticCode.NetworkBudgetExceeded
      ])
    );
  });

  it("rejects invalid V2 seeds, disturbance ids, positions, and ranges", () => {
    const source = curvedMainRiverExample.riverDescriptor;
    if (source.schemaVersion !== RiverNetworkSchemaVersion.V2) throw new Error("Expected a V2 fixture.");
    const result = validateRiverNetworkDescriptor({
      ...source,
      defaults: {
        ...source.defaults,
        surfaceMotion: { ...source.defaults.surfaceMotion, seed: 1.5 }
      },
      disturbances: [
        {
          ...source.disturbances![0],
          id: "",
          position: [Number.NaN, 0, 0],
          radius: 0
        }
      ]
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        RiverDiagnosticCode.ValueOutOfRange,
        RiverDiagnosticCode.InvalidType,
        RiverDiagnosticCode.InvalidNumber
      ])
    );
  });
});
