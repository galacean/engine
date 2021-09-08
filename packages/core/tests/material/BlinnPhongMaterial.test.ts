// @ts-nocheck
import { Color, Vector4 } from "@oasis-engine/math";
import { WebGLEngine } from "../../../rhi-webgl/src/WebGLEngine";
import { BlinnPhongMaterial } from "../../src/material";
import { Texture2D } from "../../src/texture";

describe("BlinnPhongMaterial", () => {
  const canvas = document.createElement("canvas");
  const engine = new WebGLEngine(canvas);

  it("参数测试", () => {
    const material = new BlinnPhongMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    expect(material.baseColor).toEqual(new Color(1, 1, 1, 1));
    expect(material.specularColor).toEqual(new Color(1, 1, 1, 1));
    expect(material.emissiveColor).toEqual(new Color(0, 0, 0, 1));
    expect(material.baseTexture).toBeUndefined();
    expect(material.specularTexture).toBeUndefined();
    expect(material.emissiveTexture).toBeUndefined();
    expect(material.normalTexture).toBeUndefined();
    expect(material.normalIntensity).toBe(1);
    expect(material.shininess).toBe(16);
    expect(material.tilingOffset).toEqual(new Vector4(1, 1, 0, 0));

    material.baseColor.setValue(1, 0, 0, 1);
    material.specularColor.setValue(1, 0, 0, 1);
    material.emissiveColor.setValue(1, 0, 0, 1);
    material.baseTexture = texture;
    material.specularTexture = texture;
    material.emissiveTexture = texture;
    material.normalTexture = texture;
    material.normalIntensity = 2;
    material.shininess = 32;
    material.tilingOffset.setValue(1, 1, 1, 1);

    expect(material.baseColor).toEqual(new Color(1, 0, 0, 1));
    expect(material.specularColor).toEqual(new Color(1, 0, 0, 1));
    expect(material.emissiveColor).toEqual(new Color(1, 0, 0, 1));
    expect(material.baseTexture).toBe(texture);
    expect(material.specularTexture).toBe(texture);
    expect(material.emissiveTexture).toBe(texture);
    expect(material.normalTexture).toBe(texture);
    expect(material.normalIntensity).toBe(2);
    expect(material.shininess).toBe(32);
    expect(material.tilingOffset).toEqual(new Vector4(1, 1, 1, 1));

    material.baseTexture = null;
    material.specularTexture = null;
    material.emissiveTexture = null;
    material.normalTexture = null;

    expect(material.baseTexture).toBeNull();
    expect(material.specularTexture).toBeNull();
    expect(material.emissiveTexture).toBeNull();
    expect(material.normalTexture).toBeNull();
  });

  it("clone", () => {
    const material = new BlinnPhongMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    material.baseColor = new Color(1, 0, 0, 1);
    material.specularColor = new Color(1, 0, 0, 1);
    material.emissiveColor = new Color(1, 0, 0, 1);
    material.baseTexture = texture;
    material.specularTexture = texture;
    material.emissiveTexture = texture;
    material.normalTexture = texture;
    material.normalIntensity = 2;
    material.shininess = 32;
    material.tilingOffset = new Vector4(1, 1, 1, 1);

    const clone = material.clone();

    expect(clone.baseColor).toEqual(new Color(1, 0, 0, 1));
    expect(clone.specularColor).toEqual(new Color(1, 0, 0, 1));
    expect(clone.emissiveColor).toEqual(new Color(1, 0, 0, 1));
    expect(clone.baseTexture).toBe(material.baseTexture);
    expect(clone.specularTexture).toBe(material.specularTexture);
    expect(clone.emissiveTexture).toBe(material.emissiveTexture);
    expect(clone.normalTexture).toBe(material.normalTexture);
    expect(clone.normalIntensity).toBe(2);
    expect(clone.shininess).toBe(32);
    expect(clone.tilingOffset).toEqual(new Vector4(1, 1, 1, 1));
  });
});
