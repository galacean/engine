import { Vector2, Vector3, Vector4, Color } from "@oasis-engine/math";
import { WebGLEngine } from "../../rhi-webgl/src";
import { IndexFormat } from "../src";
import { ModelMesh } from "../src/mesh/ModelMesh";

describe("ModelMesh Test", function () {
  const engine = new WebGLEngine(document.createElement("canvas"));
  // @ts-ignore
  const modelMesh = new ModelMesh(engine);
  const positions = [new Vector3(0, 0, 0), new Vector3(0, 1, 0), new Vector3(1, 1, 0)];
  const positionsX = [new Vector3(0, 0, 0), new Vector3(0, 1, 0), new Vector3(1, 1, 0), new Vector3()];
  const colors = [new Color(), new Color(), new Color()];
  const normals = [new Vector3(), new Vector3(), new Vector3()];
  const uvs = [new Vector2(), new Vector2(), new Vector2()];
  const tangents = [new Vector4(), new Vector4(), new Vector4()];
  const weights = [new Vector4(), new Vector4(), new Vector4()];
  const joints = [new Vector4(), new Vector4(), new Vector4()];
  const indices = new Uint8Array([0, 1, 2]);
  const indices16 = new Uint16Array([0, 1, 2]);
  const indices32 = new Uint32Array([0, 1, 2]);

  const falsyColors = [new Color()];
  const falsyNormals = [new Vector3()];
  const falsyUV = [new Vector2()];
  const falsyTangents = [new Vector4()];
  const falsyWeights = [new Vector4()];
  const falsyJoints = [new Vector4()];
  it("init", () => {
    expect(modelMesh.accessible).toBeTruthy();
  });

  it("set position data", () => {
    modelMesh.setPositions(positionsX);
    expect(modelMesh.vertexCount).toBe(4);
    modelMesh.setPositions(positions);
    expect(modelMesh.vertexCount).toBe(3);
  });

  it("set indices data", () => {
    modelMesh.setIndices(indices);
    // @ts-ignore
    expect(modelMesh._indicesFormat).toBe(IndexFormat.UInt8);
    modelMesh.setIndices(indices16);
    // @ts-ignore
    expect(modelMesh._indicesFormat).toBe(IndexFormat.UInt16);
    modelMesh.setIndices(indices32);
    // @ts-ignore
    expect(modelMesh._indicesFormat).toBe(IndexFormat.UInt32);
  });

  it("set data correct", () => {
    modelMesh.setIndices(indices);
    modelMesh.setColors(colors);
    modelMesh.setNormals(normals);
    modelMesh.setTangents(tangents);
    modelMesh.setWeights(weights);
    modelMesh.setJoints(joints);
    modelMesh.setUVs(uvs);
    modelMesh.setUVs(uvs, 1);
    modelMesh.setUVs(uvs, 2);
    modelMesh.setUVs(uvs, 3);
    modelMesh.setUVs(uvs, 4);
    modelMesh.setUVs(uvs, 5);
    modelMesh.setUVs(uvs, 6);
    modelMesh.setUVs(uvs, 7);

    expect(modelMesh.getIndices()).toBe(indices);
    expect(modelMesh.getColors()).toBe(colors);
    expect(modelMesh.getNormals()).toBe(normals);
    expect(modelMesh.getTangents()).toBe(tangents);
    expect(modelMesh.getWeights()).toBe(weights);
    expect(modelMesh.getJoints()).toBe(joints);
    expect(modelMesh.getUVs()).toBe(uvs);
    expect(modelMesh.getUVs(1)).toBe(uvs);
    expect(modelMesh.getUVs(2)).toBe(uvs);
    expect(modelMesh.getUVs(3)).toBe(uvs);
    expect(modelMesh.getUVs(4)).toBe(uvs);
    expect(modelMesh.getUVs(5)).toBe(uvs);
    expect(modelMesh.getUVs(6)).toBe(uvs);
    expect(modelMesh.getUVs(7)).toBe(uvs);

    expect(modelMesh.vertexElements.length).toBe(0);
  });

  it("set data not same size", () => {
    expect(() => {
      modelMesh.setColors(falsyColors);
    }).toThrow("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setNormals(falsyNormals);
    }).toThrow("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setTangents(falsyTangents);
    }).toThrow("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setWeights(falsyWeights);
    }).toThrow("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setJoints(falsyJoints);
    }).toThrow("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setUVs(falsyUV);
    }).toThrow("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setUVs(falsyUV);
    }).toThrow("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setUVs(falsyUV);
    }).toThrow("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setUVs(falsyUV);
    }).toThrow("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setUVs(falsyUV);
    }).toThrow("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setUVs(falsyUV);
    }).toThrow("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setUVs(falsyUV);
    }).toThrow("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setUVs(falsyUV);
    }).toThrow("The array provided needs to be the same size as vertex count.");
  });

  it("upload data with no longer used", () => {
    modelMesh.uploadData(false);

    expect(modelMesh.getIndices()).toBe(indices);
    expect(modelMesh.getColors()).toBe(colors);
    expect(modelMesh.getNormals()).toBe(normals);
    expect(modelMesh.getTangents()).toBe(tangents);
    expect(modelMesh.getWeights()).toBe(weights);
    expect(modelMesh.getJoints()).toBe(joints);
    expect(modelMesh.getUVs()).toBe(uvs);
    expect(modelMesh.getUVs(1)).toBe(uvs);
    expect(modelMesh.getUVs(2)).toBe(uvs);
    expect(modelMesh.getUVs(3)).toBe(uvs);
    expect(modelMesh.getUVs(4)).toBe(uvs);
    expect(modelMesh.getUVs(5)).toBe(uvs);
    expect(modelMesh.getUVs(6)).toBe(uvs);
    expect(modelMesh.getUVs(7)).toBe(uvs);

    modelMesh.setPositions(positionsX);
    expect(modelMesh.vertexCount).toBe(4);
    // @ts-ignore
    expect(modelMesh._vertexCountChanged).toBe(true);
    // @ts-ignore
    const vertices = modelMesh._verticesFloat32;
    modelMesh.uploadData(false);
    // @ts-ignore
    expect(vertices).not.toBe(modelMesh._verticesFloat32);
    modelMesh.setIndices(null);
    //@ts-ignore
    expect(modelMesh._indices).toBeNull();
    modelMesh.uploadData(false);
    const moreIndices = new Uint8Array([1, 2, 3]);
    modelMesh.setIndices(moreIndices);
    modelMesh.uploadData(false);

    modelMesh.setIndices(null);
    modelMesh.setPositions(positions);
  });
  it("upload data with no longer used", () => {
    modelMesh.uploadData(true);
    expect(() => {
      modelMesh.setIndices(indices);
    }).toThrow("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.setPositions(positions);
    }).toThrow("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.setColors(colors);
    }).toThrow("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.setNormals(normals);
    }).toThrow("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.setTangents(tangents);
    }).toThrow("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.setWeights(weights);
    }).toThrow("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.setJoints(joints);
    }).toThrow("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.setUVs(uvs);
    }).toThrow("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.setUVs(uvs);
    }).toThrow("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.getPositions();
    }).toThrow("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.getColors();
    }).toThrow("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.getNormals();
    }).toThrow("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.getTangents();
    }).toThrow("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.getWeights();
    }).toThrow("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.getJoints();
    }).toThrow("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.getUVs();
    }).toThrow("Not allowed to access data while accessible is false.");
  });
});
