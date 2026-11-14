import { expect, it } from "vitest";
import {
  createWaterMaterialDefaults,
  resolveWaterMaterialFileLook,
  WATER_MATERIAL_TEXTURE_SLOTS
} from "@galacean/engine-water/water/native/WaterMaterialFile";

it("rejects River Drops at the public native material boundary while keeping ordinary River slots", () => {
  expect(WATER_MATERIAL_TEXTURE_SLOTS.river).toHaveLength(3);
  const file = createWaterMaterialDefaults("river");
  expect(
    Object.keys(file.shaderData).some((name) => name.includes("riverDrops") || name === "material_WaterRiverDrops")
  ).toBe(false);
  expect(() => createWaterMaterialDefaults("river", true)).toThrow("NOT_SUPPORTED");
  file.shaderData.material_WaterRiverDrops = { type: "Boolean", value: true };
  expect(() => resolveWaterMaterialFileLook(file)).toThrow("NOT_SUPPORTED");
});
