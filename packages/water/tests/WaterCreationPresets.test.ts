import { expect, it } from "vitest";
import { createWaterCreationPreset } from "../src/water/native/WaterCreationPresets";
import { compileWaterShape } from "../src/water/native/WaterAuthoring";
import { resolveWaterMaterialProfile, validateWaterMaterialCapabilities } from "../src/water/native/WaterAuthoring";

it.each(["lake", "river", "ocean"] as const)("creates a complete %s against its accepted bed", (kind) => {
  const preset = createWaterCreationPreset(kind);
  expect(() => compileWaterShape(preset.shape, preset.terrain, kind)).not.toThrow();
  const next = createWaterCreationPreset(kind);
  expect(next.terrain.heights).not.toBe(preset.terrain.heights);
});

it("validates native Material profile declarations and shape compatibility", () => {
  const material = {
    shaderData: {
      material_WaterProfile: { type: "Integer", value: 0 },
      material_WaterRiverDrops: { type: "Boolean", value: false }
    }
  };
  expect(() => validateWaterMaterialCapabilities("lake", material)).not.toThrow();
  expect(() => validateWaterMaterialCapabilities("river", material)).toThrow("received lake");
  expect(() => resolveWaterMaterialProfile(2, 1)).toThrow("NOT_SUPPORTED");
  expect(() => resolveWaterMaterialProfile(NaN, 0)).toThrow("profile");
  expect(() => validateWaterMaterialCapabilities("lake", {})).toThrow("declaration");
});
