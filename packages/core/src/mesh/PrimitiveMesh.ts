import { Vector2, Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { GLCapabilityType } from "../base/Constant";
import { BufferBindFlag, BufferUsage, VertexElement, VertexElementFormat } from "../graphic";
import { Buffer } from "../graphic/Buffer";
import { ModelMesh } from "./ModelMesh";
import {
  CapsuleRestoreInfo,
  ConeRestoreInfo,
  CuboidRestoreInfo,
  CylinderRestoreInfo,
  PlaneRestoreInfo,
  PrimitiveMeshRestorer,
  SphereRestoreInfo,
  TorusRestoreInfo
} from "./PrimitiveMeshRestorer";
import { VertexAttribute } from "./enums/VertexAttribute";

/**
 * Used to generate common primitive meshes.
 */
export class PrimitiveMesh {
  private static _tempVec30: Vector3 = new Vector3();

  /**
   * Create a sphere mesh.
   * @param engine - Engine
   * @param radius - Sphere radius
   * @param step - Number of subdiv steps
   * @param noLongerAccessible - No longer access the vertices of the mesh after creation
   * @returns Sphere model mesh
   */
  static createSphere(
    engine: Engine,
    radius: number = 1,
    step: number = 3,
    noLongerAccessible: boolean = true
  ): ModelMesh {
    const sphereMesh = new ModelMesh(engine);
    PrimitiveMesh._setSphereData(sphereMesh, radius, step, noLongerAccessible, false);

    const vertexBuffer = sphereMesh.vertexBufferBindings[0].buffer;
    engine.resourceManager.addContentRestorer(
      new PrimitiveMeshRestorer(sphereMesh, new SphereRestoreInfo(radius, step, vertexBuffer, noLongerAccessible))
    );
    return sphereMesh;
  }

  /**
   * Create a cuboid mesh.
   * @param engine - Engine
   * @param width - Cuboid width
   * @param height - Cuboid height
   * @param depth - Cuboid depth
   * @param noLongerAccessible - No longer access the vertices of the mesh after creation
   * @returns Cuboid model mesh
   */
  static createCuboid(
    engine: Engine,
    width: number = 1,
    height: number = 1,
    depth: number = 1,
    noLongerAccessible: boolean = true
  ): ModelMesh {
    const mesh = new ModelMesh(engine);
    PrimitiveMesh._setCuboidData(mesh, width, height, depth, noLongerAccessible, false);

    const vertexBuffer = mesh.vertexBufferBindings[0].buffer;
    engine.resourceManager.addContentRestorer(
      new PrimitiveMeshRestorer(mesh, new CuboidRestoreInfo(width, height, depth, vertexBuffer, noLongerAccessible))
    );
    return mesh;
  }

  /**
   * Create a plane mesh.
   * @param engine - Engine
   * @param width - Plane width
   * @param height - Plane height
   * @param horizontalSegments - Plane horizontal segments
   * @param verticalSegments - Plane vertical segments
   * @param noLongerAccessible - No longer access the vertices of the mesh after creation
   * @returns Plane model mesh
   */
  static createPlane(
    engine: Engine,
    width: number = 1,
    height: number = 1,
    horizontalSegments: number = 1,
    verticalSegments: number = 1,
    noLongerAccessible: boolean = true
  ): ModelMesh {
    const mesh = new ModelMesh(engine);
    PrimitiveMesh._setPlaneData(mesh, width, height, horizontalSegments, verticalSegments, noLongerAccessible, false);

    const vertexBuffer = mesh.vertexBufferBindings[0].buffer;
    engine.resourceManager.addContentRestorer(
      new PrimitiveMeshRestorer(
        mesh,
        new PlaneRestoreInfo(width, height, horizontalSegments, verticalSegments, vertexBuffer, noLongerAccessible)
      )
    );
    return mesh;
  }

  /**
   * Create a cylinder mesh.
   * @param engine - Engine
   * @param radiusTop - The radius of top cap
   * @param radiusBottom - The radius of bottom cap
   * @param height - The height of torso
   * @param radialSegments - Cylinder radial segments
   * @param heightSegments - Cylinder height segments
   * @param noLongerAccessible - No longer access the vertices of the mesh after creation
   * @returns Cylinder model mesh
   */
  static createCylinder(
    engine: Engine,
    radiusTop: number = 0.5,
    radiusBottom: number = 0.5,
    height: number = 2,
    radialSegments: number = 20,
    heightSegments: number = 1,
    noLongerAccessible: boolean = true
  ): ModelMesh {
    const mesh = new ModelMesh(engine);
    PrimitiveMesh._setCylinderData(
      mesh,
      radiusTop,
      radiusBottom,
      height,
      radialSegments,
      heightSegments,
      noLongerAccessible,
      false
    );

    const vertexBuffer = mesh.vertexBufferBindings[0].buffer;
    engine.resourceManager.addContentRestorer(
      new PrimitiveMeshRestorer(
        mesh,
        new CylinderRestoreInfo(
          radiusTop,
          radiusBottom,
          height,
          radialSegments,
          heightSegments,
          vertexBuffer,
          noLongerAccessible
        )
      )
    );
    return mesh;
  }

  /**
   * Create a torus mesh.
   * @param engine - Engine
   * @param radius - Torus radius
   * @param tubeRadius - Torus tube
   * @param radialSegments - Torus radial segments
   * @param tubularSegments - Torus tubular segments
   * @param arc - Central angle
   * @param noLongerAccessible - No longer access the vertices of the mesh after creation
   * @returns Torus model mesh
   */
  static createTorus(
    engine: Engine,
    radius: number = 0.5,
    tubeRadius: number = 0.1,
    radialSegments: number = 30,
    tubularSegments: number = 30,
    arc: number = 360,
    noLongerAccessible: boolean = true
  ): ModelMesh {
    const mesh = new ModelMesh(engine);
    PrimitiveMesh._setTorusData(
      mesh,
      radius,
      tubeRadius,
      radialSegments,
      tubularSegments,
      arc,
      noLongerAccessible,
      false
    );

    const vertexBuffer = mesh.vertexBufferBindings[0].buffer;
    engine.resourceManager.addContentRestorer(
      new PrimitiveMeshRestorer(
        mesh,
        new TorusRestoreInfo(radius, tubeRadius, radialSegments, tubularSegments, arc, vertexBuffer, noLongerAccessible)
      )
    );
    return mesh;
  }

  /**
   * Create a cone mesh.
   * @param engine - Engine
   * @param radius - The radius of cap
   * @param height - The height of torso
   * @param radialSegments - Cone radial segments
   * @param heightSegments - Cone height segments
   * @param noLongerAccessible - No longer access the vertices of the mesh after creation
   * @returns Cone model mesh
   */
  static createCone(
    engine: Engine,
    radius: number = 0.5,
    height: number = 2,
    radialSegments: number = 20,
    heightSegments: number = 1,
    noLongerAccessible: boolean = true
  ): ModelMesh {
    const mesh = new ModelMesh(engine);
    PrimitiveMesh._setConeData(mesh, radius, height, radialSegments, heightSegments, noLongerAccessible, false);

    const vertexBuffer = mesh.vertexBufferBindings[0].buffer;
    engine.resourceManager.addContentRestorer(
      new PrimitiveMeshRestorer(
        mesh,
        new ConeRestoreInfo(radius, height, radialSegments, heightSegments, vertexBuffer, noLongerAccessible)
      )
    );
    return mesh;
  }

  /**
   * Create a capsule mesh.
   * @param engine - Engine
   * @param radius - The radius of the two hemispherical ends
   * @param height - The height of the cylindrical part, measured between the centers of the hemispherical ends
   * @param radialSegments - Hemispherical end radial segments
   * @param heightSegments - Cylindrical part height segments
   * @param noLongerAccessible - No longer access the vertices of the mesh after creation
   * @returns Capsule model mesh
   */
  static createCapsule(
    engine: Engine,
    radius: number = 0.5,
    height: number = 2,
    radialSegments: number = 6,
    heightSegments: number = 1,
    noLongerAccessible: boolean = true
  ): ModelMesh {
    const mesh = new ModelMesh(engine);
    PrimitiveMesh._setCapsuleData(mesh, radius, height, radialSegments, heightSegments, noLongerAccessible, false);

    const vertexBuffer = mesh.vertexBufferBindings[0].buffer;
    engine.resourceManager.addContentRestorer(
      new PrimitiveMeshRestorer(
        mesh,
        new CapsuleRestoreInfo(radius, height, radialSegments, heightSegments, vertexBuffer, noLongerAccessible)
      )
    );
    return mesh;
  }

  /**
   * @internal
   */
  static _setSphereData(
    sphereMesh: ModelMesh,
    radius: number,
    step: number,
    noLongerAccessible: boolean,
    isRestoreMode: boolean,
    restoreVertexBuffer?: Buffer
  ): void {
    step = Math.max(1, Math.floor(step));

    const normals: Vector3[] = [];
    const uvs: Vector2[] = [];

    let { positions, cells } = PrimitiveMesh._subdivCatmullClark(step);

    // get normals, uvs, and scale to radius
    for (let i = 0; i < positions.length; i++) {
      normals[i] = new Vector3().copyFrom(positions[i]);
      normals[i].normalize();

      positions[i].copyFrom(normals[i]).scale(radius);

      let theta = Math.atan2(normals[i].z, normals[i].x);
      let phi = Math.acos(normals[i].y / normals[i].length());
      uvs[i] = new Vector2((Math.PI - theta) / (2 * Math.PI), phi / Math.PI);
    }

    // get indices
    const indices = PrimitiveMesh._generateIndices(sphereMesh.engine, positions.length, cells.length * 6);

    let offset = 0;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];

      indices[offset++] = cell[0];
      indices[offset++] = cell[1];
      indices[offset++] = cell[2];

      indices[offset++] = cell[0];
      indices[offset++] = cell[2];
      indices[offset++] = cell[3];
    }

    // solve texture seam problem due to vertex sharing
    PrimitiveMesh._computeFlippedVertex(positions, uvs, normals, indices);
    PrimitiveMesh._computePolesVertex(positions, uvs, normals, indices);

    if (!isRestoreMode) {
      const { bounds } = sphereMesh;
      bounds.min.set(-radius, -radius, -radius);
      bounds.max.set(radius, radius, radius);
    }

    const vertices = new Float32Array(8 * positions.length);

    for (let i = 0; i < positions.length; i++) {
      vertices[i * 8] = positions[i].x;
      vertices[i * 8 + 1] = positions[i].y;
      vertices[i * 8 + 2] = positions[i].z;

      vertices[i * 8 + 3] = normals[i].x;
      vertices[i * 8 + 4] = normals[i].y;
      vertices[i * 8 + 5] = normals[i].z;

      vertices[i * 8 + 6] = uvs[i].x;
      vertices[i * 8 + 7] = uvs[i].y;
    }

    PrimitiveMesh._initialize(sphereMesh, vertices, indices, noLongerAccessible, isRestoreMode, restoreVertexBuffer);
  }

  /**
   * @internal
   */
  static _subdivCatmullClark(step: number): {
    cells: number[][];
    positions: Vector3[];
  } {
    let cells = [
      [0, 1, 2, 3],
      [3, 2, 4, 5],
      [5, 4, 6, 7],
      [7, 0, 3, 5],
      [7, 6, 1, 0],
      [6, 4, 2, 1]
    ];
    let vertices = [
      new Vector3(-1, 1, 1),
      new Vector3(-1, -1, 1),
      new Vector3(1, -1, 1),
      new Vector3(1, 1, 1),
      new Vector3(1, -1, -1),
      new Vector3(1, 1, -1),
      new Vector3(-1, -1, -1),
      new Vector3(-1, 1, -1)
    ];
    let maxLength = 0;

    const tempVec0 = new Vector3();
    const tempVec1 = new Vector3();
    const tempVec2 = new Vector3();
    const tempVec3 = new Vector3();

    const getIndex = (vertex: Vector3): number => {
      const idx = vertices.findIndex((value) => Vector3.equals(value, vertex));
      return idx > -1 ? idx : vertices.push(vertex) - 1;
    };

    for (let i = 0; i < step; i++) {
      let points: Array<IPoint> = [];
      let edges: Array<IEdge> = [];
      let faces: Array<IFace> = [];

      // get cell faces
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];

        faces[i] = {
          facePoint: new Vector3(),
          vertices: [],
          edges: []
        };

        // get cell points
        for (let j = 0; j < cell.length; j++) {
          const idx = cell[j];
          const vertex = vertices[idx];

          if (!points[idx]) {
            const point: IPoint = {
              position: vertex,
              newPosition: new Vector3(),
              facePoint: [],
              edgeMidPoint: []
            };
            points[idx] = point;
          }
          points[idx].facePoint.push(i);

          faces[i].vertices.push(idx);
          faces[i].facePoint.add(vertex);
        }

        // get cell face's facePoint
        faces[i].facePoint.scale(1 / cell.length);

        // get cell edges
        for (let j = 0; j < cell.length; j++) {
          const vertexIdxA = cell[j];
          const vertexIdxB = cell[(j + 1) % cell.length];
          const edgeIdxKey = [vertexIdxA, vertexIdxB].sort().toString();

          if (!edges[edgeIdxKey]) {
            const edge: IEdge = {
              midPoint: new Vector3(),
              edgePoint: new Vector3(),
              faces: []
            };

            Vector3.add(vertices[vertexIdxA], vertices[vertexIdxB], edge.midPoint);
            edge.midPoint.scale(0.5);

            points[vertexIdxA].edgeMidPoint.push(edgeIdxKey);
            points[vertexIdxB].edgeMidPoint.push(edgeIdxKey);

            edges[edgeIdxKey] = edge;
          }

          edges[edgeIdxKey].faces.push(i);
          faces[i].edges.push(edgeIdxKey);
        }
      }

      // get edges' edgePoint
      for (const key in edges) {
        const edge = edges[key];

        for (let j = 0; j < edge.faces.length; j++) {
          const curFace = faces[edge.faces[j]];
          edge.edgePoint.add(curFace.facePoint);
        }
        edge.edgePoint.scale(0.5);
        edge.edgePoint.add(edge.midPoint);
        edge.edgePoint.scale(0.5);
      }

      // get points' newPosition, and new Position's max length
      for (let i = 0; i < points.length; i++) {
        const curPoint = points[i];

        const n = curPoint.facePoint.length;
        const m1 = (n - 3) / n;
        const m2 = 1 / n;
        const m3 = 2 / n;

        tempVec1.copyFrom(curPoint.position);
        tempVec2.copyFrom(tempVec0);
        tempVec3.copyFrom(tempVec0);

        curPoint.facePoint.map((value) => {
          tempVec2.add(faces[value].facePoint);
        });
        tempVec2.scale(1 / curPoint.facePoint.length);

        curPoint.edgeMidPoint.map((value) => {
          tempVec3.add(edges[value].midPoint);
        });
        tempVec3.scale(1 / curPoint.edgeMidPoint.length);

        Vector3.add(tempVec1.scale(m1), tempVec2.scale(m2), curPoint.newPosition);
        Vector3.add(curPoint.newPosition, tempVec3.scale(m3), curPoint.newPosition);
      }

      // get updated cells and vertices

      (cells = []), (vertices = []);
      for (let i = 0; i < faces.length; i++) {
        const curFace = faces[i];

        for (let j = 0; j < curFace.vertices.length; j++) {
          const curPoint = curFace.vertices[j];

          const a = points[curPoint].newPosition;
          const b = edges[curFace.edges[j % 4]].edgePoint;
          const c = curFace.facePoint;
          const d = edges[curFace.edges[(j + 3) % 4]].edgePoint;

          const ia = getIndex(a);
          const ib = getIndex(b);
          const ic = getIndex(c);
          const id = getIndex(d);
          cells.push([ia, ib, ic, id]);
        }
      }
    }

    return { cells, positions: vertices };
  }

  /**
   * @internal
   * Duplicate vertices whose uv normal is flipped and adjust their UV coordinates.
   */
  static _computeFlippedVertex(
    positions: Array<Vector3>,
    uvs: Array<Vector2>,
    normals: Array<Vector3>,
    indices: Uint16Array | Uint32Array
  ): void {
    const flippedVertex: Set<number> = new Set();
    const tempVec1 = new Vector3();
    const tempVec2 = new Vector3();
    const tempVec3 = new Vector3();
    const tempVec4 = new Vector3();
    const tempVec5 = new Vector3();

    for (let i = 0; i < indices.length / 3; i++) {
      const m1 = indices[i * 3];
      const m2 = indices[i * 3 + 1];
      const m3 = indices[i * 3 + 2];

      tempVec1.set(uvs[m1].x, uvs[m1].y, 0);
      tempVec2.set(uvs[m2].x, uvs[m2].y, 0);
      tempVec3.set(uvs[m3].x, uvs[m3].y, 0);

      // ab side of this triangle
      Vector3.subtract(tempVec2, tempVec1, tempVec4);
      // ac side of this triangle
      Vector3.subtract(tempVec3, tempVec1, tempVec5);
      // uv's normal of this triangle
      Vector3.cross(tempVec4, tempVec5, tempVec4);

      // direction reversed triangle
      if (tempVec4.z > 0) {
        for (let j = 0; j < 3; j++) {
          const e = indices[i * 3 + j];
          if (uvs[e].x === 0) {
            if (!flippedVertex[e]) {
              positions.push(positions[e]);
              uvs.push(new Vector2(uvs[e].x + 1, uvs[e].y));
              normals.push(normals[e]);

              flippedVertex[e] = positions.length - 1;
            }
            indices[i * 3 + j] = flippedVertex[e];
          }
        }
      }
    }
  }

  /**
   * @internal
   * Duplicate vertices at the poles and adjust their UV coordinates.
   */
  static _computePolesVertex(
    positions: Array<Vector3>,
    uvs: Array<Vector2>,
    normals: Array<Vector3>,
    indices: Uint16Array | Uint32Array
  ): void {
    const verticesAtPole = new Set();
    for (let i = 0; i < uvs.length; i++) {
      const uv = uvs[i];
      if (uv.y === 0 || uv.y === 1) {
        verticesAtPole.add(i);
      }
    }

    for (let i = 0; i < indices.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        const index = indices[i + j];

        if (verticesAtPole.has(index)) {
          positions.push(positions[index]);
          normals.push(normals[index]);

          const uv = new Vector2();

          uv.x = (uvs[indices[i]].x + uvs[indices[i + 1]].x + uvs[indices[i + 2]].x - 0.5) / 2;
          uv.y = uvs[index].y;

          uvs.push(uv);

          // Update the index
          indices[i + j] = positions.length - 1;
        }
      }
    }
  }

  /**
   * @internal
   */
  static _setCuboidData(
    cuboidMesh: ModelMesh,
    width: number,
    height: number,
    depth: number,
    noLongerAccessible: boolean,
    isRestoreMode: boolean,
    restoreVertexBuffer?: Buffer
  ): void {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const halfDepth = depth / 2;

    const vertexFloatCount = 8;
    const vertices = new Float32Array(24 * vertexFloatCount);

    // Up
    (vertices[0] = -halfWidth), (vertices[1] = halfHeight), (vertices[2] = -halfDepth);
    (vertices[6] = 0), (vertices[7] = 0);
    (vertices[8] = halfWidth), (vertices[9] = halfHeight), (vertices[10] = -halfDepth);
    (vertices[14] = 1), (vertices[15] = 0);
    (vertices[16] = halfWidth), (vertices[17] = halfHeight), (vertices[18] = halfDepth);
    (vertices[22] = 1), (vertices[23] = 1);
    (vertices[24] = -halfWidth), (vertices[25] = halfHeight), (vertices[26] = halfDepth);
    (vertices[30] = 0), (vertices[31] = 1);
    for (let i = 0; i < 4; i++) {
      let normalOffset = vertexFloatCount * i + 3;
      (vertices[normalOffset++] = 0), (vertices[normalOffset++] = 1), (vertices[normalOffset++] = 0);
    }

    // Down
    (vertices[32] = -halfWidth), (vertices[33] = -halfHeight), (vertices[34] = -halfDepth);
    (vertices[38] = 0), (vertices[39] = 1);
    (vertices[40] = halfWidth), (vertices[41] = -halfHeight), (vertices[42] = -halfDepth);
    (vertices[46] = 1), (vertices[47] = 1);
    (vertices[48] = halfWidth), (vertices[49] = -halfHeight), (vertices[50] = halfDepth);
    (vertices[54] = 1), (vertices[55] = 0);
    (vertices[56] = -halfWidth), (vertices[57] = -halfHeight), (vertices[58] = halfDepth);
    (vertices[62] = 0), (vertices[63] = 0);
    for (let i = 0; i < 4; i++) {
      let normalOffset = vertexFloatCount * i + 35;
      (vertices[normalOffset++] = 0), (vertices[normalOffset++] = -1), (vertices[normalOffset++] = 0);
    }

    // Left
    (vertices[64] = -halfWidth), (vertices[65] = halfHeight), (vertices[66] = -halfDepth);
    (vertices[70] = 0), (vertices[71] = 0);
    (vertices[72] = -halfWidth), (vertices[73] = halfHeight), (vertices[74] = halfDepth);
    (vertices[78] = 1), (vertices[79] = 0);
    (vertices[80] = -halfWidth), (vertices[81] = -halfHeight), (vertices[82] = halfDepth);
    (vertices[86] = 1), (vertices[87] = 1);
    (vertices[88] = -halfWidth), (vertices[89] = -halfHeight), (vertices[90] = -halfDepth);
    (vertices[94] = 0), (vertices[95] = 1);
    for (let i = 0; i < 4; i++) {
      let normalOffset = vertexFloatCount * i + 67;
      (vertices[normalOffset++] = -1), (vertices[normalOffset++] = 0), (vertices[normalOffset++] = 0);
    }

    // Right
    (vertices[96] = halfWidth), (vertices[97] = halfHeight), (vertices[98] = -halfDepth);
    (vertices[102] = 1), (vertices[103] = 0);
    (vertices[104] = halfWidth), (vertices[105] = halfHeight), (vertices[106] = halfDepth);
    (vertices[110] = 0), (vertices[111] = 0);
    (vertices[112] = halfWidth), (vertices[113] = -halfHeight), (vertices[114] = halfDepth);
    (vertices[118] = 0), (vertices[119] = 1);
    (vertices[120] = halfWidth), (vertices[121] = -halfHeight), (vertices[122] = -halfDepth);
    (vertices[126] = 1), (vertices[127] = 1);
    for (let i = 0; i < 4; i++) {
      let normalOffset = vertexFloatCount * i + 99;
      (vertices[normalOffset++] = 1), (vertices[normalOffset++] = 0), (vertices[normalOffset++] = 0);
    }

    // Front
    (vertices[128] = -halfWidth), (vertices[129] = halfHeight), (vertices[130] = halfDepth);
    (vertices[134] = 0), (vertices[135] = 0);
    (vertices[136] = halfWidth), (vertices[137] = halfHeight), (vertices[138] = halfDepth);
    (vertices[142] = 1), (vertices[143] = 0);
    (vertices[144] = halfWidth), (vertices[145] = -halfHeight), (vertices[146] = halfDepth);
    (vertices[150] = 1), (vertices[151] = 1);
    (vertices[152] = -halfWidth), (vertices[153] = -halfHeight), (vertices[154] = halfDepth);
    (vertices[158] = 0), (vertices[159] = 1);
    for (let i = 0; i < 4; i++) {
      let normalOffset = vertexFloatCount * i + 131;
      (vertices[normalOffset++] = 0), (vertices[normalOffset++] = 0), (vertices[normalOffset++] = 1);
    }

    // Back
    (vertices[160] = -halfWidth), (vertices[161] = halfHeight), (vertices[162] = -halfDepth);
    (vertices[166] = 1), (vertices[167] = 0);
    (vertices[168] = halfWidth), (vertices[169] = halfHeight), (vertices[170] = -halfDepth);
    (vertices[174] = 0), (vertices[175] = 0);
    (vertices[176] = halfWidth), (vertices[177] = -halfHeight), (vertices[178] = -halfDepth);
    (vertices[182] = 0), (vertices[183] = 1);
    (vertices[184] = -halfWidth), (vertices[185] = -halfHeight), (vertices[186] = -halfDepth);
    (vertices[190] = 1), (vertices[191] = 1);
    for (let i = 0; i < 4; i++) {
      let normalOffset = vertexFloatCount * i + 163;
      (vertices[normalOffset++] = 0), (vertices[normalOffset++] = 0), (vertices[normalOffset++] = -1);
    }

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

    if (!isRestoreMode) {
      const { bounds } = cuboidMesh;
      bounds.min.set(-halfWidth, -halfHeight, -halfDepth);
      bounds.max.set(halfWidth, halfHeight, halfDepth);
    }
    PrimitiveMesh._initialize(cuboidMesh, vertices, indices, noLongerAccessible, isRestoreMode, restoreVertexBuffer);
  }

  /**
   * @internal
   */
  static _setPlaneData(
    planeMesh: ModelMesh,
    width: number,
    height: number,
    horizontalSegments: number,
    verticalSegments: number,
    noLongerAccessible: boolean,
    isRestoreMode: boolean,
    restoreVertexBuffer?: Buffer
  ): void {
    horizontalSegments = Math.max(1, Math.floor(horizontalSegments));
    verticalSegments = Math.max(1, Math.floor(verticalSegments));

    const horizontalCount = horizontalSegments + 1;
    const verticalCount = verticalSegments + 1;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const gridWidth = width / horizontalSegments;
    const gridHeight = height / verticalSegments;
    const vertexCount = horizontalCount * verticalCount;
    const rectangleCount = verticalSegments * horizontalSegments;
    const indices = PrimitiveMesh._generateIndices(planeMesh.engine, vertexCount, rectangleCount * 6);
    const horizontalCountReciprocal = 1.0 / horizontalCount;
    const horizontalSegmentsReciprocal = 1.0 / horizontalSegments;
    const verticalSegmentsReciprocal = 1.0 / verticalSegments;

    const vertexFloatCount = 8;
    const vertices = new Float32Array(vertexCount * vertexFloatCount);

    for (let i = 0; i < vertexCount; ++i) {
      const x = i % horizontalCount;
      const z = (i * horizontalCountReciprocal) | 0;

      let offset = i * vertexFloatCount;
      // Position
      vertices[offset++] = x * gridWidth - halfWidth;
      vertices[offset++] = 0;
      vertices[offset++] = z * gridHeight - halfHeight;
      // Normal
      vertices[offset++] = 0;
      vertices[offset++] = 1;
      vertices[offset++] = 0;
      // TexCoord
      vertices[offset++] = x * horizontalSegmentsReciprocal;
      vertices[offset++] = z * verticalSegmentsReciprocal;
    }

    let offset = 0;
    for (let i = 0; i < rectangleCount; ++i) {
      const x = i % horizontalSegments;
      const y = (i * horizontalSegmentsReciprocal) | 0;

      const a = y * horizontalCount + x;
      const b = a + 1;
      const c = a + horizontalCount;
      const d = c + 1;

      indices[offset++] = a;
      indices[offset++] = c;
      indices[offset++] = b;
      indices[offset++] = c;
      indices[offset++] = d;
      indices[offset++] = b;
    }

    if (!isRestoreMode) {
      const { bounds } = planeMesh;
      bounds.min.set(-halfWidth, 0, -halfHeight);
      bounds.max.set(halfWidth, 0, halfHeight);
    }

    PrimitiveMesh._initialize(planeMesh, vertices, indices, noLongerAccessible, isRestoreMode, restoreVertexBuffer);
  }

  static _setCylinderData(
    cylinderMesh: ModelMesh,
    radiusTop: number = 0.5,
    radiusBottom: number = 0.5,
    height: number = 2,
    radialSegments: number = 20,
    heightSegments: number = 1,
    noLongerAccessible: boolean,
    isRestoreMode: boolean,
    restoreVertexBuffer?: Buffer
  ): void {
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
    const indices = PrimitiveMesh._generateIndices(
      cylinderMesh.engine,
      totalVertexCount,
      torsoRectangleCount * 6 + capTriangleCount * 3
    );
    const radialCountReciprocal = 1.0 / radialCount;
    const radialSegmentsReciprocal = 1.0 / radialSegments;
    const heightSegmentsReciprocal = 1.0 / heightSegments;

    const vertexFloatCount = 8;
    const vertices = new Float32Array(totalVertexCount * vertexFloatCount);

    let indicesOffset = 0;

    // Create torso
    const thetaStart = Math.PI;
    const thetaRange = Math.PI * 2;
    const radiusDiff = radiusBottom - radiusTop;
    const slope = radiusDiff / height;
    const radiusSlope = radiusDiff / heightSegments;

    for (let i = 0; i < torsoVertexCount; ++i) {
      const x = i % radialCount;
      const y = (i * radialCountReciprocal) | 0;
      const u = x * radialSegmentsReciprocal;
      const v = y * heightSegmentsReciprocal;
      const theta = thetaStart + u * thetaRange;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      const radius = radiusBottom - y * radiusSlope;

      let posX = radius * sinTheta;
      let posY = y * unitHeight - halfHeight;
      let posZ = radius * cosTheta;

      let offset = i * vertexFloatCount;
      // Position
      vertices[offset++] = posX;
      vertices[offset++] = posY;
      vertices[offset++] = posZ;
      // Normal
      vertices[offset++] = sinTheta;
      vertices[offset++] = slope;
      vertices[offset++] = cosTheta;
      // TexCoord
      vertices[offset++] = u;
      vertices[offset++] = 1 - v;
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

    let offset = torsoVertexCount * vertexFloatCount;
    // Bottom position
    vertices[offset++] = 0;
    vertices[offset++] = -halfHeight;
    vertices[offset++] = 0;
    // Bottom normal
    vertices[offset++] = 0;
    vertices[offset++] = -1;
    vertices[offset++] = 0;
    // Bottom texCoord
    vertices[offset++] = 0.5;
    vertices[offset++] = 0.5;

    // Top position
    vertices[offset++] = 0;
    vertices[offset++] = halfHeight;
    vertices[offset++] = 0;
    // Top normal
    vertices[offset++] = 0;
    vertices[offset++] = 1;
    vertices[offset++] = 0;
    // Top texCoord
    vertices[offset++] = 0.5;
    vertices[offset++] = 0.5;

    // Add cap vertices
    offset = (torsoVertexCount + 2) * vertexFloatCount;

    const diameterTopReciprocal = 1.0 / (radiusTop * 2);
    const diameterBottomReciprocal = 1.0 / (radiusBottom * 2);
    const positionStride = radialCount * heightSegments;
    for (let i = 0; i < radialSegments; ++i) {
      const curPosBottomOffset = i * vertexFloatCount;
      let curPosX = vertices[curPosBottomOffset];
      let curPosZ = vertices[curPosBottomOffset + 2];

      // Bottom position
      vertices[offset++] = curPosX;
      vertices[offset++] = -halfHeight;
      vertices[offset++] = curPosZ;
      // Bottom normal
      vertices[offset++] = 0;
      vertices[offset++] = -1;
      vertices[offset++] = 0;
      // Bottom texcoord
      vertices[offset++] = curPosX * diameterBottomReciprocal + 0.5;
      vertices[offset++] = 0.5 - curPosZ * diameterBottomReciprocal;

      const curPosTopOffset = (i + positionStride) * vertexFloatCount;
      curPosX = vertices[curPosTopOffset];
      curPosZ = vertices[curPosTopOffset + 2];

      // Top position
      vertices[offset++] = curPosX;
      vertices[offset++] = halfHeight;
      vertices[offset++] = curPosZ;
      // Top normal
      vertices[offset++] = 0;
      vertices[offset++] = 1;
      vertices[offset++] = 0;
      // Top texcoord
      vertices[offset++] = curPosX * diameterTopReciprocal + 0.5;
      vertices[offset++] = 0.5 - curPosZ * diameterTopReciprocal;
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

    if (!isRestoreMode) {
      const { bounds } = cylinderMesh;
      const radiusMax = Math.max(radiusTop, radiusBottom);
      bounds.min.set(-radiusMax, -halfHeight, -radiusMax);
      bounds.max.set(radiusMax, halfHeight, radiusMax);
    }
    PrimitiveMesh._initialize(cylinderMesh, vertices, indices, noLongerAccessible, isRestoreMode, restoreVertexBuffer);
  }

  /**
   * @internal
   */
  static _setTorusData(
    torusMesh: ModelMesh,
    radius: number,
    tubeRadius: number,
    radialSegments: number,
    tubularSegments: number,
    arc: number,
    noLongerAccessible: boolean,
    isRestoreMode: boolean,
    restoreVertexBuffer?: Buffer
  ): void {
    radialSegments = Math.floor(radialSegments);
    tubularSegments = Math.floor(tubularSegments);

    const vertexCount = (radialSegments + 1) * (tubularSegments + 1);
    const rectangleCount = radialSegments * tubularSegments;
    const indices = PrimitiveMesh._generateIndices(torusMesh.engine, vertexCount, rectangleCount * 6);

    const vertexFloatCount = 8;
    const vertices = new Float32Array(vertexCount * vertexFloatCount);

    arc = (arc / 180) * Math.PI;

    let offset = 0;

    const normal = PrimitiveMesh._tempVec30;
    for (let i = 0; i <= radialSegments; i++) {
      for (let j = 0; j <= tubularSegments; j++) {
        const u = (j / tubularSegments) * arc;
        const v = (i / radialSegments) * Math.PI * 2;
        const cosV = Math.cos(v);
        const sinV = Math.sin(v);
        const cosU = Math.cos(u);
        const sinU = Math.sin(u);

        // Position
        const positionX = (radius + tubeRadius * cosV) * cosU;
        const positionY = (radius + tubeRadius * cosV) * sinU;
        const positionZ = tubeRadius * sinV;
        vertices[offset++] = positionX;
        vertices[offset++] = positionY;
        vertices[offset++] = positionZ;

        // Normal
        const centerX = radius * cosU;
        const centerY = radius * sinU;
        normal.set(positionX - centerX, positionY - centerY, positionZ).normalize();
        vertices[offset++] = normal.x;
        vertices[offset++] = normal.y;
        vertices[offset++] = normal.z;

        // UV
        vertices[offset++] = j / tubularSegments;
        vertices[offset++] = i / radialSegments;
      }
    }

    offset = 0;
    for (let i = 1; i <= radialSegments; i++) {
      for (let j = 1; j <= tubularSegments; j++) {
        const a = (tubularSegments + 1) * i + j - 1;
        const b = (tubularSegments + 1) * (i - 1) + j - 1;
        const c = (tubularSegments + 1) * (i - 1) + j;
        const d = (tubularSegments + 1) * i + j;

        indices[offset++] = a;
        indices[offset++] = b;
        indices[offset++] = d;

        indices[offset++] = b;
        indices[offset++] = c;
        indices[offset++] = d;
      }
    }

    if (!isRestoreMode) {
      const { bounds } = torusMesh;
      const outerRadius = radius + tubeRadius;
      bounds.min.set(-outerRadius, -outerRadius, -tubeRadius);
      bounds.max.set(outerRadius, outerRadius, tubeRadius);
    }

    PrimitiveMesh._initialize(torusMesh, vertices, indices, noLongerAccessible, isRestoreMode, restoreVertexBuffer);
  }

  /**
   * @internal
   */
  static _setConeData(
    coneMesh: ModelMesh,
    radius: number,
    height: number,
    radialSegments: number,
    heightSegments: number,
    noLongerAccessible: boolean,
    isRestoreMode: boolean,
    restoreVertexBuffer?: Buffer
  ): void {
    radialSegments = Math.floor(radialSegments);
    heightSegments = Math.floor(heightSegments);

    const radialCount = radialSegments + 1;
    const verticalCount = heightSegments + 1;
    const halfHeight = height * 0.5;
    const unitHeight = height / heightSegments;
    const torsoVertexCount = radialCount * verticalCount;
    const torsoRectangleCount = radialSegments * heightSegments;
    const totalVertexCount = torsoVertexCount + 1 + radialSegments;
    const indices = PrimitiveMesh._generateIndices(
      coneMesh.engine,
      totalVertexCount,
      torsoRectangleCount * 6 + radialSegments * 3
    );
    const radialCountReciprocal = 1.0 / radialCount;
    const radialSegmentsReciprocal = 1.0 / radialSegments;
    const heightSegmentsReciprocal = 1.0 / heightSegments;

    const vertexFloatCount = 8;
    const vertices = new Float32Array(totalVertexCount * 8);

    let indicesOffset = 0;

    // Create torso
    const thetaStart = Math.PI;
    const thetaRange = Math.PI * 2;
    const slope = radius / height;

    for (let i = 0; i < torsoVertexCount; ++i) {
      const x = i % radialCount;
      const y = (i * radialCountReciprocal) | 0;
      const u = x * radialSegmentsReciprocal;
      const v = y * heightSegmentsReciprocal;
      const theta = thetaStart + u * thetaRange;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      const curRadius = radius - y * radius;

      let posX = curRadius * sinTheta;
      let posY = y * unitHeight - halfHeight;
      let posZ = curRadius * cosTheta;

      let offset = i * vertexFloatCount;
      // Position
      vertices[offset++] = posX;
      vertices[offset++] = posY;
      vertices[offset++] = posZ;
      // Normal
      vertices[offset++] = sinTheta;
      vertices[offset++] = slope;
      vertices[offset++] = cosTheta;
      // Texcoord
      vertices[offset++] = u;
      vertices[offset++] = 1 - v;
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

    let offset = torsoVertexCount * vertexFloatCount;
    // Bottom position
    vertices[offset++] = 0;
    vertices[offset++] = -halfHeight;
    vertices[offset++] = 0;
    // Bottom normal
    vertices[offset++] = 0;
    vertices[offset++] = -1;
    vertices[offset++] = 0;
    // Bottom texcoord
    vertices[offset++] = 0.5;
    vertices[offset++] = 0.5;

    // Add bottom cap vertices
    offset = (torsoVertexCount + 1) * vertexFloatCount;
    const diameterBottomReciprocal = 1.0 / (radius * 2);
    for (let i = 0; i < radialSegments; ++i) {
      let curPosX = vertices[i * vertexFloatCount];
      let curPosZ = vertices[i * vertexFloatCount + 2];

      // Bottom position
      vertices[offset++] = curPosX;
      vertices[offset++] = -halfHeight;
      vertices[offset++] = curPosZ;
      // Bottom normal
      vertices[offset++] = 0;
      vertices[offset++] = -1;
      vertices[offset++] = 0;
      // Bottom texcoord
      vertices[offset++] = curPosX * diameterBottomReciprocal + 0.5;
      vertices[offset++] = 0.5 - curPosZ * diameterBottomReciprocal;
    }

    const bottomIndiceIndex = torsoVertexCount + 1;
    for (let i = 0; i < radialSegments; ++i) {
      const firstStride = i;
      const secondStride = i === radialSegments - 1 ? 0 : firstStride + 1;

      // Bottom
      indices[indicesOffset++] = torsoVertexCount;
      indices[indicesOffset++] = bottomIndiceIndex + secondStride;
      indices[indicesOffset++] = bottomIndiceIndex + firstStride;
    }

    if (!isRestoreMode) {
      const { bounds } = coneMesh;
      bounds.min.set(-radius, -halfHeight, -radius);
      bounds.max.set(radius, halfHeight, radius);
    }

    PrimitiveMesh._initialize(coneMesh, vertices, indices, noLongerAccessible, isRestoreMode, restoreVertexBuffer);
  }

  static _setCapsuleData(
    capsuleMesh: ModelMesh,
    radius: number,
    height: number,
    radialSegments: number,
    heightSegments: number,
    noLongerAccessible: boolean,
    isRestoreMode: boolean,
    restoreVertexBuffer?: Buffer
  ): void {
    radialSegments = Math.max(2, Math.floor(radialSegments));
    heightSegments = Math.floor(heightSegments);

    const radialCount = radialSegments + 1;
    const verticalCount = heightSegments + 1;
    const halfHeight = height * 0.5;
    const unitHeight = height / heightSegments;
    const torsoVertexCount = radialCount * verticalCount;
    const torsoRectangleCount = radialSegments * heightSegments;

    const capVertexCount = radialCount * radialCount;
    const capRectangleCount = radialSegments * radialSegments;

    const totalVertexCount = torsoVertexCount + 2 * capVertexCount;
    const indices = PrimitiveMesh._generateIndices(
      capsuleMesh.engine,
      totalVertexCount,
      (torsoRectangleCount + 2 * capRectangleCount) * 6
    );

    const radialCountReciprocal = 1.0 / radialCount;
    const radialSegmentsReciprocal = 1.0 / radialSegments;
    const heightSegmentsReciprocal = 1.0 / heightSegments;

    const thetaStart = Math.PI;
    const thetaRange = Math.PI * 2;

    const vertexFloatCount = 8;
    const vertices = new Float32Array(totalVertexCount * vertexFloatCount);

    let indicesOffset = 0;

    // create torso
    for (let i = 0; i < torsoVertexCount; ++i) {
      const x = i % radialCount;
      const y = (i * radialCountReciprocal) | 0;
      const u = x * radialSegmentsReciprocal;
      const v = y * heightSegmentsReciprocal;
      const theta = thetaStart + u * thetaRange;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      let offset = i * vertexFloatCount;

      // position
      vertices[offset++] = radius * sinTheta;
      vertices[offset++] = y * unitHeight - halfHeight;
      vertices[offset++] = radius * cosTheta;

      // Normal
      vertices[offset++] = sinTheta;
      vertices[offset++] = 0;
      vertices[offset++] = cosTheta;

      // Texcoord
      vertices[offset++] = u;
      vertices[offset++] = 1 - v;
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

    PrimitiveMesh._createCapsuleCap(
      radius,
      height,
      radialSegments,
      thetaRange,
      torsoVertexCount,
      1,
      vertices,
      indices,
      indicesOffset
    );

    PrimitiveMesh._createCapsuleCap(
      radius,
      height,
      radialSegments,
      -thetaRange,
      torsoVertexCount + capVertexCount,
      -1,
      vertices,
      indices,
      indicesOffset + 6 * capRectangleCount
    );

    if (!isRestoreMode) {
      const { bounds } = capsuleMesh;
      bounds.min.set(-radius, -radius - halfHeight, -radius);
      bounds.max.set(radius, radius + halfHeight, radius);
    }

    PrimitiveMesh._initialize(capsuleMesh, vertices, indices, noLongerAccessible, isRestoreMode, restoreVertexBuffer);
  }

  private static _initialize(
    mesh: ModelMesh,
    vertices: Float32Array,
    indices: Uint16Array | Uint32Array,
    noLongerAccessible: boolean,
    isRestoreMode: boolean,
    restoreVertexBuffer?: Buffer
  ) {
    if (isRestoreMode) {
      restoreVertexBuffer.setData(vertices);
      mesh.setIndices(indices);
      mesh.uploadData(noLongerAccessible);
    } else {
      const vertexElements = [
        new VertexElement(VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0),
        new VertexElement(VertexAttribute.Normal, 12, VertexElementFormat.Vector3, 0),
        new VertexElement(VertexAttribute.UV, 24, VertexElementFormat.Vector2, 0)
      ];
      mesh.setVertexElements(vertexElements);

      const vertexBuffer = new Buffer(mesh.engine, BufferBindFlag.VertexBuffer, vertices, BufferUsage.Static, true);
      mesh.setVertexBufferBinding(vertexBuffer, 32, 0);

      mesh.setIndices(indices);
      mesh.calculateTangents();

      mesh.uploadData(noLongerAccessible);

      mesh.addSubMesh(0, indices.length);
    }
  }

  private static _generateIndices(engine: Engine, vertexCount: number, indexCount: number): Uint16Array | Uint32Array {
    let indices: Uint16Array | Uint32Array = null;
    if (vertexCount > 65535) {
      if (engine._hardwareRenderer.canIUse(GLCapabilityType.elementIndexUint)) {
        indices = new Uint32Array(indexCount);
      } else {
        throw Error("The vertex count is over limit.");
      }
    } else {
      indices = new Uint16Array(indexCount);
    }
    return indices;
  }

  private static _createCapsuleCap(
    radius: number,
    height: number,
    radialSegments: number,
    capAlphaRange: number,
    offset: number,
    posIndex: number,
    vertices: Float32Array,
    indices: Uint16Array | Uint32Array,
    indicesOffset: number
  ) {
    const radialCount = radialSegments + 1;
    const halfHeight = height * 0.5 * posIndex;
    const capVertexCount = radialCount * radialCount;
    const capRectangleCount = radialSegments * radialSegments;
    const radialCountReciprocal = 1.0 / radialCount;
    const radialSegmentsReciprocal = 1.0 / radialSegments;
    const vertexFloatCount = 8;

    for (let i = 0; i < capVertexCount; ++i) {
      const x = i % radialCount;
      const y = (i * radialCountReciprocal) | 0;
      const u = x * radialSegmentsReciprocal;
      const v = y * radialSegmentsReciprocal;
      const alphaDelta = u * capAlphaRange;
      const thetaDelta = (v * Math.PI) / 2;
      const sinTheta = Math.sin(thetaDelta);

      const posX = -radius * Math.cos(alphaDelta) * sinTheta;
      const posY = radius * Math.cos(thetaDelta) * posIndex + halfHeight;
      const posZ = radius * Math.sin(alphaDelta) * sinTheta;

      let index = (i + offset) * vertexFloatCount;
      // Position
      vertices[index++] = posX;
      vertices[index++] = posY;
      vertices[index++] = posZ;

      // Normal
      vertices[index++] = posX;
      vertices[index++] = posY - halfHeight;
      vertices[index++] = posZ;

      // Texcoord
      vertices[index++] = u;
      vertices[index++] = v;
    }

    for (let i = 0; i < capRectangleCount; ++i) {
      const x = i % radialSegments;
      const y = (i * radialSegmentsReciprocal) | 0;

      const a = y * radialCount + x + offset;
      const b = a + 1;
      const c = a + radialCount;
      const d = c + 1;

      indices[indicesOffset++] = b;
      indices[indicesOffset++] = a;
      indices[indicesOffset++] = d;
      indices[indicesOffset++] = a;
      indices[indicesOffset++] = c;
      indices[indicesOffset++] = d;
    }
  }
}

interface IEdge {
  midPoint: Vector3;
  edgePoint: Vector3;
  faces: Array<number>;
}

interface IPoint {
  position: Vector3;
  newPosition: Vector3;
  facePoint: Array<number>;
  edgeMidPoint: Array<string>;
}

interface IFace {
  facePoint: Vector3;
  vertices: Array<number>;
  edges: Array<string>;
}
