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
    horizontalSegments: number = 8,
    verticalSegments: number = 6,
    alphaStart: number = 0,
    alphaRange: number = Math.PI * 2,
    thetaStart: number = 0,
    thetaRange: number = Math.PI
  ): Mesh {
    const mesh = new Mesh(engine);
    horizontalSegments = Math.max(3, Math.floor(horizontalSegments));
    verticalSegments = Math.max(2, Math.floor(verticalSegments));
    const thetaEnd = thetaStart + thetaRange;

    // Generate data of geometric vertices on the latitude and longitude lines
    let index = 0;
    const grid = [];
    const vertices: Float32Array = new Float32Array((verticalSegments + 1) * (horizontalSegments + 1) * 8);
    const indices = [];
    // const positions = [];
    for (let iy = 0; iy <= verticalSegments; iy++) {
      const verticesRow = [];
      const v = iy / verticalSegments;
      for (let ix = 0; ix <= horizontalSegments; ix++) {
        const u = ix / horizontalSegments;
        let posX = -radius * Math.cos(alphaStart + u * alphaRange) * Math.sin(thetaStart + v * thetaRange);
        let posY = radius * Math.cos(thetaStart + v * thetaRange);
        let posZ = radius * Math.sin(alphaStart + u * alphaRange) * Math.sin(thetaStart + v * thetaRange);
        posX = Math.abs(posX) < 1e-6 ? 0 : posX;
        posY = Math.abs(posY) < 1e-6 ? 0 : posY;
        posZ = Math.abs(posZ) < 1e-6 ? 0 : posZ;

        const offset = index * 8;
        // POSITION
        vertices[offset] = posX;
        vertices[offset + 1] = posY;
        vertices[offset + 2] = posZ;
        // NORMAL
        vertices[offset + 3] = posX;
        vertices[offset + 4] = posY;
        vertices[offset + 5] = posZ;
        // TEXCOORD_0
        vertices[offset + 6] = u;
        vertices[offset + 7] = 1 - v;

        verticesRow.push(index++);
      }
      grid.push(verticesRow);
    }

    // Generate indices
    for (let iy = 0; iy < verticalSegments; iy++) {
      for (let ix = 0; ix < horizontalSegments; ix++) {
        const a = grid[iy][ix + 1];
        const b = grid[iy][ix];
        const c = grid[iy + 1][ix];
        const d = grid[iy + 1][ix + 1];

        if (iy !== 0 || thetaStart > 0) indices.push(a, b, d);
        if (iy !== verticalSegments - 1 || thetaEnd < Math.PI) indices.push(b, c, d);
      }
    }

    PrimitiveMesh._initialize(engine, mesh, vertices, Uint16Array.from(indices));

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
    (horizontalSegments = Math.floor(horizontalSegments)), (verticalSegments = Math.floor(verticalSegments));

    const halfWidth = width / 2;
    const halfHeight = height / 2;

    // Generate data of geometric vertices on the latitude and longitude lines
    let index = 0;
    let offset = 0;
    const grid = [];
    const vertices: Float32Array = new Float32Array((verticalSegments + 1) * (horizontalSegments + 1) * 8);
    const indices: Uint16Array = new Uint16Array(verticalSegments * horizontalSegments * 6);

    for (let iy = 0; iy <= verticalSegments; iy++) {
      const verticesRow = [];
      const v = iy / verticalSegments;
      for (let ix = 0; ix <= horizontalSegments; ix++) {
        const u = ix / horizontalSegments;
        const posX = u * width - halfWidth;
        const posY = v * height - halfHeight;

        // POSITION
        vertices[offset++] = posX;
        vertices[offset++] = posY;
        vertices[offset++] = 0;
        // NORMAL
        vertices[offset++] = 0;
        vertices[offset++] = 0;
        vertices[offset++] = 1;
        // TEXCOORD_0
        vertices[offset++] = u;
        vertices[offset++] = 1 - v;

        verticesRow.push(index++);
      }
      grid.push(verticesRow);
    }

    // Generate indices
    index = 0;
    for (let iy = 0; iy < verticalSegments; iy++) {
      for (let ix = 0; ix < horizontalSegments; ix++) {
        const a = grid[iy][ix + 1];
        const b = grid[iy][ix];
        const c = grid[iy + 1][ix];
        const d = grid[iy + 1][ix + 1];

        indices[index++] = a;
        indices[index++] = c;
        indices[index++] = b;
        indices[index++] = a;
        indices[index++] = d;
        indices[index++] = c;
      }
    }

    PrimitiveMesh._initialize(engine, mesh, vertices, indices);
    return mesh;
  }

  /**
   * Create a circle mesh.
   * @param engine - Engine
   * @param radius - Circle radius
   * @param segments - Circle segments
   * @param thetaStart - Circle thetaStart
   * @param thetaLength - Circle thetaLength
   * @returns Circle mesh
   */
  static createCircle(
    engine: Engine,
    radius: number = 1.0,
    segments: number = 16,
    thetaStart: number = 0,
    thetaLength: number = Math.PI * 2
  ): Mesh {
    const mesh = new Mesh(engine);

    // center point
    const vertices: Float32Array = new Float32Array((segments + 2) * 8);
    vertices.set([0, 0, 0, 0, 0, 1, 0.5, 0.5]);

    let index = 8;
    for (let s = 0; s <= segments; s++) {
      let segment = thetaStart + (s / segments) * thetaLength;
      const x = radius * Math.cos(segment);
      const y = radius * Math.sin(segment);

      // POSITION
      vertices[index++] = x;
      vertices[index++] = y;
      vertices[index++] = 0;
      // NORMAL
      vertices[index++] = 0;
      vertices[index++] = 0;
      vertices[index++] = 1;
      // TEXCOORD_0
      vertices[index++] = (x / radius + 1) * 0.5;
      vertices[index++] = (y / radius + 1) * 0.5;
    }

    const indices: Uint16Array = new Uint16Array(segments * 3);
    index = 0;
    for (let i = 1; i <= segments; i++) {
      indices[index++] = i;
      indices[index++] = i + 1;
      indices[index++] = 0;
    }

    PrimitiveMesh._initialize(engine, mesh, vertices, indices);
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
