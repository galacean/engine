import { Vector3 } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { Mesh } from "../graphic/Mesh";
import { VertexElement } from "../graphic/VertexElement";

/**
 * Used to generate common primitve meshes.
 */
export class PrimitiveMesh {
  /**
   * Create a sphere mesh.
   * @param  radius - Sphere radius.
   * @param  horizontalSegments - Number of horizontal segments
   * @param  verticalSegments - Number of vertical segments
   * @param  alphaStart - Specify horizontal starting angle
   * @param  alphaRange - Specify horizontal sweep angle size
   * @param  thetaStart - Specify vertical starting angle
   * @param  thetaRange - Specify vertical sweep angle size
   * @returns Sphere mesh
   */
  static createSphere(
    engine: Engine,
    radius: number = 1,
    horizontalSegments: number = 10,
    verticalSegments: number = 10,
    alphaStart: number = 0,
    alphaRange: number = Math.PI * 2,
    thetaStart: number = 0,
    thetaRange: number = Math.PI
  ): Mesh {
    const mesh = new Mesh(engine);
    // horizontalSegments = Math.max(3, Math.floor(horizontalSegments));
    // verticalSegments = Math.max(2, Math.floor(verticalSegments));
    horizontalSegments = Math.floor(horizontalSegments);
    verticalSegments = Math.floor(verticalSegments);
    const horizontalCount = horizontalSegments + 1;
    const verticalCount = verticalSegments + 1;
    const verticesConut = horizontalCount * verticalCount;
    const vertices = new Float32Array(verticesConut * 8);
    const rectangleCount = horizontalSegments * verticalSegments;
    const indices = new Uint16Array(rectangleCount * 6);

    let offset = 0;
    for (let i = 0; i < verticesConut; ++i) {
      const x = i % horizontalCount;
      const y = i / horizontalCount | 0;
      const u = x / horizontalSegments;
      const v = y / verticalSegments;
      const alphaDelta = alphaStart + u * alphaRange;
      const thetaDelta = thetaStart + v * thetaRange;
      const sinTheta = Math.sin(thetaDelta);

      let posX = -radius * Math.cos(alphaDelta) * sinTheta;
      let posY = radius * Math.cos(thetaDelta);
      let posZ = radius * Math.sin(alphaDelta) * sinTheta;
      posX = Math.abs(posX) < 1e-6 ? 0 : posX;
      posY = Math.abs(posY) < 1e-6 ? 0 : posY;
      posZ = Math.abs(posZ) < 1e-6 ? 0 : posZ;

      // POSITION
      vertices[offset++] = posX;
      vertices[offset++] = posY;
      vertices[offset++] = posZ;
      // NORMAL
      vertices[offset++] = posX;
      vertices[offset++] = posY;
      vertices[offset++] = posZ;
      // TEXCOORD_0
      vertices[offset++] = u
      vertices[offset++] = 1 - v;
    }

    offset = 0;
    for (let i = 0; i < rectangleCount; ++i) {
      const x = i % horizontalSegments;
      const y = i / horizontalSegments | 0;

      const a = y * horizontalCount + x;
      const b = a + 1;
      const c = a + horizontalCount;
      const d = c + 1;

      indices[offset++] = b;
      indices[offset++] = a;
      indices[offset++] = d;
      indices[offset++] = a;
      indices[offset++] = c;
      indices[offset++] = d;
    }

    PrimitiveMesh._initialize(engine, mesh, vertices, indices);
    return mesh;
  }

