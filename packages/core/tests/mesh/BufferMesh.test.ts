import { Vector2, Vector3, Vector4, Color } from "@oasis-engine/math";
import { Engine } from "../../src";
import { WebGLRenderer, WebCanvas } from '../../../rhi-webgl';
import { IndexFormat } from "../../src";
import { BufferMesh } from "../../src/mesh/BufferMesh";
import { Buffer, BufferBindFlag, BufferUsage, IndexBufferBinding } from '../../src/graphic';
import { VertexElement, VertexElementFormat, VertexBufferBinding } from '../../src/graphic';

describe("BufferMesh Test", function () {
  const hardwareRenderer = new WebGLRenderer();
  const canvas = new WebCanvas(document.createElement('canvas'));
  const engine = new Engine(canvas, hardwareRenderer);
  it("setVertexElements", () => {
    const vertexElements = [
      new VertexElement("a_position", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("a_velocity", 12, VertexElementFormat.Vector3, 0),
      new VertexElement("a_acceleration", 24, VertexElementFormat.Vector3, 0),
      new VertexElement("a_color", 36, VertexElementFormat.Vector4, 0),
      new VertexElement("a_lifeAndSize", 52, VertexElementFormat.Vector4, 0),
      new VertexElement("a_rotation", 68, VertexElementFormat.Vector2, 0),
      new VertexElement("a_uv", 76, VertexElementFormat.Vector3, 0),
      new VertexElement("a_normalizedUv", 88, VertexElementFormat.Vector2, 0)
    ];
    const bufferMesh = new BufferMesh(engine);
    bufferMesh.setVertexElements(vertexElements);
    expect(bufferMesh.vertexElements.length).toBe(8);
  });

  it("setVertexBufferBinding", () => {
    const bufferMesh1 = new BufferMesh(engine);
    const bufferMesh2 = new BufferMesh(engine);
    const bufferMesh3 = new BufferMesh(engine);

    const vertexBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      600,
      BufferUsage.Dynamic
    );
    bufferMesh1.setVertexBufferBinding(vertexBuffer, 666);
    expect(bufferMesh1.vertexBufferBindings[0].stride).toBe(666);

    const bb = new VertexBufferBinding(
      vertexBuffer,
      666
    );
    bufferMesh2.setVertexBufferBinding(bb);
    expect(bufferMesh2.vertexBufferBindings[0].stride).toBe(666);

    bufferMesh3.setVertexBufferBinding(vertexBuffer, 666, 5);
    expect(bufferMesh3.vertexBufferBindings[5].stride).toBe(666);
    expect(bufferMesh3.vertexBufferBindings.length).toBe(6);
  });

  it("setVertexBufferBindings", () => {
    const bufferMesh = new BufferMesh(engine);
    const vertexBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      600,
      BufferUsage.Dynamic
    );

    const vb1 = new VertexBufferBinding(
      vertexBuffer,
      666
    );
    const vb2 = new VertexBufferBinding(
      vertexBuffer,
      555
    );
    bufferMesh.setVertexBufferBindings([
      vb1, vb2
    ], 2);
    expect(bufferMesh.vertexBufferBindings[3].stride).toBe(555);
  });

  it("setIndexBufferBinding", () => {
    const bufferMesh1 = new BufferMesh(engine);
    const bufferMesh2 = new BufferMesh(engine);
    const indexBuffer = new Buffer(
      engine, 
      BufferBindFlag.IndexBuffer, 
      120, 
      BufferUsage.Dynamic
    );
    const ib = new IndexBufferBinding(indexBuffer, IndexFormat.UInt16);
    bufferMesh1.setIndexBufferBinding(indexBuffer, IndexFormat.UInt16);
    bufferMesh2.setIndexBufferBinding(ib);

    expect(bufferMesh1.indexBufferBinding.buffer).toBe(indexBuffer);
    expect(bufferMesh2.indexBufferBinding.buffer).toBe(indexBuffer);
  });
});
