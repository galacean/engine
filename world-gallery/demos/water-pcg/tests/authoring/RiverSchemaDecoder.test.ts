import { describe, expect, it } from "vitest";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";
import { RiverNodeKind, RiverValidationMode } from "../../authoring/river/RiverAuthoringEnums";
import { RiverDiagnosticCode } from "../../compiler/shared/diagnostics";
import {
  decodeRiverConfig,
  decodeRiverNetworkDescriptor,
  validateRiverConfig,
  validateRiverNetworkDescriptor
} from "../../authoring/river/RiverSchemaDecoder";
import type { RiverDemoConfig as RiverConfig } from "../../demo/types";
import { invalidNetworkFixture, straightFixture } from "../fixtures/riverFixtures";

describe("RiverConfigValidator", () => {
  it.each([curvedMainRiverExample.riverDescriptor, multiTributaryRiverExample.riverDescriptor])(
    "accepts the valid example network $id",
    (network) => expect(validateRiverNetworkDescriptor(network)).toMatchObject({ valid: true, diagnostics: [] })
  );

  it("rejects malformed external JSON without runtime data", () => {
    const result = decodeRiverConfig({ id: "bad", path: { points: [{ id: "p", position: [0, Number.NaN, 0] }] } });
    expect(result.valid).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.diagnostics.every((diagnostic) => diagnostic.code && diagnostic.path && diagnostic.severity)).toBe(
      true
    );
  });

  it("rejects unsupported river network schema versions", () => {
    const result = decodeRiverNetworkDescriptor({
      ...curvedMainRiverExample.riverDescriptor,
      schemaVersion: 999
    });
    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      RiverDiagnosticCode.UnsupportedSchemaVersion
    );
  });

  it("confines coordinate repair to PreviewRepair", () => {
    const invalid: RiverConfig = {
      ...straightFixture,
      path: {
        ...straightFixture.path,
        points: [{ id: "bad", position: [Number.NaN, 0, 0] }, straightFixture.path.points[1]]
      }
    };
    const strict = validateRiverConfig(invalid);
    const preview = validateRiverConfig(invalid, { mode: RiverValidationMode.PreviewRepair });
    expect(strict.valid).toBe(false);
    expect(strict.value).toBeUndefined();
    expect(invalid.path.points[0].position[0]).toBeNaN();
    expect(preview.value?.path.points[0].position[0]).toBe(0);
    expect(preview.diagnostics[0].repair).toEqual({ originalValue: Number.NaN, repairedValue: 0 });
  });

  it("returns stable diagnostics for invalid references and duplicate ids", () => {
    const first = validateRiverNetworkDescriptor(invalidNetworkFixture);
    const second = validateRiverNetworkDescriptor(invalidNetworkFixture);
    expect(first.valid).toBe(false);
    expect(first.diagnostics).toEqual(second.diagnostics);
    expect(first.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([RiverDiagnosticCode.DuplicateId, RiverDiagnosticCode.MissingNodeReference])
    );
  });

  it("preserves topology endpoints when PreviewRepair reduces control points", () => {
    const points = Array.from({ length: 40 }, (_, index) => ({
      id: `p-${index}`,
      position: [index, 0, 0] as [number, number, number]
    }));
    const config: RiverConfig = { ...straightFixture, path: { ...straightFixture.path, points } };
    const result = validateRiverConfig(config, { mode: RiverValidationMode.PreviewRepair });
    expect(result.value?.path.points).toHaveLength(32);
    expect(result.value?.path.points[0].id).toBe("p-0");
    expect(result.value?.path.points.at(-1)?.id).toBe("p-39");
    expect(
      result.diagnostics.find((diagnostic) => diagnostic.code === RiverDiagnosticCode.ControlPointLimitExceeded)?.repair
    ).toBeDefined();
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
});
