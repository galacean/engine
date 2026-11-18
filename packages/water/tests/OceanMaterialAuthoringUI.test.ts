import { expect, it } from "vitest";
import { createWaterMaterialDefaults, resolveWaterMaterialFileLook } from "../src/water/native/WaterMaterialFile";
import {
  OCEAN_MATERIAL_PROPERTY_RANGES,
  OCEAN_MATERIAL_VISIBLE_PROPERTIES
} from "../src/water/native/OceanMaterialPropertyUI";
import { createWaterQualityPlanV2 } from "../src/water/authoring/quality/WaterQualityPlan";
import { WaterRenderContractCompiler } from "../src/water/compiler/surface/WaterRenderContractCompiler";
import {
  assertSupportedOceanRenderContract,
  createOceanTuningFromRenderContract
} from "../src/water/runtime/ocean/OceanRenderContract";
function validate(property: string, value: unknown) {
  const file = createWaterMaterialDefaults("ocean");
  file.shaderData[property].value = value;
  const snapshot = resolveWaterMaterialFileLook(file);
  const result = WaterRenderContractCompiler.compile({
    sourceId: snapshot.look.id,
    look: snapshot.look,
    appearance: snapshot.appearance.appearance,
    fieldDependencies: snapshot.appearance.fieldDependencies!,
    optics: snapshot.optics,
    reflectionIntent: snapshot.reflectionPolicy,
    renderState: snapshot.renderState,
    resources: [],
    qualityPlan: createWaterQualityPlanV2({
      id: "ocean-inspector-test",
      geometry: "high",
      surfaceShading: "high",
      sceneFields: "scene-color-depth",
      reflectionBudget: { environment: true, screenSpace: false },
      surfaceEffectBudget: { caustics: true },
      query: "off",
      spatialField: {
        maximumHorizontalError: 1,
        maximumDepthError: 0,
        maximumGpuDepthDecodeError: 1,
        maximumGpuShoreDecodeError: 1,
        maximumAtlasPixels: 1048576
      }
    })
  });
  if (!result.data) throw new Error(JSON.stringify(result.diagnostics));
  assertSupportedOceanRenderContract(result.data);
  createOceanTuningFromRenderContract(result.data);
}
it.each(OCEAN_MATERIAL_VISIBLE_PROPERTIES)(
  "accepts inspector edits through the real Ocean backend contract: %s",
  (property) => {
    const entry = createWaterMaterialDefaults("ocean").shaderData[property];
    let values: unknown[];
    if (entry.type === "Boolean") values = [false, true];
    else if (entry.type === "Float") {
      const range = OCEAN_MATERIAL_PROPERTY_RANGES[property];
      expect(range).toBeDefined();
      values = [range[0], range[1]];
    } else if (entry.type === "Vector4") values = [{ x: 0.2, y: 0.4, z: 0.6, w: 0.5 }];
    else if (entry.type === "Color") values = [{ r: 0.2, g: 0.4, b: 0.6, a: 1 }];
    else values = [null, { refId: "replacement-texture" }];
    for (const value of values) expect(() => validate(property, value)).not.toThrow();
  }
);
it.each([
  ["material_Water_reflectionPolicy_policy_preferred", 1],
  ["material_Water_renderState_queue", 0],
  ["material_Water_optics_profile_absorptionCoefficient", { x: 0.2, y: 0, z: 0 }]
] as const)("hides a decodable setting that the Ocean backend rejects: %s", (property, value) => {
  expect(() => validate(property, value)).toThrow();
  expect(OCEAN_MATERIAL_VISIBLE_PROPERTIES).not.toContain(property);
});
