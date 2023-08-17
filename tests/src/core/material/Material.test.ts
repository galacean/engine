import { Material, Shader, ShaderPropertyType, Texture2D, Texture2DArray } from "@galacean/engine-core";
import { Color, Matrix, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { expect } from "chai";

describe("Material", () => {
  let engine: WebGLEngine;
  before(async function () {
    this.timeout(10000);
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  it("property", () => {
    const color = new Color(0.2, 0.1, 0.3, 1.0);
    const vector2 = new Vector2(0.1, 0.2);
    const vector3 = new Vector3(0.1, 0.2, 0.3);
    const vector4 = new Vector4(0.1, 0.2, 0.4, 1.0);
    const matrix = new Matrix(0.1, 0.2, 0.4, 1.0);
    // @ts-ignore
    const texture = new Texture2D(engine, 64, 64);
    // @ts-ignore
    const textureArray = new Texture2DArray(engine, 64, 64, 6);
    const intArray = new Int32Array([5, 6, 6, 6]);
    const floatArray = new Float32Array([0.4, 0.323, 2323.232, 23.232]);

    const material = new Material(engine, Shader.find("blinn-phong"));
    const shaderData = material.shaderData;

    shaderData.setFloat("_float", 0.2);
    shaderData.setInt("_int", 6);
    shaderData.setColor("_color", color);
    shaderData.setVector2("_vector2", vector2);
    shaderData.setVector3("_vector3", vector3);
    shaderData.setVector4("_vector4", vector4);
    shaderData.setMatrix("_matrix", matrix);
    // @ts-ignore
    shaderData.setTexture("_texture", texture);
    // @ts-ignore
    shaderData.setTextureArray("_textureArray", textureArray);
    shaderData.setIntArray("_intArray", intArray);
    shaderData.setFloatArray("_floatArray", floatArray);

    expect(shaderData.getFloat("_float")).to.equal(0.2);
    expect(shaderData.getInt("_int")).to.equal(6);
    expect(shaderData.getFloat("_color")).to.equal(color);
    expect(shaderData.getFloat("_vector2")).to.equal(vector2);
    expect(shaderData.getFloat("_vector3")).to.equal(vector3);
    expect(shaderData.getFloat("_vector4")).to.equal(vector4);
    expect(shaderData.getFloat("_matrix")).to.equal(matrix);
    expect(shaderData.getFloat("_texture")).to.equal(texture);
    expect(shaderData.getFloat("_textureArray")).to.equal(textureArray);
    expect(shaderData.getFloat("_intArray")).to.equal(intArray);
    expect(shaderData.getFloat("_floatArray")).to.equal(floatArray);

    const shaderProperties = shaderData.getProperties();
    for (let i = 0, n = shaderProperties.length; i < n; i++) {
      const shaderProperty = shaderProperties[i];
      switch (shaderProperty.type) {
        case ShaderPropertyType.Float:
          expect(shaderData.getFloat(shaderProperty)).to.equal(0.2);
          break;
        case ShaderPropertyType.Int:
          expect(shaderData.getInt(shaderProperty)).to.equal(6);
          break;
        case ShaderPropertyType.Color:
          expect(shaderData.getColor(shaderProperty)).to.equal(color);
          break;
        case ShaderPropertyType.Vector2:
          expect(shaderData.getVector2(shaderProperty)).to.equal(vector2);
          break;
        case ShaderPropertyType.Vector3:
          expect(shaderData.getVector3(shaderProperty)).to.equal(vector3);
          break;
        case ShaderPropertyType.Vector4:
          expect(shaderData.getVector4(shaderProperty)).to.equal(vector4);
          break;
        case ShaderPropertyType.Matrix:
          expect(shaderData.getMatrix(shaderProperty)).to.equal(matrix);
          break;
        case ShaderPropertyType.Texture:
          expect(shaderData.getTexture(shaderProperty)).to.equal(texture);
          break;
        case ShaderPropertyType.TextureArray:
          expect(shaderData.getTextureArray(shaderProperty)).to.equal(textureArray);
          break;
        case ShaderPropertyType.IntArray:
          expect(shaderData.getIntArray(shaderProperty)).to.equal(intArray);
          break;
        case ShaderPropertyType.FloatArray:
          expect(shaderData.getFloatArray(shaderProperty)).to.equal(floatArray);
          break;
      }
    }
  });
});
