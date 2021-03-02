import { Vector3 } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
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
    horizontalSegments: number = 12,
    verticalSegments: number = 12,
    alphaStart: number = 0,
    alphaRange: number = Math.PI * 2,
    thetaStart: number = 0,
    thetaRange: number = Math.PI
  ): Mesh {
    const mesh = new Mesh(engine);
    horizontalSegments = Math.floor(horizontalSegments);
    verticalSegments = Math.floor(verticalSegments);

    const horizontalCount = horizontalSegments + 1;
    const verticalCount = verticalSegments + 1;
    const verticesCount = horizontalCount * verticalCount;
    const vertices = new Float32Array(verticesCount * 8);
    const rectangleCount = horizontalSegments * verticalSegments;
    const indices = new Uint16Array(rectangleCount * 6);

    let offset = 0;
    for (let i = 0; i < verticesCount; ++i) {
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

      // Position
      vertices[offset++] = posX;
      vertices[offset++] = posY;
      vertices[offset++] = posZ;
      // Normal
      vertices[offset++] = posX;
      vertices[offset++] = posY;
      vertices[offset++] = posZ;
      // Texcoord_0
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
  static createCuboid(
    engine: Engine,
    width: number = 1,
    height: number = 1,
    depth: number = 1
  ): Mesh {
    const mesh = new Mesh(engine);

    const halfWidth: number = width / 2;
    const halfHeight: number = height / 2;
    const halfDepth: number = depth / 2;

    const vertices = new Float32Array(192);
    // up
    vertices[0] = -halfWidth, vertices[1] = halfHeight, vertices[2] = -halfDepth, vertices[3] = 0, vertices[4] = 1, vertices[5] = 0, vertices[6] = 0, vertices[7] = 0;
    vertices[8] = halfWidth, vertices[9] = halfHeight, vertices[10] = -halfDepth, vertices[11] = 0, vertices[12] = 1, vertices[13] = 0, vertices[14] = 1, vertices[15] = 0;
    vertices[16] = halfWidth, vertices[17] = halfHeight, vertices[18] = halfDepth, vertices[19] = 0, vertices[20] = 1, vertices[21] = 0, vertices[22] = 1, vertices[23] = 1;
    vertices[24] = -halfWidth, vertices[25] = halfHeight, vertices[26] = halfDepth, vertices[27] = 0, vertices[28] = 1, vertices[29] = 0, vertices[30] = 0, vertices[31] = 1;
    // down
    vertices[32] = -halfWidth, vertices[33] = -halfHeight, vertices[34] = -halfDepth, vertices[35] = 0, vertices[36] = -1, vertices[37] = 0, vertices[38] = 0, vertices[39] = 1;
    vertices[40] = halfWidth, vertices[41] = -halfHeight, vertices[42] = -halfDepth, vertices[43] = 0, vertices[44] = -1, vertices[45] = 0, vertices[46] = 1, vertices[47] = 1;
    vertices[48] = halfWidth, vertices[49] = -halfHeight, vertices[50] = halfDepth, vertices[51] = 0, vertices[52] = -1, vertices[53] = 0, vertices[54] = 1, vertices[55] = 0;
    vertices[56] = -halfWidth, vertices[57] = -halfHeight, vertices[58] = halfDepth, vertices[59] = 0, vertices[60] = -1, vertices[61] = 0, vertices[62] = 0, vertices[63] = 0;
    // left
    vertices[64] = -halfWidth, vertices[65] = halfHeight, vertices[66] = -halfDepth, vertices[67] = -1, vertices[68] = 0, vertices[69] = 0, vertices[70] = 0, vertices[71] = 0;
    vertices[72] = -halfWidth, vertices[73] = halfHeight, vertices[74] = halfDepth, vertices[75] = -1, vertices[76] = 0, vertices[77] = 0, vertices[78] = 1, vertices[79] = 0;
    vertices[80] = -halfWidth, vertices[81] = -halfHeight, vertices[82] = halfDepth, vertices[83] = -1, vertices[84] = 0, vertices[85] = 0, vertices[86] = 1, vertices[87] = 1;
    vertices[88] = -halfWidth, vertices[89] = -halfHeight, vertices[90] = -halfDepth, vertices[91] = -1, vertices[92] = 0, vertices[93] = 0, vertices[94] = 0, vertices[95] = 1;
    // right
    vertices[96] = halfWidth, vertices[97] = halfHeight, vertices[98] = -halfDepth, vertices[99] = 1, vertices[100] = 0, vertices[101] = 0, vertices[102] = 1, vertices[103] = 0;
    vertices[104] = halfWidth, vertices[105] = halfHeight, vertices[106] = halfDepth, vertices[107] = 1, vertices[108] = 0, vertices[109] = 0, vertices[110] = 0, vertices[111] = 0;
    vertices[112] = halfWidth, vertices[113] = -halfHeight, vertices[114] = halfDepth, vertices[115] = 1, vertices[116] = 0, vertices[117] = 0, vertices[118] = 0, vertices[119] = 1;
    vertices[120] = halfWidth, vertices[121] = -halfHeight, vertices[122] = -halfDepth, vertices[123] = 1, vertices[124] = 0, vertices[125] = 0, vertices[126] = 1, vertices[127] = 1;
    // front
    vertices[128] = -halfWidth, vertices[129] = halfHeight, vertices[130] = halfDepth, vertices[131] = 0, vertices[132] = 0, vertices[133] = 1, vertices[134] = 0, vertices[135] = 0;
    vertices[136] = halfWidth, vertices[137] = halfHeight, vertices[138] = halfDepth, vertices[139] = 0, vertices[140] = 0, vertices[141] = 1, vertices[142] = 1, vertices[143] = 0;
    vertices[144] = halfWidth, vertices[145] = -halfHeight, vertices[146] = halfDepth, vertices[147] = 0, vertices[148] = 0, vertices[149] = 1, vertices[150] = 1, vertices[151] = 1;
    vertices[152] = -halfWidth, vertices[153] = -halfHeight, vertices[154] = halfDepth, vertices[155] = 0, vertices[156] = 0, vertices[157] = 1, vertices[158] = 0, vertices[159] = 1;
    // back
    vertices[160] = -halfWidth, vertices[161] = halfHeight, vertices[162] = -halfDepth, vertices[163] = 0, vertices[164] = 0, vertices[165] = -1, vertices[166] = 1, vertices[167] = 0;
    vertices[168] = halfWidth, vertices[169] = halfHeight, vertices[170] = -halfDepth, vertices[171] = 0, vertices[172] = 0, vertices[173] = -1, vertices[174] = 0, vertices[175] = 0;
    vertices[176] = halfWidth, vertices[177] = -halfHeight, vertices[178] = -halfDepth, vertices[179] = 0, vertices[180] = 0, vertices[181] = -1, vertices[182] = 0, vertices[183] = 1;
    vertices[184] = -halfWidth, vertices[185] = -halfHeight, vertices[186] = -halfDepth, vertices[187] = 0, vertices[188] = 0, vertices[189] = -1, vertices[190] = 1, vertices[191] = 1;
    
    const indices = new Uint16Array(36);
    // up
    indices[0] = 0, indices[1] = 2, indices[2] = 1, indices[3] = 2, indices[4] = 0, indices[5] = 3;
    // down
    indices[6] = 4, indices[7] = 6, indices[8] = 7, indices[9] = 6, indices[10] = 4, indices[11] = 5;
    // left
    indices[12] = 8, indices[13] = 10, indices[14] = 9, indices[15] = 10, indices[16] = 8, indices[17] = 11;
    // right
    indices[18] = 12, indices[19] = 14, indices[20] = 15, indices[21] = 14, indices[22] = 12, indices[23] = 13;
    // front
    indices[24] = 16, indices[25] = 18, indices[26] = 17, indices[27] = 18, indices[28] = 16, indices[29] = 19;
    // back
    indices[30] = 20, indices[31] = 22, indices[32] = 23, indices[33] = 22, indices[34] = 20, indices[35] = 21;

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
    const verticesCount = horizontalCount * verticalCount;
    const vertices = new Float32Array(verticesCount * 8);
    const rectangleCount = verticalSegments * horizontalSegments;
    const indices = new Uint16Array(rectangleCount * 6);

    let offset = 0;
    for (let i = 0; i < verticesCount; ++i) {
      const x = i % horizontalCount;
      const y = i / horizontalCount | 0;

      // Position
      vertices[offset++] = x * gridWidth - halfWidth;
      vertices[offset++] = y * gridHeight - halfHeight;
      vertices[offset++] = 0;
      // Normal
      vertices[offset++] = 0;
      vertices[offset++] = 0;
      vertices[offset++] = 1;
      // Texcoord_0
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

  /**
   * Create a cylinder mesh.
   * @param engine - Engine
   * @param radius - The radius of cap
   * @param height - The height of torso
   * @param radialSegments - Cylinder radial segments
   * @param heightSegments - Cylinder height segments
   * @returns Cylinder mesh
   */
  static createCylinder(
    engine: Engine,
    radius: number = 1,
    height: number = 1,
    radialSegments: number = 20,
    heightSegments: number = 1,
  ): Mesh {
    const mesh = new Mesh(engine);
    radialSegments = Math.floor(radialSegments);
    heightSegments = Math.floor(heightSegments);

    const radialCount = radialSegments + 1;
    const verticalCount = heightSegments + 1;
    const halfHeight = height / 2;
    const unitHeight = height / heightSegments;
    const torsoVerticesCount = radialCount * verticalCount;
    const totalVerticesCount = torsoVerticesCount + 2;
    const vertices = new Float32Array(totalVerticesCount * 8);
    const torsoRectangleCount = radialSegments * heightSegments;
    const capTriangleCount = radialSegments * 2;
    const indices = new Uint16Array(torsoRectangleCount * 6 + capTriangleCount * 3);

    let verticesOffset = 0;
    let indicesOffset = 0;
    
    // Create torso
    for (let i = 0; i < torsoVerticesCount; ++i) {
      const x = i % radialCount;
      const y = i / radialCount | 0;
      const u = x / radialSegments;
      const v = y / heightSegments;
      const theta = u * Math.PI * 2;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      
      let posX = radius * sinTheta;
      let posY = v * unitHeight - halfHeight;
      let posZ = radius * cosTheta;
      posX = Math.abs(posX) < 1e-6 ? 0 : posX;
      posY = Math.abs(posY) < 1e-6 ? 0 : posY;
      posZ = Math.abs(posZ) < 1e-6 ? 0 : posZ;

      // Position
      vertices[verticesOffset++] = posX;
      vertices[verticesOffset++] = posY;
      vertices[verticesOffset++] = posZ;
      // Normal
      vertices[verticesOffset++] = sinTheta;
      vertices[verticesOffset++] = 0;
      vertices[verticesOffset++] = cosTheta;
      // Texcoord_0
      vertices[verticesOffset++] = u;
      vertices[verticesOffset++] = 1 - v;
    }

    for (let i = 0; i < torsoRectangleCount; ++i) {
      const x = i % radialSegments;
      const y = i / radialSegments | 0;

      const a = y * radialCount + x;
      const b = a + 1;
      const c = a + radialCount;
      const d = c + 1;

      indices[indicesOffset++] = b;
      indices[indicesOffset++] = c;
      indices[indicesOffset++] = a;
      indices[indicesOffset++] = b;
      indices[indicesOffset++] = d;
      indices[indicesOffset++] = c;
    }

    // Create cap

    // Position
    vertices[verticesOffset++] = 0;
    vertices[verticesOffset++] = -halfHeight;
    vertices[verticesOffset++] = 0;
    // Normal
    vertices[verticesOffset++] = 0;
    vertices[verticesOffset++] = -1;
    vertices[verticesOffset++] = 0;
    // Texcoord_0
    vertices[verticesOffset++] = 0.5;
    vertices[verticesOffset++] = 0.5;

    // Position
    vertices[verticesOffset++] = 0;
    vertices[verticesOffset++] = halfHeight;
    vertices[verticesOffset++] = 0;
    // Normal
    vertices[verticesOffset++] = 0;
    vertices[verticesOffset++] = 1;
    vertices[verticesOffset++] = 0;
    // Texcoord_0
    vertices[verticesOffset++] = 0.5;
    vertices[verticesOffset++] = 0.5;

    const bottom = torsoVerticesCount;
    const top = torsoVerticesCount + 1;
    const offset = heightSegments * radialSegments + 1;
    const stride = radialSegments * 3;
    for (let i = 0; i < radialSegments; ++i) {
      const secondOffset = indicesOffset + 1;
      const thirdOffset = indicesOffset + 2;

      // bottom
      indices[stride + indicesOffset] = bottom;
      indices[stride + secondOffset] = i + 1;
      indices[stride + thirdOffset] = i;

      // top
      const temp = offset + i;
      indices[indicesOffset] = top;
      indices[secondOffset] = temp;
      indices[thirdOffset] = temp + 1;

      indicesOffset += 3;
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
