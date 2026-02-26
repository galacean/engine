import {
  BlendShape,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  Engine,
  IndexFormat,
  ModelMesh,
  VertexAttribute,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine-core";
import { Color, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { describe, beforeAll, expect, it } from "vitest";

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
  beforeAll(async function () {
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
    modelMesh.uploadData(false);
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
    }).throw("Not allowed to access data while vertex buffer readable is false.");
    expect(() => {
      modelMesh.getColors();
    }).throw("Not allowed to access data while vertex buffer readable is false.");
    expect(() => {
      modelMesh.getNormals();
    }).throw("Not allowed to access data while vertex buffer readable is false.");
    expect(() => {
      modelMesh.getTangents();
    }).throw("Not allowed to access data while vertex buffer readable is false.");
    expect(() => {
      modelMesh.getBoneWeights();
    }).throw("Not allowed to access data while vertex buffer readable is false.");
    expect(() => {
      modelMesh.getBoneIndices();
    }).throw("Not allowed to access data while vertex buffer readable is false.");
    expect(() => {
      modelMesh.getUVs();
    }).throw("Not allowed to access data while vertex buffer readable is false.");
  });

  it("Read the advanced vertex data of the model set by buffer", () => {
    const modelMesh = new ModelMesh(engine);
    const arrayBuffer = new ArrayBuffer(40 * 2 + 20); // test offset 20
    const arrayBufferView = new Uint8Array(arrayBuffer, 20);

    const float32Array = new Float32Array(arrayBuffer, 20);
    (float32Array[0] = 1), (float32Array[1] = 2), (float32Array[2] = 3);
    (float32Array[3] = 1), (float32Array[4] = 1), (float32Array[5] = 1);
    (float32Array[6] = 0.5), (float32Array[7] = 0.5);

    (float32Array[10] = -1), (float32Array[11] = -2), (float32Array[12] = -3);
    (float32Array[13] = 0), (float32Array[14] = -1), (float32Array[15] = 0);
    (float32Array[16] = -0.5), (float32Array[17] = -0.5);

    const uint8Array = new Uint8Array(arrayBuffer, 20);
    (uint8Array[32] = 1), (uint8Array[33] = 2), (uint8Array[34] = 3), (uint8Array[35] = 4);
    (uint8Array[36] = 11), (uint8Array[37] = 12), (uint8Array[38] = 13), (uint8Array[39] = 14);

    (uint8Array[72] = 9), (uint8Array[73] = 10), (uint8Array[74] = 11), (uint8Array[75] = 12);
    (uint8Array[76] = 29), (uint8Array[77] = 55), (uint8Array[78] = 77), (uint8Array[79] = 88);

    const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, arrayBufferView, BufferUsage.Static, true);
    modelMesh.setVertexBufferBinding(vertexBuffer, 40, 0);
    // Test Vector3、Vector2、UByte4、NormalizedUByte4 format
    modelMesh.setVertexElements([
      new VertexElement(VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0),
      new VertexElement(VertexAttribute.Normal, 12, VertexElementFormat.Vector3, 0),
      new VertexElement(VertexAttribute.UV, 24, VertexElementFormat.Vector2, 0),
      new VertexElement(VertexAttribute.BoneIndex, 32, VertexElementFormat.UByte4, 0),
      new VertexElement(VertexAttribute.BoneWeight, 36, VertexElementFormat.NormalizedUByte4, 0)
    ]);

    const positions = modelMesh.getPositions();
    const normals = modelMesh.getNormals();
    const uvs = modelMesh.getUVs();
    const boneIndices = modelMesh.getBoneIndices();
    const boneWeights = modelMesh.getBoneWeights();

    const rightPositions = [new Vector3(1, 2, 3), new Vector3(-1, -2, -3)];
    const rightNormals = [new Vector3(1, 1, 1), new Vector3(0, -1, 0)];
    const rightUVS = [new Vector2(0.5, 0.5), new Vector2(-0.5, -0.5)];
    const rightBoneIndices = [new Vector4(1, 2, 3, 4), new Vector4(9, 10, 11, 12)];
    const rightBoneWeights = [
      new Vector4(11 / 255, 12 / 255, 13 / 255, 14 / 255),
      new Vector4(29 / 255, 55 / 255, 77 / 255, 88 / 255)
    ];

    // Test advanced vertex data
    expect(positions).deep.eq(rightPositions);
    expect(normals).deep.eq(rightNormals);
    expect(uvs).deep.eq(rightUVS);
    expect(boneIndices).deep.eq(rightBoneIndices);
    expect(boneWeights).deep.eq(rightBoneWeights);

    // Test use advanced interface to delete
    modelMesh.setPositions(null);
    const positions0 = modelMesh.getPositions();
    expect(positions0).eq(null);
    const vertexElements = modelMesh.vertexElements;
    expect(vertexElements.length).eq(4);

    // Test set positions with advanced interface again
    modelMesh.setPositions(rightPositions);
    const positions1 = modelMesh.getPositions();
    expect(positions1).eq(rightPositions);

    const vertexElements1 = modelMesh.vertexElements;
    expect(vertexElements1.length).eq(5);

    // Test set advanced vertex data, then set vertex buffer data
    const normals2 = [new Vector3(1, 0, 0), new Vector3(-1, -1, -1)];
    modelMesh.setNormals(normals2);
    modelMesh.vertexBufferBindings[0].buffer.setData(float32Array);
    const curNormals = modelMesh.getNormals();
    expect(curNormals).deep.eq(rightNormals);

    // Test if use cache data when get again
    const curNormals2 = modelMesh.getNormals();
    expect(curNormals).eq(curNormals2);

    // Test vertex buffer binding
    modelMesh.uploadData(true);
    const vertexBufferBindings = modelMesh.vertexBufferBindings;

    // Test vertex buffer binding count
    expect(vertexBufferBindings.length).eq(2);

    // Test if first vertex buffer binding is custom vertex buffer
    expect(vertexBufferBindings[0].buffer).eq(vertexBuffer);

    // Test reset vertex elements if internal buffer is destroyed
    modelMesh.setVertexElements([
      new VertexElement(VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0),
      new VertexElement(VertexAttribute.Normal, 12, VertexElementFormat.Vector3, 0),
      new VertexElement(VertexAttribute.UV, 24, VertexElementFormat.Vector2, 0),
      new VertexElement(VertexAttribute.BoneIndex, 32, VertexElementFormat.UByte4, 0),
      new VertexElement(VertexAttribute.BoneWeight, 36, VertexElementFormat.NormalizedUByte4, 0)
    ]);
    expect(vertexBufferBindings.length).eq(1);
  });

  it("Test non-contiguous custom vertex buffer", () => {
    const vertexCount = 4;
    const halfWidth = 0.5;
    const halfHeight = 0.5;
    const halfDepth = 0.5;
    const rightPositions = new Array<Vector3>(4);
    const rightNormals = new Array<Vector3>(4);
    const rightUVs = new Array<Vector2>(4);

    // 顶点
    const pos = new Float32Array(3 * vertexCount);
    // 法线
    const nor = new Float32Array(3 * vertexCount);
    // UV
    const uv = new Float32Array(2 * vertexCount);

    (pos[0] = -halfWidth), (pos[1] = halfHeight), (pos[2] = halfDepth);
    (pos[3] = halfWidth), (pos[4] = halfHeight), (pos[5] = halfDepth);
    (pos[6] = halfWidth), (pos[7] = -halfHeight), (pos[8] = halfDepth);
    (pos[9] = -halfWidth), (pos[10] = -halfHeight), (pos[11] = halfDepth);
    rightPositions[0] = new Vector3(-halfWidth, halfHeight, halfDepth);
    rightPositions[1] = new Vector3(halfWidth, halfHeight, halfDepth);
    rightPositions[2] = new Vector3(halfWidth, -halfHeight, halfDepth);
    rightPositions[3] = new Vector3(-halfWidth, -halfHeight, halfDepth);

    (nor[0] = 0), (nor[1] = 0), (nor[2] = 1);
    (nor[3] = 0), (nor[4] = 0), (nor[5] = 1);
    (nor[6] = 0), (nor[7] = 0), (nor[8] = 1);
    (nor[9] = 0), (nor[10] = 0), (nor[11] = 1);
    rightNormals[0] = new Vector3(0, 0, 1);
    rightNormals[1] = new Vector3(0, 0, 1);
    rightNormals[2] = new Vector3(0, 0, 1);
    rightNormals[3] = new Vector3(0, 0, 1);

    (uv[0] = 0), (uv[1] = 0);
    (uv[2] = 1), (uv[3] = 0);
    (uv[4] = 1), (uv[5] = 1);
    (uv[6] = 0), (uv[7] = 1);
    rightUVs[0] = new Vector2(0, 0);
    rightUVs[1] = new Vector2(1, 0);
    rightUVs[2] = new Vector2(1, 1);
    rightUVs[3] = new Vector2(0, 1);
    const posBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, pos, BufferUsage.Static, true);
    const norBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, nor, BufferUsage.Static, true);
    const uvBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, uv, BufferUsage.Static, true);
    const mesh = new ModelMesh(engine);
    const vertexElements = [
      new VertexElement(VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0),
      new VertexElement(VertexAttribute.Normal, 0, VertexElementFormat.Vector3, 2),
      new VertexElement(VertexAttribute.UV, 0, VertexElementFormat.Vector2, 3)
    ];

    mesh.setPositions(rightPositions);
    mesh.setPositions(null);
    mesh.setVertexElements(vertexElements);
    mesh.setVertexBufferBinding(posBuffer, 12, 0);
    mesh.setVertexBufferBinding(norBuffer, 12, 2);
    mesh.setVertexBufferBinding(uvBuffer, 8, 3);
    mesh.setIndices(indices);
    mesh.uploadData(false);
    mesh.addSubMesh(0, indices.length);

    const positions = mesh.getPositions();
    const normals = mesh.getNormals();
    const uvs = mesh.getUVs();

    expect(positions).deep.eq(rightPositions);
    expect(normals).deep.eq(rightNormals);
    expect(uvs).deep.eq(rightUVs);
  });

  it("Test vertexElement two-way setting", () => {
    const vertexCount = 4;
    const halfWidth = 0.5;
    const halfHeight = 0.5;
    const halfDepth = 0.5;
    const rightPositions = new Array<Vector3>(4);
    const rightNormals = new Array<Vector3>(4);
    const rightUVs = new Array<Vector2>(4);

    // 顶点
    const pos = new Float32Array(3 * vertexCount);
    // 法线
    const nor = new Float32Array(3 * vertexCount);
    // UV
    const uv = new Float32Array(2 * vertexCount);

    (pos[0] = -halfWidth), (pos[1] = halfHeight), (pos[2] = halfDepth);
    (pos[3] = halfWidth), (pos[4] = halfHeight), (pos[5] = halfDepth);
    (pos[6] = halfWidth), (pos[7] = -halfHeight), (pos[8] = halfDepth);
    (pos[9] = -halfWidth), (pos[10] = -halfHeight), (pos[11] = halfDepth);
    rightPositions[0] = new Vector3(-halfWidth, halfHeight, halfDepth);
    rightPositions[1] = new Vector3(halfWidth, halfHeight, halfDepth);
    rightPositions[2] = new Vector3(halfWidth, -halfHeight, halfDepth);
    rightPositions[3] = new Vector3(-halfWidth, -halfHeight, halfDepth);

    (nor[0] = 0), (nor[1] = 0), (nor[2] = 1);
    (nor[3] = 0), (nor[4] = 0), (nor[5] = 1);
    (nor[6] = 0), (nor[7] = 0), (nor[8] = 1);
    (nor[9] = 0), (nor[10] = 0), (nor[11] = 1);
    rightNormals[0] = new Vector3(0, 0, 1);
    rightNormals[1] = new Vector3(0, 0, 1);
    rightNormals[2] = new Vector3(0, 0, 1);
    rightNormals[3] = new Vector3(0, 0, 1);

    (uv[0] = 0), (uv[1] = 0);
    (uv[2] = 1), (uv[3] = 0);
    (uv[4] = 1), (uv[5] = 1);
    (uv[6] = 0), (uv[7] = 1);
    rightUVs[0] = new Vector2(0, 0);
    rightUVs[1] = new Vector2(1, 0);
    rightUVs[2] = new Vector2(1, 1);
    rightUVs[3] = new Vector2(0, 1);
    const posBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, pos, BufferUsage.Static, true);
    const norBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, nor, BufferUsage.Static, true);
    const uvBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, uv, BufferUsage.Static, true);
    const mesh = new ModelMesh(engine);
    const vertexElements = [
      new VertexElement(VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0),
      new VertexElement(VertexAttribute.Normal, 0, VertexElementFormat.Vector3, 2),
      new VertexElement(VertexAttribute.UV, 0, VertexElementFormat.Vector2, 3)
    ];

    mesh.setPositions(rightPositions);
    expect(mesh.vertexElements.length).deep.eq(1);

    mesh.setPositions(null);
    expect(mesh.vertexElements.length).deep.eq(0);

    mesh.setPositions(rightPositions);
    expect(mesh.vertexElements.length).deep.eq(1);

    // Set vertexElements and clear before vertexElements
    mesh.setVertexElements(vertexElements);
    expect(mesh.vertexElements.length).deep.eq(3);

    // Set advanced normal data to null and remove normal vertexElement
    mesh.setNormals(null);
    expect(mesh.vertexElements.length).deep.eq(2);

    // Test normal data is null, then revert with advanced normal data
    const normalsTest = mesh.getNormals();
    expect(normalsTest).eq(null);
    mesh.setNormals(rightNormals);

    mesh.setVertexBufferBinding(posBuffer, 12, 0);
    mesh.setVertexBufferBinding(norBuffer, 12, 2);
    mesh.setVertexBufferBinding(uvBuffer, 8, 3);
    mesh.setIndices(indices);
    mesh.uploadData(false);
    mesh.addSubMesh(0, indices.length);

    const positions = mesh.getPositions();
    const normals = mesh.getNormals();
    const uvs = mesh.getUVs();

    expect(positions).deep.eq(rightPositions);
    expect(normals).deep.eq(rightNormals);
    expect(uvs).deep.eq(rightUVs);

    // Test set vertexElements after set positions
    mesh.setVertexElements(vertexElements);
    mesh.setPositions(rightPositions);
    expect(mesh.vertexElements.length).deep.eq(3);

    const positions1 = mesh.getPositions();
    const normals1 = mesh.getNormals();
    const uvs1 = mesh.getUVs();

    expect(positions1).deep.eq(rightPositions);
    expect(normals1).deep.eq(rightNormals);
    expect(uvs1).deep.eq(rightUVs);
  });

  it("Test blend shape buffer offset", () => {
    const mesh = new ModelMesh(engine);
    const deltaPositions = [new Vector3(0.0, 0.0, 0.0)];
    const blendShape = new BlendShape("BlendShapeTest");
    blendShape.addFrame(1.0, deltaPositions);
    mesh.addBlendShape(blendShape);
    const vertexElements = [
      new VertexElement(VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0),
      new VertexElement(VertexAttribute.UV, 0, VertexElementFormat.Vector3, 1)
    ];
    // 顶点
    const pos = new Float32Array(3);
    // UV
    const uv = new Float32Array(2);
    (pos[0] = -1), (pos[1] = 1), (pos[2] = 1);
    (uv[0] = 0), (uv[1] = 0);
    const posBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, pos, BufferUsage.Static, true);
    const uvBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, uv, BufferUsage.Static, true);
    mesh.setVertexElements(vertexElements);
    mesh.setVertexBufferBinding(posBuffer, 12, 0);
    mesh.setVertexBufferBinding(uvBuffer, 8, 1);
    mesh.uploadData(false);
    expect(mesh.vertexBufferBindings.length).eq(3);
  });
});
