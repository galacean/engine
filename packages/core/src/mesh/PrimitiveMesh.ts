import { MathUtil, Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { GLCapabilityType } from "../base/Constant";
import { BufferBindFlag, BufferUsage, VertexElement, VertexElementFormat } from "../graphic";
import { Buffer } from "../graphic/Buffer";
import { ModelMesh } from "./ModelMesh";
import {
  CapsuleRestoreInfo,
  SubdivisionSurfaceSphereRestoreInfo,
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

  private static readonly _sphereSeedPositions = new Float32Array([
    -1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1, 1, 1, -1, -1, 1, 1, -1, -1, -1, -1, -1, 1, -1
  ]);

  private static readonly _sphereSeedCells = new Float32Array([
    0, 1, 2, 3, 3, 2, 4, 5, 5, 4, 6, 7, 7, 0, 3, 5, 7, 6, 1, 0, 6, 4, 2, 1
  ]);

  private static _sphereEdgeIdx: number = 0;
  private static _spherePoleIdx: number = 0;

  /**
   * Create a sphere mesh.
   * @param engine - Engine
   * @param radius - Sphere radius
   * @param segments - Number of segments
   * @param noLongerAccessible - No longer access the vertices of the mesh after creation
   * @returns Sphere model mesh
   */
  static createSphere(
    engine: Engine,
    radius: number = 0.5,
    segments: number = 18,
    noLongerAccessible: boolean = true
  ): ModelMesh {
    const sphereMesh = new ModelMesh(engine);
    PrimitiveMesh._setSphereData(sphereMesh, radius, segments, noLongerAccessible, false);

    const vertexBuffer = sphereMesh.vertexBufferBindings[0].buffer;
    engine.resourceManager.addContentRestorer(
      new PrimitiveMeshRestorer(sphereMesh, new SphereRestoreInfo(radius, segments, vertexBuffer, noLongerAccessible))
    );
    return sphereMesh;
  }

  /**
   * Create a sphere mesh by implementing Catmull-Clark Surface Subdivision Algorithm.
   * Max step is limited to 6.
   * @param engine - Engine
   * @param radius - Sphere radius
   * @param step - Number of subdiv steps
   * @param noLongerAccessible - No longer access the vertices of the mesh after creation
   * @returns Sphere model mesh
   */
  static createSubdivisionSurfaceSphere(
    engine: Engine,
    radius: number = 0.5,
    step: number = 3,
    noLongerAccessible: boolean = true
  ): ModelMesh {
    const sphereMesh = new ModelMesh(engine);
    PrimitiveMesh._setSubdivisionSurfaceSphereData(sphereMesh, radius, step, noLongerAccessible, false);

    const vertexBuffer = sphereMesh.vertexBufferBindings[0].buffer;
    engine.resourceManager.addContentRestorer(
      new PrimitiveMeshRestorer(
        sphereMesh,
        new SubdivisionSurfaceSphereRestoreInfo(radius, step, vertexBuffer, noLongerAccessible)
      )
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
  static _setSubdivisionSurfaceSphereData(
    sphereMesh: ModelMesh,
    radius: number,
    step: number,
    noLongerAccessible: boolean,
    isRestoreMode: boolean,
    restoreVertexBuffer?: Buffer
  ): void {
    // Max step is limited to 6. Because 7 step will generate a single mesh with over 98306 vertices
    step = MathUtil.clamp(Math.floor(step), 1, 6);

    const positions = new Float32Array(3 * (6 * Math.pow(4, step) + 2));
    const cells = new Float32Array(24 * Math.pow(4, step));
    PrimitiveMesh._subdiveCatmullClark(step, positions, cells);

    const positionCount = positions.length / 3;
    const cellsCount = cells.length / 4;
    const poleOffset = positionCount + Math.pow(2, step + 1) - 1;
    const vertexCount = poleOffset + 16;

    const vertices = new Float32Array(vertexCount * 8);
    const indices = PrimitiveMesh._generateIndices(sphereMesh.engine, positionCount, cellsCount * 6);

    let seamCount = 0;
    const seamVertices = <Record<number, number>>{};

    // Get normals, uvs, and scale to radius
    for (let i = 0; i < positionCount; i++) {
      let offset = 3 * i;

      let x = positions[offset];
      let y = positions[offset + 1];
      let z = positions[offset + 2];

      const reciprocalLength = 1 / Math.sqrt(x * x + y * y + z * z);
      x *= reciprocalLength;
      y *= reciprocalLength;
      z *= reciprocalLength;

      offset = 8 * i;
      vertices[offset] = x * radius;
      vertices[offset + 1] = y * radius;
      vertices[offset + 2] = z * radius;

      vertices[offset + 3] = x;
      vertices[offset + 4] = y;
      vertices[offset + 5] = z;

      vertices[offset + 6] = (Math.PI - Math.atan2(z, x)) / (2 * Math.PI);
      vertices[offset + 7] = Math.acos(y) / Math.PI;

      if (vertices[offset + 6] === 0) {
        // Generate seam vertex
        const seamOffset = 8 * (positionCount + seamCount++);

        vertices.set(vertices.subarray(offset, offset + 8), seamOffset);
        vertices[seamOffset + 6] = 1.0;

        // Cache seam vertex
        seamVertices[offset / 8] = seamOffset / 8;
      }
    }

    // Get indices
    let offset = 0;
    this._spherePoleIdx = 0;
    for (let i = 0; i < cellsCount; i++) {
      const idx = 4 * i;

      indices[offset] = cells[idx];
      indices[offset + 1] = cells[idx + 1];
      indices[offset + 2] = cells[idx + 2];

      this._replaceSeamUV(indices, vertices, offset, seamVertices);
      this._generateAndReplacePoleUV(indices, vertices, offset, poleOffset);

      indices[offset + 3] = cells[idx];
      indices[offset + 4] = cells[idx + 2];
      indices[offset + 5] = cells[idx + 3];

      this._replaceSeamUV(indices, vertices, offset + 3, seamVertices);
      this._generateAndReplacePoleUV(indices, vertices, offset + 3, poleOffset);

      offset += 6;
    }
    if (!isRestoreMode) {
      const { bounds } = sphereMesh;
      bounds.min.set(-radius, -radius, -radius);
      bounds.max.set(radius, radius, radius);
    }
    PrimitiveMesh._initialize(sphereMesh, vertices, indices, noLongerAccessible, isRestoreMode, restoreVertexBuffer);
  }

  /**
   * @internal
   */
  static _setSphereData(
    sphereMesh: ModelMesh,
    radius: number,
    segments: number,
    noLongerAccessible: boolean,
    isRestoreMode: boolean,
    restoreVertexBuffer?: Buffer
  ): void {
    segments = Math.max(2, Math.floor(segments));

    const count = segments + 1;
    const vertexCount = count * count;
    const rectangleCount = segments * segments;
    const indices = PrimitiveMesh._generateIndices(sphereMesh.engine, vertexCount, rectangleCount * 6);
    const thetaRange = Math.PI;
    const alphaRange = thetaRange * 2;
    const countReciprocal = 1.0 / count;
    const segmentsReciprocal = 1.0 / segments;

    const vertexFloatCount = 8;
    const vertices = new Float32Array(vertexCount * vertexFloatCount);

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

      let offset = i * vertexFloatCount;
      // Position
      vertices[offset++] = posX;
      vertices[offset++] = posY;
      vertices[offset++] = posZ;
      // Normal
      vertices[offset++] = posX;
      vertices[offset++] = posY;
      vertices[offset++] = posZ;
      // TexCoord
      vertices[offset++] = u;
      vertices[offset++] = v;
    }

    let offset = 0;
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

    if (!isRestoreMode) {
      const { bounds } = sphereMesh;
      bounds.min.set(-radius, -radius, -radius);
      bounds.max.set(radius, radius, radius);
    }

    PrimitiveMesh._initialize(sphereMesh, vertices, indices, noLongerAccessible, isRestoreMode, restoreVertexBuffer);
  }

  /**
   * @internal
   */
  static _subdiveCatmullClark(step: number, positions: Float32Array, cells: Float32Array) {
    const edges = new Map<number, IEdge>();
    const faces = new Array<IFace>();

    positions.set(PrimitiveMesh._sphereSeedPositions);
    cells.set(PrimitiveMesh._sphereSeedCells);

    for (let i = 0; i < step; i++) {
      const cellCount = 6 * Math.pow(4, i);
      const positionCount = 4 * cellCount + 2;

      edges.clear();
      faces.length = 0;

      // Get cell face's facePoint
      for (let j = 0; j < cellCount; j++) {
        const face = (faces[j] = {
          facePoint: new Vector3(),
          adjacentEdges: new Array<IEdge>(4)
        });

        // Get cell's edgePoint
        for (let k = 0; k < 4; k++) {
          const offset = 3 * cells[4 * j + k];
          face.facePoint.x += 0.25 * positions[offset];
          face.facePoint.y += 0.25 * positions[offset + 1];
          face.facePoint.z += 0.25 * positions[offset + 2];
        }

        // Get cell edges
        for (let k = 0; k < 4; k++) {
          const vertexIdxA = cells[4 * j + k];
          const vertexIdxB = cells[4 * j + ((k + 1) % 4)];

          const edgeIdxKey = Math.min(vertexIdxA, vertexIdxB) * positionCount + Math.max(vertexIdxA, vertexIdxB);

          if (!edges.has(edgeIdxKey)) {
            const edge: IEdge = {
              edgePoint: new Vector3(),
              edgePointIndex: undefined
            };

            const offsetA = 3 * vertexIdxA;
            const offsetB = 3 * vertexIdxB;

            edge.edgePoint.set(
              0.25 * (positions[offsetA] + positions[offsetB]),
              0.25 * (positions[offsetA + 1] + positions[offsetB + 1]),
              0.25 * (positions[offsetA + 2] + positions[offsetB + 2])
            );

            edges.set(edgeIdxKey, edge);
          }
          const edge = edges.get(edgeIdxKey);

          face.adjacentEdges[k] = edge;

          const edgePoint = edge.edgePoint;
          const facePoint = face.facePoint;

          edgePoint.x += 0.25 * facePoint.x;
          edgePoint.y += 0.25 * facePoint.y;
          edgePoint.z += 0.25 * facePoint.z;
        }
      }

      const prePointCount = cellCount + 2;
      const edgePointOffset = prePointCount + cellCount;

      let pointIdx = 0;
      this._sphereEdgeIdx = 0;
      const preCells = cells.slice(0, 4 * cellCount);

      // Get New positions, which consists of updated positions of existing points, face points and edge points
      for (let j = 0; j < cellCount; j++) {
        // Add face point to new positions
        const face = faces[j];
        face.facePoint.copyToArray(positions, 3 * (prePointCount + j));

        // Get the face point index
        const ic = prePointCount + j;

        let id: number, ib: number, temp: number;

        //  ia -- ib -- ia
        //  |     |     |
        //  id -- ic -- id
        //  |     |     |
        //  ia -- ib -- ia
        for (let k = 0; k < 4; k++) {
          // Get the updated existing point index
          const ia = preCells[pointIdx++];

          // ib and id share four edge points in one cell
          switch (k) {
            case 0: {
              const edgeB = face.adjacentEdges[k % 4];
              const edgeD = face.adjacentEdges[(k + 3) % 4];
              ib = this._calculateEdgeIndex(positions, edgeB, edgePointOffset);
              id = this._calculateEdgeIndex(positions, edgeD, edgePointOffset);
              temp = id;
              break;
            }
            case 1:
            case 2: {
              const edgeB = face.adjacentEdges[k % 4];
              id = ib;
              ib = this._calculateEdgeIndex(positions, edgeB, edgePointOffset);
              break;
            }
            case 3: {
              id = ib;
              ib = temp;
              break;
            }
          }

          const idx = 4 * (4 * j + k);
          cells[idx] = ia;
          cells[idx + 1] = ib;
          cells[idx + 2] = ic;
          cells[idx + 3] = id;
        }
      }
    }
  }

  /**
   * Duplicate vertices whose uv normal is flipped and adjust their UV coordinates.
   */
  private static _replaceSeamUV(
    indices: Uint16Array | Uint32Array,
    vertices: Float32Array,
    idx: number,
    seamVertices: Record<number, number>
  ) {
    const vertexA = 8 * indices[idx];
    const vertexB = 8 * indices[idx + 1];
    const vertexC = 8 * indices[idx + 2];

    const z =
      (vertices[vertexB + 6] - vertices[vertexA + 6]) * (vertices[vertexC + 7] - vertices[vertexA + 7]) -
      (vertices[vertexB + 7] - vertices[vertexA + 7]) * (vertices[vertexC + 6] - vertices[vertexA + 6]);

    if (z > 0) {
      if (vertices[vertexA + 6] === 0) {
        indices[idx] = seamVertices[indices[idx]];
      }
      if (vertices[vertexB + 6] === 0) {
        indices[idx + 1] = seamVertices[indices[idx + 1]];
      }
      if (vertices[vertexC + 6] === 0) {
        indices[idx + 2] = seamVertices[indices[idx + 2]];
      }
    }
  }
  /**
   * Duplicate vertices at the poles and adjust their UV coordinates.
   */
  private static _generateAndReplacePoleUV(
    indices: Uint16Array | Uint32Array,
    vertices: Float32Array,
    idx: number,
    poleOffset: number
  ) {
    const u =
      (vertices[8 * indices[idx] + 6] + vertices[8 * indices[idx + 1] + 6] + vertices[8 * indices[idx + 1] + 6] - 0.5) /
      2;
    const v = vertices[8 * indices[idx] + 7];
    if (v === 1 || v === 0) {
      const addedOffset = 8 * (poleOffset + this._spherePoleIdx);
      const index = 8 * indices[idx];

      vertices.set(vertices.slice(index, index + 8), addedOffset);
      vertices[addedOffset + 6] = u;

      indices[idx] = poleOffset + this._spherePoleIdx;

      this._spherePoleIdx++;
    }
  }
  /**
   * Get edge point index for subdivision surface sphere.
   */
  private static _calculateEdgeIndex(positions: Float32Array, edge: IEdge, offset: number): number {
    if (edge.edgePointIndex !== undefined) {
      return edge.edgePointIndex;
    } else {
      edge.edgePoint.copyToArray(positions, 3 * (offset + PrimitiveMesh._sphereEdgeIdx));

      const index = offset + PrimitiveMesh._sphereEdgeIdx++;
      edge.edgePointIndex = index;
      return index;
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
  edgePoint: Vector3;
  edgePointIndex: number;
}

interface IFace {
  facePoint: Vector3;
  adjacentEdges: Array<IEdge>;
}
