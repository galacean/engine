import { PBRMaterial } from "@galacean/engine-core";
import { GLTFExtensionMode, GLTFParser, GLTFParserContext, GLTFResource } from "@galacean/engine-loader";
import { Color } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import {
  BufferDataRestoreInfo,
  GLTFContentRestorer,
  RestoreDataAccessor
} from "../../../packages/loader/src/GLTFContentRestorer";

describe("glTF nullable data", () => {
  it("restores zero-filled accessors without a backing buffer", () => {
    const restorer = new GLTFContentRestorer({} as GLTFResource);
    const info = new BufferDataRestoreInfo(new RestoreDataAccessor(undefined, Float32Array, undefined, 6));

    expect(Array.from(restorer["_getBufferData"]([], info))).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("applies sparse values to a zero-filled accessor and accepts buffer index zero", () => {
    const restorer = new GLTFContentRestorer({} as GLTFResource);
    const indices = new Uint16Array([1]);
    const values = new Float32Array([2, 3, 4]);
    const info = new BufferDataRestoreInfo(
      new RestoreDataAccessor(undefined, Float32Array, undefined, 6),
      3,
      1,
      new RestoreDataAccessor(0, Uint16Array, 0, 1),
      new RestoreDataAccessor(1, Float32Array, 0, 3)
    );

    expect(Array.from(restorer["_getBufferData"]([indices.buffer, values.buffer], info))).toEqual([0, 0, 0, 2, 3, 4]);

    const backed = new BufferDataRestoreInfo(new RestoreDataAccessor(0, Float32Array, 0, 3));
    expect(Array.from(restorer["_getBufferData"]([values.buffer], backed))).toEqual([2, 3, 4]);
  });

  it.each([
    ["KHR_materials_sheen", "sheenColor", "sheenColorFactor"],
    ["KHR_materials_specular", "specularColor", "specularColorFactor"],
    ["KHR_materials_volume", "attenuationColor", "attenuationColor"]
  ])("preserves the alpha channel when parsing %s RGB data", (extension, property, factor) => {
    const color = new Color(1, 1, 1, 0.75);
    const material = { [property]: color } as unknown as PBRMaterial;
    const parser = GLTFParser.getExtensionParser(extension, GLTFExtensionMode.AdditiveParse)!;

    parser.additiveParse({} as GLTFParserContext, material, { [factor]: [0.2, 0.3, 0.4] }, {});

    expect(color).toMatchObject({ r: 0.2, g: 0.3, b: 0.4, a: 0.75 });
  });
});
