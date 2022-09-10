import { BlendShape, IndexFormat, ModelMesh } from "@oasis-engine/core";
import { Color, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { WebGLEngine } from "@oasis-engine/rhi-webgl";
import { expect } from "chai";

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
  const deltaPositions = [new Vector3(1, 1, 1), new Vector3(2, 2, 2), new Vector3(3, 3, 3)];
  const deltaNormals = [new Vector3(1, 1, 1), new Vector3(2, 2, 2), new Vector3(3, 3, 3)];
  const deltaTangents = [new Vector3(1, 1, 1), new Vector3(2, 2, 2), new Vector3(3, 3, 3)];

  const falsyColors = [new Color()];
  const falsyNormals = [new Vector3()];
  const falsyUV = [new Vector2()];
  const falsyTangents = [new Vector4()];
  const falsyWeights = [new Vector4()];
  const falsyJoints = [new Vector4()];
  it("init", () => {
    expect(modelMesh.accessible).true;
  });

  it("set position data", () => {
    modelMesh.setPositions(positionsX);
    expect(modelMesh.vertexCount).eq(4);
    modelMesh.setPositions(positions);
    expect(modelMesh.vertexCount).eq(3);
  });

  it("set indices data", () => {
    modelMesh.setIndices(indices);
    // @ts-ignore
    expect(modelMesh._indicesFormat).to.equal(IndexFormat.UInt8);
    modelMesh.setIndices(indices16);
    // @ts-ignore
    expect(modelMesh._indicesFormat).to.equal(IndexFormat.UInt16);
    modelMesh.setIndices(indices32);
    // @ts-ignore
    expect(modelMesh._indicesFormat).to.equal(IndexFormat.UInt32);
  });

  it("set blendShape data", () => {
    const blendShape = new BlendShape("BlendShape");
    blendShape.addFrame(1.0, deltaPositions, deltaNormals, deltaTangents);
    modelMesh.addBlendShape(blendShape);

    const frame0 = modelMesh.blendShapes[0].frames[0];
    expect(frame0.weight).eq(1.0);
    expect(frame0.deltaPositions.length).eq(3);
    expect(frame0.deltaNormals.length).eq(3);
    expect(frame0.deltaTangents.length).eq(3);
  });

  it("set data correct", () => {
    modelMesh.setIndices(indices);
    modelMesh.setColors(colors);
    modelMesh.setNormals(normals);
    modelMesh.setTangents(tangents);
    modelMesh.setBoneWeights(weights);
    modelMesh.setBoneIndices(joints);
    modelMesh.setUVs(uvs);
    modelMesh.setUVs(uvs, 1);
    modelMesh.setUVs(uvs, 2);
    modelMesh.setUVs(uvs, 3);
    modelMesh.setUVs(uvs, 4);
    modelMesh.setUVs(uvs, 5);
    modelMesh.setUVs(uvs, 6);
    modelMesh.setUVs(uvs, 7);

    expect(modelMesh.getIndices()).eq(indices);
    expect(modelMesh.getColors()).eq(colors);
    expect(modelMesh.getNormals()).eq(normals);
    expect(modelMesh.getTangents()).eq(tangents);
    expect(modelMesh.getBoneWeights()).eq(weights);
    expect(modelMesh.getBoneIndices()).eq(joints);
    expect(modelMesh.getUVs()).eq(uvs);
    expect(modelMesh.getUVs(1)).eq(uvs);
    expect(modelMesh.getUVs(2)).eq(uvs);
    expect(modelMesh.getUVs(3)).eq(uvs);
    expect(modelMesh.getUVs(4)).eq(uvs);
    expect(modelMesh.getUVs(5)).eq(uvs);
    expect(modelMesh.getUVs(6)).eq(uvs);
    expect(modelMesh.getUVs(7)).eq(uvs);

    const frame0 = modelMesh.blendShapes[0].frames[0];
    expect(frame0.deltaPositions).eq(deltaPositions);
    expect(frame0.deltaNormals).eq(deltaNormals);
    expect(frame0.deltaTangents).eq(deltaTangents);
  });

  it("set data not same size", () => {
    expect(() => {
      modelMesh.setColors(falsyColors);
    }).throw("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setNormals(falsyNormals);
    }).throw("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setTangents(falsyTangents);
    }).throw("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setBoneWeights(falsyWeights);
    }).throw("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setBoneIndices(falsyJoints);
    }).throw("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setUVs(falsyUV);
    }).throw("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setUVs(falsyUV);
    }).throw("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setUVs(falsyUV);
    }).throw("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setUVs(falsyUV);
    }).throw("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setUVs(falsyUV);
    }).throw("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setUVs(falsyUV);
    }).throw("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setUVs(falsyUV);
    }).throw("The array provided needs to be the same size as vertex count.");
    expect(() => {
      modelMesh.setUVs(falsyUV);
    }).throw("The array provided needs to be the same size as vertex count.");
  });

  it("upload data with no longer used", () => {
    modelMesh.uploadData(false);

    expect(modelMesh.getIndices()).eq(indices);
    expect(modelMesh.getColors()).eq(colors);
    expect(modelMesh.getNormals()).eq(normals);
    expect(modelMesh.getTangents()).eq(tangents);
    expect(modelMesh.getBoneWeights()).eq(weights);
    expect(modelMesh.getBoneIndices()).eq(joints);
    expect(modelMesh.getUVs()).eq(uvs);
    expect(modelMesh.getUVs(1)).eq(uvs);
    expect(modelMesh.getUVs(2)).eq(uvs);
    expect(modelMesh.getUVs(3)).eq(uvs);
    expect(modelMesh.getUVs(4)).eq(uvs);
    expect(modelMesh.getUVs(5)).eq(uvs);
    expect(modelMesh.getUVs(6)).eq(uvs);
    expect(modelMesh.getUVs(7)).eq(uvs);

    const frame0 = modelMesh.blendShapes[0].frames[0];
    expect(frame0.deltaPositions).eq(deltaPositions);
    expect(frame0.deltaNormals).eq(deltaNormals);
    expect(frame0.deltaTangents).eq(deltaTangents);

    modelMesh.setPositions(positionsX);
    modelMesh.clearBlendShapes();
    expect(modelMesh.blendShapes.length).eq(0);

    expect(modelMesh.vertexCount).eq(4);
    // @ts-ignore
    const vertices = modelMesh._verticesFloat32;
    modelMesh.uploadData(false);
    // @ts-ignore
    expect(vertices).not.equal(modelMesh._verticesFloat32);
    modelMesh.setIndices(null);
    //@ts-ignore
    expect(modelMesh._indices).null;
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
    }).throw("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.setPositions(positions);
    }).throw("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.setColors(colors);
    }).throw("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.setNormals(normals);
    }).throw("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.setTangents(tangents);
    }).throw("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.setBoneWeights(weights);
    }).throw("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.setBoneIndices(joints);
    }).throw("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.setUVs(uvs);
    }).throw("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.setUVs(uvs);
    }).throw("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.getPositions();
    }).throw("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.getColors();
    }).throw("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.getNormals();
    }).throw("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.getTangents();
    }).throw("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.getBoneWeights();
    }).throw("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.getBoneIndices();
    }).throw("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.getUVs();
    }).throw("Not allowed to access data while accessible is false.");
    expect(() => {
      modelMesh.blendShapes;
    }).throw("Not allowed to access data while accessible is false.");
  });
});