  /**
   * Create a cuboid mesh.
   * @param engine - Engine
   * @param width - Cuboid width
   * @param height - Cuboid height
   * @param depth - Cuboid depth
   * @returns Cuboid mesh
   */
  static createCuboid(engine: Engine, width: number = 1, height: number = 1, depth: number = 1): Mesh {
    const mesh = new Mesh(engine);

    const halfWidth: number = width / 2;
    const halfHeight: number = height / 2;
    const halfDepth: number = depth / 2;

    // prettier-ignore
    const vertices: Float32Array = new Float32Array([
    	// up
    	-halfWidth, halfHeight, -halfDepth, 0, 1, 0, 0, 0, halfWidth, halfHeight, -halfDepth, 0, 1, 0, 1, 0, halfWidth, halfHeight, halfDepth, 0, 1, 0, 1, 1, -halfWidth, halfHeight, halfDepth, 0, 1, 0, 0, 1,
    	// down
    	-halfWidth, -halfHeight, -halfDepth, 0, -1, 0, 0, 1, halfWidth, -halfHeight, -halfDepth, 0, -1, 0, 1, 1, halfWidth, -halfHeight, halfDepth, 0, -1, 0, 1, 0, -halfWidth, -halfHeight, halfDepth, 0, -1, 0, 0, 0,
    	// left
    	-halfWidth, halfHeight, -halfDepth, -1, 0, 0, 0, 0, -halfWidth, halfHeight, halfDepth, -1, 0, 0, 1, 0, -halfWidth, -halfHeight, halfDepth, -1, 0, 0, 1, 1, -halfWidth, -halfHeight, -halfDepth, -1, 0, 0, 0, 1,
    	// right
    	halfWidth, halfHeight, -halfDepth, 1, 0, 0, 1, 0, halfWidth, halfHeight, halfDepth, 1, 0, 0, 0, 0, halfWidth, -halfHeight, halfDepth, 1, 0, 0, 0, 1, halfWidth, -halfHeight, -halfDepth, 1, 0, 0, 1, 1,
    	// fornt
    	-halfWidth, halfHeight, halfDepth, 0, 0, 1, 0, 0, halfWidth, halfHeight, halfDepth, 0, 0, 1, 1, 0, halfWidth, -halfHeight, halfDepth, 0, 0, 1, 1, 1, -halfWidth, -halfHeight, halfDepth, 0, 0, 1, 0, 1,
    	// back
    	-halfWidth, halfHeight, -halfDepth, 0, 0, -1, 1, 0, halfWidth, halfHeight, -halfDepth, 0, 0, -1, 0, 0, halfWidth, -halfHeight, -halfDepth, 0, 0, -1, 0, 1, -halfWidth, -halfHeight, -halfDepth, 0, 0, -1, 1, 1]);

    // prettier-ignore
    const indices: Uint16Array = new Uint16Array([
    	// up
    	0, 2, 1, 2, 0, 3,
    	// donw
    	4, 6, 7, 6, 4, 5,
    	// left
    	8, 10, 9, 10, 8, 11,
    	// right
    	12, 14, 15, 14, 12, 13,
    	// fornt
    	16, 18, 17, 18, 16, 19,
    	// back
    	20, 22, 23, 22, 20, 21]);
    PrimitiveMesh._initialize(engine, mesh, vertices, indices);
    return mesh;
  }

  /**
   * Create a plane mesh.
   * @param engine - Engine
   * @param width - Plane width
   * @param height - Plane height
   * @param horizontalSegments - Plane horizontal segments
   * @param verticalSegments - Plane verticle segments
   * @returns Plane mesh
   */
  static createPlane(
    engine: Engine,
    width: number = 1,
    height: number = 1,
    horizontalSegments: number = 1,
    verticalSegments: number = 1
  ): Mesh {
    const mesh = new Mesh(engine);
    horizontalSegments = Math.floor(horizontalSegments);
    verticalSegments = Math.floor(verticalSegments);

    const horizontalCount = horizontalSegments + 1;
    const verticalCount = verticalSegments + 1;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const gridWidth = width / horizontalSegments;
    const gridHeight = height / verticalSegments;
    const verticesConut = horizontalCount * verticalCount;
    const vertices = new Float32Array(verticesConut * 8);
    const rectangleCount = verticalSegments * horizontalSegments;
    const indices = new Uint16Array(rectangleCount * 6);

    let offset = 0;
    for (let i = 0; i < verticesConut; ++i) {
      const x = i % horizontalCount;
      const y = i / verticalCount | 0;

      // POSITION
      vertices[offset++] = x * gridWidth - halfWidth;
      vertices[offset++] = y * gridHeight - halfHeight;
      vertices[offset++] = 0;
      // NORMAL
      vertices[offset++] = 0;
      vertices[offset++] = 0;
      vertices[offset++] = 1;
      // TEXCOORD_0
      vertices[offset++] = x / horizontalSegments;
      vertices[offset++] = 1 - y / verticalSegments;
    }

    offset = 0;
    for (let i = 0; i < rectangleCount; ++i) {
      const x = i % horizontalSegments;
      const y = i / horizontalSegments | 0;

      const a = y * horizontalCount + x;
      const b = a + 1;
      const c = a + horizontalCount;
      const d = c + 1;

      indices[offset++] = b;
      indices[offset++] = c;
      indices[offset++] = a;
      indices[offset++] = b;
      indices[offset++] = d;
      indices[offset++] = c;
    }

    PrimitiveMesh._initialize(engine, mesh, vertices, indices);
    return mesh;
  }

