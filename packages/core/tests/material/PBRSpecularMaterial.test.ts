// @ts-nocheck
import { Color } from "@oasis-engine/math";
import { WebGLEngine } from "../../../rhi-webgl/src/WebGLEngine";
import { PBRSpecularMaterial } from "../../src/material";
import { Texture2D } from "../../src/texture";

describe("PBRSpecularMaterial", () => {
  const canvas = document.createElement("canvas");
  const engine = new WebGLEngine(canvas);

  it("pbr specular 参数测试", () => {
    const material = new PBRSpecularMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    expect(material.specularColor).toEqual(new Color(1, 1, 1, 1));
    expect(material.glossiness).toBe(1);
    expect(material.specularGlossinessTexture).toBeUndefined();

    material.specularColor.setValue(1, 0, 0, 1);
    material.glossiness = 2;
    material.specularGlossinessTexture = texture;

    expect(material.specularColor).toEqual(new Color(1, 0, 0, 1));
    expect(material.glossiness).toBe(2);
    expect(material.specularGlossinessTexture).toBe(texture);

    material.specularGlossinessTexture = null;

    expect(material.specularGlossinessTexture).toBeNull();
  });

  it("clone", () => {
    const material = new PBRSpecularMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    material.specularColor = new Color(1, 0, 0, 1);
    material.glossiness = 2;
    material.specularGlossinessTexture = texture;

    const clone = material.clone();

    expect(clone.specularColor).toEqual(new Color(1, 0, 0, 1));
    expect(clone.glossiness).toBe(2);
    expect(clone.specularGlossinessTexture).toBe(material.specularGlossinessTexture);
  });
});
