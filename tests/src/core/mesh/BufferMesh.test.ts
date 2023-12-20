import {
  BufferMesh,
  Buffer,
  Entity,
  VertexBufferBinding,
  IndexBufferBinding,
  IndexFormat,
  BufferBindFlag,
  BufferUsage,
  MeshRenderer,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { expect } from "chai";

describe("BufferMesh", () => {
  let engine: WebGLEngine;
  let rootEntity: Entity;

  before(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const scene = engine.sceneManager.activeScene;
    rootEntity = scene.createRootEntity();

    engine.run();
  });

  it("instanceCount", () => {
    const mesh = new BufferMesh(engine, "buffermesh-instancecount");
    expect(mesh.instanceCount).to.equal(0);
    mesh.instanceCount = 100;
    expect(mesh.instanceCount).to.equal(100);
  });

  it("VertexElements", () => {
    const mesh = new BufferMesh(engine, "buffermesh-vertexelements");
    expect(mesh.vertexElements.length).to.equal(0);
    mesh.setVertexElements([
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("NORMAL", 0, VertexElementFormat.Vector3, 12),
      new VertexElement("TEXCOORD_0", 0, VertexElementFormat.Vector2, 24),
      new VertexElement("COLOR_0", 0, VertexElementFormat.Vector4, 88)
    ]);
    expect(mesh.vertexElements.length).to.equal(4);
    expect(mesh.vertexElements[0].semantic).to.equal("POSITION");
    expect(mesh.vertexElements[0].bindingIndex).to.equal(0);
    expect(mesh.vertexElements[0].format).to.equal(VertexElementFormat.Vector3);
    expect(mesh.vertexElements[0].offset).to.equal(0);
    expect(mesh.vertexElements[1].semantic).to.equal("NORMAL");
    expect(mesh.vertexElements[1].bindingIndex).to.equal(12);
    expect(mesh.vertexElements[1].format).to.equal(VertexElementFormat.Vector3);
    expect(mesh.vertexElements[1].offset).to.equal(0);
    expect(mesh.vertexElements[2].semantic).to.equal("TEXCOORD_0");
    expect(mesh.vertexElements[2].bindingIndex).to.equal(24);
    expect(mesh.vertexElements[2].format).to.equal(VertexElementFormat.Vector2);
    expect(mesh.vertexElements[2].offset).to.equal(0);
    expect(mesh.vertexElements[3].semantic).to.equal("COLOR_0");
    expect(mesh.vertexElements[3].bindingIndex).to.equal(88);
    expect(mesh.vertexElements[3].format).to.equal(VertexElementFormat.Vector4);
    expect(mesh.vertexElements[3].offset).to.equal(0);
  });

  it("setVertexBufferBinding", () => {
    const buffer = new Buffer(engine, BufferBindFlag.VertexBuffer, 4, BufferUsage.Dynamic);
    buffer.setData(new Float32Array([255, 128, 64, 32]));
    const buffer2 = new Buffer(engine, BufferBindFlag.VertexBuffer, 4, BufferUsage.Dynamic);
    buffer2.setData(new Float32Array([128, 64, 32, 16]));

    const mrEntity1 = rootEntity.createChild("MeshRenderer1");
    const mr1 = mrEntity1.addComponent(MeshRenderer);
    const mrEntity2 = rootEntity.createChild("MeshRenderer2");
    const mr2 = mrEntity2.addComponent(MeshRenderer);

    const mesh = new BufferMesh(engine, "buffermesh-vertexbufferbinding");
    mr1.mesh = mesh;
    mr2.mesh = mesh;

    // Test setVertexBufferBinding(vertexBufferBindings: VertexBufferBinding, index?: number) method.
    mesh.setVertexBufferBinding(new VertexBufferBinding(buffer, 1));
    expect(mesh.vertexBufferBindings.length).to.equal(1);
    expect(mesh.vertexBufferBindings[0].buffer.refCount).to.equal(2);
    expect(mesh.vertexBufferBindings[0].stride).to.equal(1);

    mesh.setVertexBufferBinding(new VertexBufferBinding(buffer2, 1), 3);
    expect(mesh.vertexBufferBindings.length).to.equal(4);
    expect(mesh.vertexBufferBindings[3].buffer.refCount).to.equal(2);
    expect(mesh.vertexBufferBindings[3].stride).to.equal(1);

    // Test setVertexBufferBinding(vertexBuffer: Buffer, stride: number, index?: number) method.
    mesh.setVertexBufferBinding(buffer, 2, 1);
    expect(mesh.vertexBufferBindings.length).to.equal(4);
    expect(mesh.vertexBufferBindings[1].buffer.refCount).to.equal(4);
    expect(mesh.vertexBufferBindings[1].stride).to.equal(2);

    mesh.setVertexBufferBinding(buffer2, 1, 2);
    expect(mesh.vertexBufferBindings.length).to.equal(4);
    expect(mesh.vertexBufferBindings[2].buffer.refCount).to.equal(4);
    expect(mesh.vertexBufferBindings[2].stride).to.equal(1);

    // Test setVertexBufferBindings(vertexBufferBindings: VertexBufferBinding[], firstIndex: number = 0) method.
    const buffer3 = new Buffer(engine, BufferBindFlag.VertexBuffer, 4, BufferUsage.Dynamic);
    buffer3.setData(new Float32Array([128, 32, 255, 64]));
    const buffer4 = new Buffer(engine, BufferBindFlag.VertexBuffer, 4, BufferUsage.Dynamic);
    buffer4.setData(new Float32Array([64, 32, 16, 16]));
    mesh.setVertexBufferBindings(
      [
        new VertexBufferBinding(buffer3, 1),
        new VertexBufferBinding(buffer, 2),
        new VertexBufferBinding(buffer2, 1),
        new VertexBufferBinding(buffer4, 1)
      ],
      1
    );
    expect(mesh.vertexBufferBindings.length).to.equal(5);
    expect(mesh.vertexBufferBindings[0].buffer).to.equal(buffer);
    expect(mesh.vertexBufferBindings[0].buffer.refCount).to.equal(4);
    expect(mesh.vertexBufferBindings[0].stride).to.equal(1);
    expect(mesh.vertexBufferBindings[1].buffer).to.equal(buffer3);
    expect(mesh.vertexBufferBindings[1].buffer.refCount).to.equal(2);
    expect(mesh.vertexBufferBindings[1].stride).to.equal(1);
    expect(mesh.vertexBufferBindings[2].buffer).to.equal(buffer);
    expect(mesh.vertexBufferBindings[2].buffer.refCount).to.equal(4);
    expect(mesh.vertexBufferBindings[2].stride).to.equal(2);
    expect(mesh.vertexBufferBindings[3].buffer).to.equal(buffer2);
    expect(mesh.vertexBufferBindings[3].buffer.refCount).to.equal(2);
    expect(mesh.vertexBufferBindings[3].stride).to.equal(1);
    expect(mesh.vertexBufferBindings[4].buffer).to.equal(buffer4);
    expect(mesh.vertexBufferBindings[4].buffer.refCount).to.equal(2);
    expect(mesh.vertexBufferBindings[4].stride).to.equal(1);
  });

  it("setIndexBufferBinding", () => {
    const buffer = new Buffer(engine, BufferBindFlag.IndexBuffer, 4, BufferUsage.Dynamic);
    buffer.setData(new Uint16Array([0, 1, 2, 3]));
    const buffer2 = new Buffer(engine, BufferBindFlag.IndexBuffer, 4, BufferUsage.Dynamic);
    buffer2.setData(new Uint16Array([0, 1, 2, 3]));

    const mrEntity1 = rootEntity.createChild("MeshRenderer3");
    const mr1 = mrEntity1.addComponent(MeshRenderer);
    const mrEntity2 = rootEntity.createChild("MeshRenderer4");
    const mr2 = mrEntity2.addComponent(MeshRenderer);

    const mesh = new BufferMesh(engine, "buffermesh-indexbufferbinding");
    mr1.mesh = mesh;
    mr2.mesh = mesh;

    // Test setIndexBufferBinding(buffer: Buffer, format: IndexFormat) method.
    mesh.setIndexBufferBinding(buffer, IndexFormat.UInt16);
    expect(mesh.indexBufferBinding.buffer.refCount).to.equal(2);
    expect(mesh.indexBufferBinding.format).to.equal(IndexFormat.UInt16);

    // Test setIndexBufferBinding(binding: IndexBufferBinding | null) method.
    mesh.setIndexBufferBinding(new IndexBufferBinding(buffer2, IndexFormat.UInt8));
    expect(mesh.indexBufferBinding.buffer.refCount).to.equal(2);
    expect(mesh.indexBufferBinding.format).to.equal(IndexFormat.UInt8);

    mesh.setIndexBufferBinding(null);
    expect(mesh.indexBufferBinding).to.equal(null);
  });
});
