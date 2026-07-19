import { describe, expect, it } from "vitest";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import {
  RiverMaterialPreset,
  RiverNetworkSchemaVersion,
  RiverValidationMode
} from "../../authoring/river/RiverAuthoringEnums";
import { RIVER_MATERIAL_PRESET_CONFIG } from "../../authoring/river/RiverAuthoringLimits";
import { RiverDiagnosticCode } from "../../compiler/shared/diagnostics";
import {
  decodeRiverConfig,
  decodeRiverNetworkDescriptor,
  validateRiverConfig
} from "../../authoring/river/RiverSchemaDecoder";
import type { RiverDemoConfig as RiverConfig } from "../../demo/types";
import { straightFixture } from "../fixtures/riverFixtures";

describe("RiverConfigValidator", () => {
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

  it("decodes V2 motion and obstacle facts and rejects missing or non-finite values", () => {
    const source = curvedMainRiverExample.riverDescriptor;
    if (source.schemaVersion !== RiverNetworkSchemaVersion.V2) throw new Error("Expected a V2 fixture.");
    const valid = decodeRiverNetworkDescriptor(source);
    expect(valid.valid).toBe(true);
    expect(valid.value).toEqual(source);

    const defaultsWithoutMotion: Record<string, unknown> = { ...source.defaults };
    delete defaultsWithoutMotion.surfaceMotion;
    const missingMotion = decodeRiverNetworkDescriptor({ ...source, defaults: defaultsWithoutMotion });
    expect(missingMotion.valid).toBe(false);
    expect(missingMotion.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "$.defaults.surfaceMotion" })])
    );

    const invalidObstacle = decodeRiverNetworkDescriptor({
      ...source,
      disturbances: source.disturbances?.map((disturbance, index) =>
        index === 0 ? { ...disturbance, position: [Number.NaN, 0, 0] } : disturbance
      )
    });
    expect(invalidObstacle.valid).toBe(false);
    expect(invalidObstacle.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "$.disturbances[0].position[0]" })])
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

  it("repairs invalid colors from the selected material preset", () => {
    const config: RiverConfig = {
      ...straightFixture,
      material: {
        ...straightFixture.material,
        preset: RiverMaterialPreset.MuddyRiver,
        baseColor: "invalid",
        foamColor: "also-invalid"
      }
    };
    const result = validateRiverConfig(config, { mode: RiverValidationMode.PreviewRepair });

    expect(result.value?.material.baseColor).toBe(
      RIVER_MATERIAL_PRESET_CONFIG[RiverMaterialPreset.MuddyRiver].baseColor
    );
    expect(result.value?.material.foamColor).toBe(
      RIVER_MATERIAL_PRESET_CONFIG[RiverMaterialPreset.MuddyRiver].foamColor
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
});
