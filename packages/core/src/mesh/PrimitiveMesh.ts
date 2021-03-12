import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { Mesh } from "../graphic/Mesh";
import { VertexElement } from "../graphic/VertexElement";
import { GLCapabilityType } from "../base/Constant";

/**
 * Used to generate common primitve meshes.
 */
export class PrimitiveMesh {
  /** The max number of indices that Uint16Array can support. */
  private static _uint16VertexLimit: number = 65535;

  /**
   * Create a sphere mesh.
   * @param engine - Engine
   * @param radius - Sphere radius
   * @param segments - Number of segments
   * @returns Sphere mesh
   */
  static createSphere(engine: Engine, radius: number = 0.5, segments: number = 12): Mesh {
    const mesh = new Mesh(engine);
    segments = Math.max(2, Math.floor(segments));

    const count = segments + 1;
    const vertexCount = count * count;
    const vertices = new Float32Array(vertexCount * 8);
    const rectangleCount = segments * segments;
    let indices: Uint16Array | Uint32Array = null;
    let useUint32: boolean = false;
    if (vertexCount > PrimitiveMesh._uint16VertexLimit) {
      if (engine.renderhardware.canIUse(GLCapabilityType.elementIndexUint)) {
        useUint32 = true;
        indices = new Uint32Array(rectangleCount * 6);
      } else {
        throw Error("The vertex count is over limit.");
      }
    } else {
      indices = new Uint16Array(rectangleCount * 6);
    }
    const thetaRange = Math.PI;
    const alphaRange = thetaRange * 2;
    const countReciprocal = 1.0 / count;
    const segmentsReciprocal = 1.0 / segments;

    let offset = 0;
    for (let i = 0; i < vertexCount; ++i) {
      const x = i % count;
      const y = (i * countReciprocal) | 0;
      const u = x * segmentsReciprocal;
      const v = y * segmentsReciprocal;
      const alphaDelta = u * alphaRange;
      const thetaDelta = v * thetaRange;
      const sinTheta = Math.sin(thetaDelta);

      let posX = -radius * Math.cos(alphaDelta) * sinTheta;
      let posY = radius * Math.cos(thetaDelta);
      let posZ = radius * Math.sin(alphaDelta) * sinTheta;

      // Position
      vertices[offset++] = posX;
      vertices[offset++] = posY;
      vertices[offset++] = posZ;
      // Normal
      vertices[offset++] = posX;
      vertices[offset++] = posY;
      vertices[offset++] = posZ;
      // Texcoord
      vertices[offset++] = u;
      vertices[offset++] = v;
    }

    offset = 0;
    for (let i = 0; i < rectangleCount; ++i) {
      const x = i % segments;
      const y = (i * segmentsReciprocal) | 0;

      const a = y * count + x;
      const b = a + 1;
      const c = a + count;
      const d = c + 1;

      indices[offset++] = b;
      indices[offset++] = a;
      indices[offset++] = d;
      indices[offset++] = a;
      indices[offset++] = c;
      indices[offset++] = d;
    }

    const { bounds } = mesh;
    bounds.min.setValue(-radius, -radius, -radius);
    bounds.max.setValue(radius, radius, radius);

    PrimitiveMesh._initialize(engine, mesh, vertices, indices, useUint32);
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

    const vertices = new Float32Array(192);

    // prettier-ignore
    // Up
    vertices[0] = -halfWidth, vertices[1] = halfHeight, vertices[2] = -halfDepth, vertices[3] = 0, vertices[4] = 1, vertices[5] = 0, vertices[6] = 0, vertices[7] = 0,
    vertices[8] = halfWidth, vertices[9] = halfHeight, vertices[10] = -halfDepth, vertices[11] = 0, vertices[12] = 1, vertices[13] = 0, vertices[14] = 1, vertices[15] = 0,
    vertices[16] = halfWidth, vertices[17] = halfHeight, vertices[18] = halfDepth, vertices[19] = 0, vertices[20] = 1, vertices[21] = 0, vertices[22] = 1, vertices[23] = 1,
    vertices[24] = -halfWidth, vertices[25] = halfHeight, vertices[26] = halfDepth, vertices[27] = 0, vertices[28] = 1, vertices[29] = 0, vertices[30] = 0, vertices[31] = 1,
    // Down
    vertices[32] = -halfWidth, vertices[33] = -halfHeight, vertices[34] = -halfDepth, vertices[35] = 0, vertices[36] = -1, vertices[37] = 0, vertices[38] = 0, vertices[39] = 1,
    vertices[40] = halfWidth, vertices[41] = -halfHeight, vertices[42] = -halfDepth, vertices[43] = 0, vertices[44] = -1, vertices[45] = 0, vertices[46] = 1, vertices[47] = 1,
    vertices[48] = halfWidth, vertices[49] = -halfHeight, vertices[50] = halfDepth, vertices[51] = 0, vertices[52] = -1, vertices[53] = 0, vertices[54] = 1, vertices[55] = 0,
    vertices[56] = -halfWidth, vertices[57] = -halfHeight, vertices[58] = halfDepth, vertices[59] = 0, vertices[60] = -1, vertices[61] = 0, vertices[62] = 0, vertices[63] = 0,
    // Left
    vertices[64] = -halfWidth, vertices[65] = halfHeight, vertices[66] = -halfDepth, vertices[67] = -1, vertices[68] = 0, vertices[69] = 0, vertices[70] = 0, vertices[71] = 0,
    vertices[72] = -halfWidth, vertices[73] = halfHeight, vertices[74] = halfDepth, vertices[75] = -1, vertices[76] = 0, vertices[77] = 0, vertices[78] = 1, vertices[79] = 0,
    vertices[80] = -halfWidth, vertices[81] = -halfHeight, vertices[82] = halfDepth, vertices[83] = -1, vertices[84] = 0, vertices[85] = 0, vertices[86] = 1, vertices[87] = 1,
    vertices[88] = -halfWidth, vertices[89] = -halfHeight, vertices[90] = -halfDepth, vertices[91] = -1, vertices[92] = 0, vertices[93] = 0, vertices[94] = 0, vertices[95] = 1,
    // Right
    vertices[96] = halfWidth, vertices[97] = halfHeight, vertices[98] = -halfDepth, vertices[99] = 1, vertices[100] = 0, vertices[101] = 0, vertices[102] = 1, vertices[103] = 0,
    vertices[104] = halfWidth, vertices[105] = halfHeight, vertices[106] = halfDepth, vertices[107] = 1, vertices[108] = 0, vertices[109] = 0, vertices[110] = 0, vertices[111] = 0,
    vertices[112] = halfWidth, vertices[113] = -halfHeight, vertices[114] = halfDepth, vertices[115] = 1, vertices[116] = 0, vertices[117] = 0, vertices[118] = 0, vertices[119] = 1,
    vertices[120] = halfWidth, vertices[121] = -halfHeight, vertices[122] = -halfDepth, vertices[123] = 1, vertices[124] = 0, vertices[125] = 0, vertices[126] = 1, vertices[127] = 1,
    // Front
    vertices[128] = -halfWidth, vertices[129] = halfHeight, vertices[130] = halfDepth, vertices[131] = 0, vertices[132] = 0, vertices[133] = 1, vertices[134] = 0, vertices[135] = 0,
    vertices[136] = halfWidth, vertices[137] = halfHeight, vertices[138] = halfDepth, vertices[139] = 0, vertices[140] = 0, vertices[141] = 1, vertices[142] = 1, vertices[143] = 0,
    vertices[144] = halfWidth, vertices[145] = -halfHeight, vertices[146] = halfDepth, vertices[147] = 0, vertices[148] = 0, vertices[149] = 1, vertices[150] = 1, vertices[151] = 1,
    vertices[152] = -halfWidth, vertices[153] = -halfHeight, vertices[154] = halfDepth, vertices[155] = 0, vertices[156] = 0, vertices[157] = 1, vertices[158] = 0, vertices[159] = 1,
    // Back
    vertices[160] = -halfWidth, vertices[161] = halfHeight, vertices[162] = -halfDepth, vertices[163] = 0, vertices[164] = 0, vertices[165] = -1, vertices[166] = 1, vertices[167] = 0,
    vertices[168] = halfWidth, vertices[169] = halfHeight, vertices[170] = -halfDepth, vertices[171] = 0, vertices[172] = 0, vertices[173] = -1, vertices[174] = 0, vertices[175] = 0,
    vertices[176] = halfWidth, vertices[177] = -halfHeight, vertices[178] = -halfDepth, vertices[179] = 0, vertices[180] = 0, vertices[181] = -1, vertices[182] = 0, vertices[183] = 1,
    vertices[184] = -halfWidth, vertices[185] = -halfHeight, vertices[186] = -halfDepth, vertices[187] = 0, vertices[188] = 0, vertices[189] = -1, vertices[190] = 1, vertices[191] = 1;

    const indices = new Uint16Array(36);

    // prettier-ignore
    // Up
    indices[0] = 0, indices[1] = 2, indices[2] = 1, indices[3] = 2, indices[4] = 0, indices[5] = 3,
    // Down
    indices[6] = 4, indices[7] = 6, indices[8] = 7, indices[9] = 6, indices[10] = 4, indices[11] = 5,
    // Left
    indices[12] = 8, indices[13] = 10, indices[14] = 9, indices[15] = 10, indices[16] = 8, indices[17] = 11,
    // Right
    indices[18] = 12, indices[19] = 14, indices[20] = 15, indices[21] = 14, indices[22] = 12, indices[23] = 13,
    // Front
    indices[24] = 16, indices[25] = 18, indices[26] = 17, indices[27] = 18, indices[28] = 16, indices[29] = 19,
    // Back
    indices[30] = 20, indices[31] = 22, indices[32] = 23, indices[33] = 22, indices[34] = 20, indices[35] = 21;

    const { bounds } = mesh;
    bounds.min.setValue(-halfWidth, -halfHeight, -halfDepth);
    bounds.max.setValue(halfWidth, halfHeight, halfDepth);

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
    horizontalSegments = Math.max(1, Math.floor(horizontalSegments));
    verticalSegments = Math.max(1, Math.floor(verticalSegments));

    const horizontalCount = horizontalSegments + 1;
    const verticalCount = verticalSegments + 1;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const gridWidth = width / horizontalSegments;
    const gridHeight = height / verticalSegments;
    const vertexCount = horizontalCount * verticalCount;
    const vertices = new Float32Array(vertexCount * 8);
    const rectangleCount = verticalSegments * horizontalSegments;
    let indices: Uint16Array | Uint32Array = null;
    let useUint32: boolean = false;
    if (vertexCount > PrimitiveMesh._uint16VertexLimit) {
      if (engine.renderhardware.canIUse(GLCapabilityType.elementIndexUint)) {
        useUint32 = true;
        indices = new Uint32Array(rectangleCount * 6);
      } else {
        throw Error("The vertex count is over limit.");
      }
    } else {
      indices = new Uint16Array(rectangleCount * 6);
    }
    const horizontalCountReciprocal = 1.0 / horizontalCount;
    const horizontalSegmentsReciprocal = 1.0 / horizontalSegments;
    const verticalSegmentsReciprocal = 1.0 / verticalSegments;

    let offset = 0;
    for (let i = 0; i < vertexCount; ++i) {
      const x = i % horizontalCount;
      const y = (i * horizontalCountReciprocal) | 0;

      // Position
      vertices[offset++] = x * gridWidth - halfWidth;
      vertices[offset++] = y * gridHeight - halfHeight;
      vertices[offset++] = 0;
      // Normal
      vertices[offset++] = 0;
      vertices[offset++] = 0;
      vertices[offset++] = 1;
      // Texcoord
      vertices[offset++] = x * horizontalSegmentsReciprocal;
      vertices[offset++] = 1 - y * verticalSegmentsReciprocal;
    }

    offset = 0;
    for (let i = 0; i < rectangleCount; ++i) {
      const x = i % horizontalSegments;
      const y = (i * horizontalSegmentsReciprocal) | 0;

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

    const { bounds } = mesh;
    bounds.min.setValue(-halfWidth, -halfHeight, 0);
    bounds.max.setValue(halfWidth, halfHeight, 0);

    PrimitiveMesh._initialize(engine, mesh, vertices, indices, useUint32);
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
    radius: number = 0.5,
    height: number = 2,
    radialSegments: number = 20,
    heightSegments: number = 1
  ): Mesh {
    const mesh = new Mesh(engine);
    radialSegments = Math.floor(radialSegments);
    heightSegments = Math.floor(heightSegments);

    const radialCount = radialSegments + 1;
    const verticalCount = heightSegments + 1;
    const halfHeight = height * 0.5;
    const unitHeight = height / heightSegments;
    const torsoVertexCount = radialCount * verticalCount;
    const torsoRectangleCount = radialSegments * heightSegments;
    const capTriangleCount = radialSegments * 2;
    const totalVertexCount = torsoVertexCount + 2 + capTriangleCount;
    const vertices = new Float32Array(totalVertexCount * 8);
    let indices: Uint16Array | Uint32Array = null;
    let useUint32: boolean = false;
    if (totalVertexCount > PrimitiveMesh._uint16VertexLimit) {
      if (engine.renderhardware.canIUse(GLCapabilityType.elementIndexUint)) {
        useUint32 = true;
        indices = new Uint32Array(torsoRectangleCount * 6 + capTriangleCount * 3);
      } else {
        throw Error("The vertex count is over limit.");
      }
    } else {
      indices = new Uint16Array(torsoRectangleCount * 6 + capTriangleCount * 3);
    }
    const radialCountReciprocal = 1.0 / radialCount;
    const radialSegmentsReciprocal = 1.0 / radialSegments;
    const heightSegmentsReciprocal = 1.0 / heightSegments;

    let verticesOffset = 0;
    let indicesOffset = 0;

    // Create torso
    const thetaStart = Math.PI;
    const thetaRange = Math.PI * 2;
    for (let i = 0; i < torsoVertexCount; ++i) {
      const x = i % radialCount;
      const y = (i * radialCountReciprocal) | 0;
      const u = x * radialSegmentsReciprocal;
      const v = y * heightSegmentsReciprocal;
      const theta = thetaStart + u * thetaRange;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      let posX = radius * sinTheta;
      let posY = y * unitHeight - halfHeight;
      let posZ = radius * cosTheta;

      // Position
      vertices[verticesOffset++] = posX;
      vertices[verticesOffset++] = posY;
      vertices[verticesOffset++] = posZ;
      // Normal
      vertices[verticesOffset++] = sinTheta;
      vertices[verticesOffset++] = 0;
      vertices[verticesOffset++] = cosTheta;
      // Texcoord
      vertices[verticesOffset++] = u;
      vertices[verticesOffset++] = 1 - v;
    }

    for (let i = 0; i < torsoRectangleCount; ++i) {
      const x = i % radialSegments;
      const y = (i * radialSegmentsReciprocal) | 0;

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

    // Bottom position
    vertices[verticesOffset++] = 0;
    vertices[verticesOffset++] = -halfHeight;
    vertices[verticesOffset++] = 0;
    // Bottom normal
    vertices[verticesOffset++] = 0;
    vertices[verticesOffset++] = -1;
    vertices[verticesOffset++] = 0;
    // Bottom texcoord
    vertices[verticesOffset++] = 0.5;
    vertices[verticesOffset++] = 0.5;

    // Top position
    vertices[verticesOffset++] = 0;
    vertices[verticesOffset++] = halfHeight;
    vertices[verticesOffset++] = 0;
    // Top normal
    vertices[verticesOffset++] = 0;
    vertices[verticesOffset++] = 1;
    vertices[verticesOffset++] = 0;
    // Top texcoord
    vertices[verticesOffset++] = 0.5;
    vertices[verticesOffset++] = 0.5;

    // Add cap vertices
    const diameterReciprocal = 1.0 / (radius * 2);
    for (let i = 0; i < radialSegments; ++i) {
      const curVertexIndex = i * 8;
      const curPosX = vertices[curVertexIndex];
      const curPosZ = vertices[curVertexIndex + 2];
      const u = curPosX * diameterReciprocal + 0.5;
      const v = curPosZ * diameterReciprocal + 0.5;

      // Bottom position
      vertices[verticesOffset++] = curPosX;
      vertices[verticesOffset++] = -halfHeight;
      vertices[verticesOffset++] = curPosZ;
      // Bottom normal
      vertices[verticesOffset++] = 0;
      vertices[verticesOffset++] = -1;
      vertices[verticesOffset++] = 0;
      // Bottom texcoord
      vertices[verticesOffset++] = u;
      vertices[verticesOffset++] = 1 - v;

      // Top position
      vertices[verticesOffset++] = curPosX;
      vertices[verticesOffset++] = halfHeight;
      vertices[verticesOffset++] = curPosZ;
      // Top normal
      vertices[verticesOffset++] = 0;
      vertices[verticesOffset++] = 1;
      vertices[verticesOffset++] = 0;
      // Top texcoord
      vertices[verticesOffset++] = u;
      vertices[verticesOffset++] = v;
    }

    // Add cap indices
    const topCapIndex = torsoVertexCount + 1;
    const bottomIndiceIndex = torsoVertexCount + 2;
    const topIndiceIndex = bottomIndiceIndex + 1;
    for (let i = 0; i < radialSegments; ++i) {
      const firstStride = i * 2;
      const secondStride = i === radialSegments - 1 ? 0 : firstStride + 2;

      // Bottom
      indices[indicesOffset++] = torsoVertexCount;
      indices[indicesOffset++] = bottomIndiceIndex + secondStride;
      indices[indicesOffset++] = bottomIndiceIndex + firstStride;

      // Top
      indices[indicesOffset++] = topCapIndex;
      indices[indicesOffset++] = topIndiceIndex + firstStride;
      indices[indicesOffset++] = topIndiceIndex + secondStride;
    }

    const { bounds } = mesh;
    bounds.min.setValue(-radius, -halfHeight, -radius);
    bounds.max.setValue(radius, halfHeight, radius);

    PrimitiveMesh._initialize(engine, mesh, vertices, indices, useUint32);
    return mesh;
  }

  private static _initialize(
    engine: Engine,
    mesh: Mesh,
    vertices: Float32Array,
    indices: Uint16Array | Uint32Array,
    useUint32: boolean = false
  ) {
    const vertexStride = 32;
    const vertexElements = [
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("NORMAL", 12, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 24, VertexElementFormat.Vector2, 0)
    ];

    const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices, BufferUsage.Static);
    const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Static);

    mesh.setVertexBufferBinding(vertexBuffer, vertexStride);
    mesh.setIndexBufferBinding(indexBuffer, useUint32 ? IndexFormat.UInt32 : IndexFormat.UInt16);
    mesh.setVertexElements(vertexElements);
    mesh.addSubMesh(0, indices.length);
  }
}
