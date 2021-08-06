// @ts-nocheck
import { Color, Vector4 } from "@oasis-engine/math";
import { WebGLEngine } from "../../../rhi-webgl/src/WebGLEngine";
import { UnlitMaterial } from "../../src/material";
import { Texture2D } from "../../src/texture";

describe("UnlitMaterial", () => {
  const canvas = document.createElement("canvas");
  const engine = new WebGLEngine(canvas);

  it("参数测试", () => {
    const material = new UnlitMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    expect(material.baseColor).toEqual(new Color(1, 1, 1, 1));
    expect(material.tilingOffset).toEqual(new Vector4(1, 1, 0, 0));
    expect(material.baseTexture).toBeUndefined();

    material.baseColor.setValue(1, 0, 0, 1);
    material.tilingOffset.setValue(1, 1, 1, 1);
    material.baseTexture = texture;

    expect(material.baseColor).toEqual(new Color(1, 0, 0, 1));
    expect(material.tilingOffset).toEqual(new Vector4(1, 1, 1, 1));
    expect(material.baseTexture).toBe(texture);

    material.baseTexture = null;
    expect(material.baseTexture).toBeNull();
  });

  it("clone", () => {
    const material = new UnlitMaterial(engine);

    material.baseColor = new Color(1, 0, 0, 1);
    material.tilingOffset = new Vector4(1, 1, 1, 1);
    material.baseTexture = new Texture2D(engine, 1024, 1024);

    const clone = material.clone();
    expect(clone.baseColor).toEqual(new Color(1, 0, 0, 1));
    expect(clone.tilingOffset).toEqual(new Vector4(1, 1, 1, 1));
    expect(clone.baseTexture).toBe(material.baseTexture);
  });
});
