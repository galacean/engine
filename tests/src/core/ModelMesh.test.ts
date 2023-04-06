import { BlendShape, Engine, IndexFormat, ModelMesh } from "@galacean/engine-core";
import { Color, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { expect } from "chai";

describe("ModelMesh Test", async function () {
  let engine: Engine;
  let modelMesh: ModelMesh;
  let positions: Vector3[];
  let positionsX: Vector3[];
  let colors: Color[];
  let normals: Vector3[];
  let uvs: Vector2[];
  let tangents: Vector4[];
  let weights: Vector4[];
  let joints: Vector4[];
  let indices: Uint8Array;
  let indices16: Uint16Array;
  let indices32: Uint32Array;
  let deltaPositions: Vector3[];
  let deltaNormals: Vector3[];
  let deltaTangents: Vector3[];

  let falsyColors: Color[];
  let falsyNormals: Vector3[];
  let falsyUV: Vector2[];
  let falsyTangents: Vector4[];
  let falsyWeights: Vector4[];
  let falsyJoints: Vector4[];
  before(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    modelMesh = new ModelMesh(engine);
    positions = [new Vector3(0, 0, 0), new Vector3(0, 1, 0), new Vector3(1, 1, 0)];
    positionsX = [new Vector3(0, 0, 0), new Vector3(0, 1, 0), new Vector3(1, 1, 0), new Vector3()];
    colors = [new Color(), new Color(), new Color()];
    normals = [new Vector3(), new Vector3(), new Vector3()];
    uvs = [new Vector2(), new Vector2(), new Vector2()];
    tangents = [new Vector4(), new Vector4(), new Vector4()];
    weights = [new Vector4(), new Vector4(), new Vector4()];
    joints = [new Vector4(), new Vector4(), new Vector4()];
    indices = new Uint8Array([0, 1, 2]);
    indices16 = new Uint16Array([0, 1, 2]);
    indices32 = new Uint32Array([0, 1, 2]);
    deltaPositions = [new Vector3(1, 1, 1), new Vector3(2, 2, 2), new Vector3(3, 3, 3)];
    deltaNormals = [new Vector3(1, 1, 1), new Vector3(2, 2, 2), new Vector3(3, 3, 3)];
    deltaTangents = [new Vector3(1, 1, 1), new Vector3(2, 2, 2), new Vector3(3, 3, 3)];

    falsyColors = [new Color()];
    falsyNormals = [new Vector3()];
    falsyUV = [new Vector2()];
    falsyTangents = [new Vector4()];
    falsyWeights = [new Vector4()];
    falsyJoints = [new Vector4()];
  });

  it("init", () => {
    expect(modelMesh.readable).true;
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
  });
});