  static createCylinder(engine:Engine): Mesh {
    const mesh = new Mesh(engine);
    return mesh;
  }

  private static _initialize(engine: Engine, mesh: Mesh, vertices: Float32Array, indices: Uint16Array) {
    const vertexStride = 32;
    const vertexElements = [
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("NORMAL", 12, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 24, VertexElementFormat.Vector2, 0)
    ];

    PrimitiveMesh._initBuffer(engine, mesh, vertices, indices, vertexStride, vertexElements);
  }

  /**
   * @internal
   */
  _createScreenQuadMesh(engine: Engine) {
    const mesh = new Mesh(engine);
    const vertices: Float32Array = new Float32Array([-1, -1, 0, 0, 0, 1, -1, 0, 1, 0, 1, 1, 0, 1, 1, -1, 1, 0, 0, 1]);

    const indices: Uint16Array = new Uint16Array([0, 1, 2, 3]);

    const vertexStride = 20;
    const vertexElements = [
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0)
    ];
    PrimitiveMesh._initBuffer(engine, mesh, vertices, indices, vertexStride, vertexElements);

    mesh.subMesh.topology = MeshTopology.TriangleFan;
    return mesh;
  }

  private static _initBuffer(
    engine: Engine,
    mesh: Mesh,
    vertices: Float32Array,
    indices: Uint16Array,
    vertexStride: number,
    vertexElements: VertexElement[]
  ) {
    const positionElement = vertexElements[0];
    const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices, BufferUsage.Static);
    const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Static);

    mesh.setVertexBufferBinding(vertexBuffer, vertexStride);
    mesh.setIndexBufferBinding(indexBuffer, IndexFormat.UInt16);
    mesh.setVertexElements(vertexElements);
    mesh.addSubMesh(0, indices.length);

    this._computeBounds(mesh, positionElement, vertices);
  }

  private static _computeBounds(
    mesh: Mesh,
    positionElement: VertexElement,
    vertices: ArrayBuffer | Float32Array
  ): void {
    const vertexElement = positionElement;
    const bufferIndex = vertexElement.bindingIndex;
    const vertexBufferBinding = mesh.vertexBufferBindings[bufferIndex];
    const stride = vertexBufferBinding.stride;
    const offset = vertexElement.offset;
    const vertexCount = vertexBufferBinding.buffer.byteLength / stride;
    let arrayBuffer: ArrayBuffer = vertices;
    if (!(arrayBuffer instanceof ArrayBuffer)) {
      arrayBuffer = (<Float32Array>arrayBuffer).buffer;
    }
    const dataView = new DataView(arrayBuffer, offset);

    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < vertexCount; i++) {
      const base = offset + stride * i;
      const position = new Vector3(
        dataView.getFloat32(base, true),
        dataView.getFloat32(base + 4, true),
        dataView.getFloat32(base + 8, true)
      );
      Vector3.min(min, position, min);
      Vector3.max(max, position, max);
    }

    const bounds = mesh.bounds;
    min.cloneTo(bounds.min);
    max.cloneTo(bounds.max);
  }
}
