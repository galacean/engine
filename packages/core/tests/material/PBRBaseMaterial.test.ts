// @ts-nocheck
import { Color, Vector4 } from "@oasis-engine/math";
import { WebGLEngine } from "../../../rhi-webgl/src/WebGLEngine";
import { PBRMaterial } from "../../src/material";
import { Texture2D } from "../../src/texture";

describe("PBRBaseMaterial", () => {
  const canvas = document.createElement("canvas");
  const engine = new WebGLEngine(canvas);

  it("pbr base 参数测试", () => {
    const material = new PBRMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    expect(material.baseColor).toEqual(new Color(1, 1, 1, 1));
    expect(material.emissiveColor).toEqual(new Color(0, 0, 0, 1));
    expect(material.tilingOffset).toEqual(new Vector4(1, 1, 0, 0));
    expect(material.normalTextureIntensity).toBe(1);
    expect(material.occlusionTextureIntensity).toBe(1);

    expect(material.baseTexture).toBeUndefined();
    expect(material.emissiveTexture).toBeUndefined();
    expect(material.normalTexture).toBeUndefined();
    expect(material.occlusionTexture).toBeUndefined();

    material.baseColor.setValue(1, 0, 0, 1);
    material.emissiveColor.setValue(1, 0, 0, 1);
    material.tilingOffset.setValue(1, 1, 1, 1);
    material.normalTextureIntensity = 2;
    material.occlusionTextureIntensity = 2;
    material.baseTexture = texture;
    material.emissiveTexture = texture;
    material.normalTexture = texture;
    material.occlusionTexture = texture;

    expect(material.baseColor).toEqual(new Color(1, 0, 0, 1));
    expect(material.emissiveColor).toEqual(new Color(1, 0, 0, 1));
    expect(material.tilingOffset).toEqual(new Vector4(1, 1, 1, 1));
    expect(material.normalTextureIntensity).toBe(2);
    expect(material.occlusionTextureIntensity).toBe(2);
    expect(material.baseTexture).toBe(texture);
    expect(material.emissiveTexture).toBe(texture);
    expect(material.normalTexture).toBe(texture);
    expect(material.occlusionTexture).toBe(texture);

    material.baseTexture = null;
    material.emissiveTexture = null;
    material.normalTexture = null;
    material.occlusionTexture = null;

    expect(material.baseTexture).toBeNull();
    expect(material.emissiveTexture).toBeNull();
    expect(material.normalTexture).toBeNull();
    expect(material.occlusionTexture).toBeNull();
  });

  it("clone", () => {
    const material = new PBRMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    material.baseColor = new Color(1, 0, 0, 1);
    material.emissiveColor = new Color(1, 0, 0, 1);
    material.tilingOffset = new Vector4(1, 1, 1, 1);
    material.normalTextureIntensity = 2;
    material.occlusionTextureIntensity = 2;
    material.baseTexture = texture;
    material.emissiveTexture = texture;
    material.normalTexture = texture;
    material.occlusionTexture = texture;

    const clone = material.clone();

    expect(clone.baseColor).toEqual(new Color(1, 0, 0, 1));
    expect(clone.emissiveColor).toEqual(new Color(1, 0, 0, 1));
    expect(clone.tilingOffset).toEqual(new Vector4(1, 1, 1, 1));
    expect(clone.normalTextureIntensity).toBe(2);
    expect(clone.occlusionTextureIntensity).toBe(2);
    expect(clone.baseTexture).toBe(material.baseTexture);
    expect(clone.emissiveTexture).toBe(material.emissiveTexture);
    expect(clone.normalTexture).toBe(material.normalTexture);
    expect(clone.occlusionTexture).toBe(material.occlusionTexture);
  });
});
