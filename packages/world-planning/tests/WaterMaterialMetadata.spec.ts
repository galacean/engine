import { expect, it } from "vitest";
import {
  createWaterMaterialDefaults,
  waterMaterialProperties,
  waterMaterialShaderSource
} from "@galacean/engine-water/water/native/WaterMaterialFile";
import { OCEAN_MATERIAL_VISIBLE_PROPERTIES } from "@galacean/engine-water/water/native/OceanMaterialPropertyUI";
import { WATER_MATERIAL_TEXTURE_SLOTS } from "@galacean/engine-water/water/native/WaterMaterialTextureSlots";
import { WATER_QUERY_CONTRACTS } from "../src/spatial/runtime/WaterQueryContract";

it.each(["lake", "river", "ocean"] as const)(
  "shares %s metadata with native shader controls and detaches values",
  (kind) => {
    const file = createWaterMaterialDefaults(kind),
      properties = waterMaterialProperties(file);
    const visible = properties.filter((item) => !item.hidden);
    expect(visible.filter((item) => item.texture).map((item) => item.texture)).toEqual([
      ...WATER_MATERIAL_TEXTURE_SLOTS[kind]
    ]);
    if (kind === "ocean")
      expect(visible.map((item) => item.name).sort()).toEqual([...OCEAN_MATERIAL_VISIBLE_PROPERTIES].sort());
    const shader = waterMaterialShaderSource('Shader "Test" {\n}', file);
    for (const field of visible) expect(shader).toContain(`${field.name}("${field.label}"`);
    const vector = properties.find((item) => item.value && typeof item.value === "object" && !item.texture)!;
    (vector.value as any).x = 12345;
    expect(file.shaderData[vector.name].value).not.toEqual(vector.value);
  }
);
it("exposes only validated read operations with finite world coordinates and source identities", () => {
  expect(WATER_QUERY_CONTRACTS.map((item) => item.name)).toEqual([
    "water.capabilities",
    "water.sample",
    "water.sampleDrops",
    "water.diagnostics",
    "water.verify"
  ]);
  expect(WATER_QUERY_CONTRACTS.every((item) => item.effect === "read")).toBe(true);
  const sample = WATER_QUERY_CONTRACTS.find((item) => item.name === "water.sample")!;
  expect(sample.input.safeParse({ x: Infinity, z: 0 }).success).toBe(false);
  expect(sample.input.safeParse({ x: 0, z: 0, target: { scene: "Main.scene", id: "source-body" } }).success).toBe(true);
  expect(sample.input.safeParse({ x: 0, z: 0, id: "runtime-id" }).success).toBe(false);
});
