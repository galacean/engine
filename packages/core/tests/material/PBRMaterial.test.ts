// @ts-nocheck
import { WebGLEngine } from "../../../rhi-webgl/src/WebGLEngine";
import { PBRMaterial } from "../../src/material";
import { Texture2D } from "../../src/texture";

describe("PBRMaterial", () => {
  const canvas = document.createElement("canvas");
  const engine = new WebGLEngine(canvas);

  it("pbr 参数测试", () => {
    const material = new PBRMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    expect(material.metallic).toBe(1);
    expect(material.roughness).toBe(1);
    expect(material.roughnessMetallicTexture).toBeUndefined();

    material.metallic = 2;
    material.roughness = 2;
    material.roughnessMetallicTexture = texture;

    expect(material.metallic).toBe(2);
    expect(material.roughness).toBe(2);
    expect(material.roughnessMetallicTexture).toBe(texture);

    material.roughnessMetallicTexture = null;

    expect(material.roughnessMetallicTexture).toBeNull();
  });

  it("clone", () => {
    const material = new PBRMaterial(engine);
    const texture = new Texture2D(engine, 1024, 1024);

    material.metallic = 2;
    material.roughness = 2;
    material.roughnessMetallicTexture = texture;

    const clone = material.clone();

    expect(clone.metallic).toBe(2);
    expect(clone.roughness).toBe(2);
    expect(clone.roughnessMetallicTexture).toBe(material.roughnessMetallicTexture);
  });
});
