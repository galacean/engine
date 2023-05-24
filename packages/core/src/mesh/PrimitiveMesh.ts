import { Vector2, Vector3 } from "@galacean/engine-math";
import { GLCapabilityType } from "../base/Constant";
import { Engine } from "../Engine";
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

/**
 * Used to generate common primitive meshes.
 */
export class PrimitiveMesh {
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
    engine.resourceManager.addContentRestorer(
      new PrimitiveMeshRestorer(sphereMesh, new SphereRestoreInfo(radius, segments, noLongerAccessible))
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
    engine.resourceManager.addContentRestorer(
      new PrimitiveMeshRestorer(mesh, new CuboidRestoreInfo(width, height, depth, noLongerAccessible))
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
    engine.resourceManager.addContentRestorer(
      new PrimitiveMeshRestorer(
        mesh,
        new PlaneRestoreInfo(width, height, horizontalSegments, verticalSegments, noLongerAccessible)
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
    engine.resourceManager.addContentRestorer(
      new PrimitiveMeshRestorer(
        mesh,
        new CylinderRestoreInfo(radiusTop, radiusBottom, height, radialSegments, heightSegments, noLongerAccessible)
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
    engine.resourceManager.addContentRestorer(
      new PrimitiveMeshRestorer(
        mesh,
        new TorusRestoreInfo(radius, tubeRadius, radialSegments, tubularSegments, arc, noLongerAccessible)
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
    engine.resourceManager.addContentRestorer(
      new PrimitiveMeshRestorer(
        mesh,
        new ConeRestoreInfo(radius, height, radialSegments, heightSegments, noLongerAccessible)
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
    engine.resourceManager.addContentRestorer(
      new PrimitiveMeshRestorer(
        mesh,
        new CapsuleRestoreInfo(radius, height, radialSegments, heightSegments, noLongerAccessible)
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
    segments: number,
    noLongerAccessible: boolean,
    isRestoreMode: boolean
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

    const positions = new Array<Vector3>(vertexCount);
    const normals = new Array<Vector3>(vertexCount);
    const uvs = new Array<Vector2>(vertexCount);

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
      positions[i] = new Vector3(posX, posY, posZ);
      // Normal
      normals[i] = new Vector3(posX, posY, posZ);
      // TexCoord
      uvs[i] = new Vector2(u, v);
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

    PrimitiveMesh._initialize(sphereMesh, positions, normals, uvs, indices, noLongerAccessible, isRestoreMode);
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
    isRestoreMode: boolean
  ): void {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const halfDepth = depth / 2;

    const positions = new Array<Vector3>(24);
    const normals = new Array<Vector3>(24);
    const uvs = new Array<Vector2>(24);

    // Up
    positions[0] = new Vector3(-halfWidth, halfHeight, -halfDepth);
    positions[1] = new Vector3(halfWidth, halfHeight, -halfDepth);
    positions[2] = new Vector3(halfWidth, halfHeight, halfDepth);
    positions[3] = new Vector3(-halfWidth, halfHeight, halfDepth);
    normals[0] = new Vector3(0, 1, 0);
    normals[1] = new Vector3(0, 1, 0);
    normals[2] = new Vector3(0, 1, 0);
    normals[3] = new Vector3(0, 1, 0);
    uvs[0] = new Vector2(0, 0);
    uvs[1] = new Vector2(1, 0);
    uvs[2] = new Vector2(1, 1);
    uvs[3] = new Vector2(0, 1);
    // Down
    positions[4] = new Vector3(-halfWidth, -halfHeight, -halfDepth);
    positions[5] = new Vector3(halfWidth, -halfHeight, -halfDepth);
    positions[6] = new Vector3(halfWidth, -halfHeight, halfDepth);
    positions[7] = new Vector3(-halfWidth, -halfHeight, halfDepth);
    normals[4] = new Vector3(0, -1, 0);
    normals[5] = new Vector3(0, -1, 0);
    normals[6] = new Vector3(0, -1, 0);
    normals[7] = new Vector3(0, -1, 0);
    uvs[4] = new Vector2(0, 1);
    uvs[5] = new Vector2(1, 1);
    uvs[6] = new Vector2(1, 0);
    uvs[7] = new Vector2(0, 0);
    // Left
    positions[8] = new Vector3(-halfWidth, halfHeight, -halfDepth);
    positions[9] = new Vector3(-halfWidth, halfHeight, halfDepth);
    positions[10] = new Vector3(-halfWidth, -halfHeight, halfDepth);
    positions[11] = new Vector3(-halfWidth, -halfHeight, -halfDepth);
    normals[8] = new Vector3(-1, 0, 0);
    normals[9] = new Vector3(-1, 0, 0);
    normals[10] = new Vector3(-1, 0, 0);
    normals[11] = new Vector3(-1, 0, 0);
    uvs[8] = new Vector2(0, 0);
    uvs[9] = new Vector2(1, 0);
    uvs[10] = new Vector2(1, 1);
    uvs[11] = new Vector2(0, 1);
    // Right
    positions[12] = new Vector3(halfWidth, halfHeight, -halfDepth);
    positions[13] = new Vector3(halfWidth, halfHeight, halfDepth);
    positions[14] = new Vector3(halfWidth, -halfHeight, halfDepth);
    positions[15] = new Vector3(halfWidth, -halfHeight, -halfDepth);
    normals[12] = new Vector3(1, 0, 0);
    normals[13] = new Vector3(1, 0, 0);
    normals[14] = new Vector3(1, 0, 0);
    normals[15] = new Vector3(1, 0, 0);
    uvs[12] = new Vector2(1, 0);
    uvs[13] = new Vector2(0, 0);
    uvs[14] = new Vector2(0, 1);
    uvs[15] = new Vector2(1, 1);
    // Front
    positions[16] = new Vector3(-halfWidth, halfHeight, halfDepth);
    positions[17] = new Vector3(halfWidth, halfHeight, halfDepth);
    positions[18] = new Vector3(halfWidth, -halfHeight, halfDepth);
    positions[19] = new Vector3(-halfWidth, -halfHeight, halfDepth);
    normals[16] = new Vector3(0, 0, 1);
    normals[17] = new Vector3(0, 0, 1);
    normals[18] = new Vector3(0, 0, 1);
    normals[19] = new Vector3(0, 0, 1);
    uvs[16] = new Vector2(0, 0);
    uvs[17] = new Vector2(1, 0);
    uvs[18] = new Vector2(1, 1);
    uvs[19] = new Vector2(0, 1);
    // Back
    positions[20] = new Vector3(-halfWidth, halfHeight, -halfDepth);
    positions[21] = new Vector3(halfWidth, halfHeight, -halfDepth);
    positions[22] = new Vector3(halfWidth, -halfHeight, -halfDepth);
    positions[23] = new Vector3(-halfWidth, -halfHeight, -halfDepth);
    normals[20] = new Vector3(0, 0, -1);
    normals[21] = new Vector3(0, 0, -1);
    normals[22] = new Vector3(0, 0, -1);
    normals[23] = new Vector3(0, 0, -1);
    uvs[20] = new Vector2(1, 0);
    uvs[21] = new Vector2(0, 0);
    uvs[22] = new Vector2(0, 1);
    uvs[23] = new Vector2(1, 1);

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
    PrimitiveMesh._initialize(cuboidMesh, positions, normals, uvs, indices, noLongerAccessible, isRestoreMode);
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
    isRestoreMode: boolean
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

    const positions = new Array<Vector3>(vertexCount);
    const normals = new Array<Vector3>(vertexCount);
    const uvs = new Array<Vector2>(vertexCount);

    for (let i = 0; i < vertexCount; ++i) {
      const x = i % horizontalCount;
      const z = (i * horizontalCountReciprocal) | 0;

      // Position
      positions[i] = new Vector3(x * gridWidth - halfWidth, 0, z * gridHeight - halfHeight);
      // Normal
      normals[i] = new Vector3(0, 1, 0);
      // TexCoord
      uvs[i] = new Vector2(x * horizontalSegmentsReciprocal, z * verticalSegmentsReciprocal);
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

    PrimitiveMesh._initialize(planeMesh, positions, normals, uvs, indices, noLongerAccessible, isRestoreMode);
  }

  static _setCylinderData(
    cylinderMesh: ModelMesh,
    radiusTop: number = 0.5,
    radiusBottom: number = 0.5,
    height: number = 2,
    radialSegments: number = 20,
    heightSegments: number = 1,
    noLongerAccessible: boolean,
    isRestoreMode: boolean
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

    const positions = new Array<Vector3>(totalVertexCount);
    const normals = new Array<Vector3>(totalVertexCount);
    const uvs = new Array<Vector2>(totalVertexCount);

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

      // Position
      positions[i] = new Vector3(posX, posY, posZ);
      // Normal
      normals[i] = new Vector3(sinTheta, slope, cosTheta);
      // TexCoord
      uvs[i] = new Vector2(u, 1 - v);
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
    positions[torsoVertexCount] = new Vector3(0, -halfHeight, 0);
    // Bottom normal
    normals[torsoVertexCount] = new Vector3(0, -1, 0);
    // Bottom texCoord
    uvs[torsoVertexCount] = new Vector2(0.5, 0.5);

    // Top position
    positions[torsoVertexCount + 1] = new Vector3(0, halfHeight, 0);
    // Top normal
    normals[torsoVertexCount + 1] = new Vector3(0, 1, 0);
    // Top texCoord
    uvs[torsoVertexCount + 1] = new Vector2(0.5, 0.5);

    // Add cap vertices
    let offset = torsoVertexCount + 2;

    const diameterTopReciprocal = 1.0 / (radiusTop * 2);
    const diameterBottomReciprocal = 1.0 / (radiusBottom * 2);
    const positionStride = radialCount * heightSegments;
    for (let i = 0; i < radialSegments; ++i) {
      const curPosBottom = positions[i];
      let curPosX = curPosBottom.x;
      let curPosZ = curPosBottom.z;

      // Bottom position
      positions[offset] = new Vector3(curPosX, -halfHeight, curPosZ);
      // Bottom normal
      normals[offset] = new Vector3(0, -1, 0);
      // Bottom texcoord
      uvs[offset++] = new Vector2(curPosX * diameterBottomReciprocal + 0.5, 0.5 - curPosZ * diameterBottomReciprocal);

      const curPosTop = positions[i + positionStride];
      curPosX = curPosTop.x;
      curPosZ = curPosTop.z;

      // Top position
      positions[offset] = new Vector3(curPosX, halfHeight, curPosZ);
      // Top normal
      normals[offset] = new Vector3(0, 1, 0);
      // Top texcoord
      uvs[offset++] = new Vector2(curPosX * diameterTopReciprocal + 0.5, curPosZ * diameterTopReciprocal + 0.5);
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
    PrimitiveMesh._initialize(cylinderMesh, positions, normals, uvs, indices, noLongerAccessible, isRestoreMode);
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
    isRestoreMode: boolean
  ): void {
    radialSegments = Math.floor(radialSegments);
    tubularSegments = Math.floor(tubularSegments);

    const vertexCount = (radialSegments + 1) * (tubularSegments + 1);
    const rectangleCount = radialSegments * tubularSegments;
    const indices = PrimitiveMesh._generateIndices(torusMesh.engine, vertexCount, rectangleCount * 6);

    const positions = new Array<Vector3>(vertexCount);
    const normals = new Array<Vector3>(vertexCount);
    const uvs = new Array<Vector2>(vertexCount);

    arc = (arc / 180) * Math.PI;

    let offset = 0;

    for (let i = 0; i <= radialSegments; i++) {
      for (let j = 0; j <= tubularSegments; j++) {
        const u = (j / tubularSegments) * arc;
        const v = (i / radialSegments) * Math.PI * 2;
        const cosV = Math.cos(v);
        const sinV = Math.sin(v);
        const cosU = Math.cos(u);
        const sinU = Math.sin(u);

        const position = new Vector3(
          (radius + tubeRadius * cosV) * cosU,
          (radius + tubeRadius * cosV) * sinU,
          tubeRadius * sinV
        );
        positions[offset] = position;

        const centerX = radius * cosU;
        const centerY = radius * sinU;
        normals[offset] = new Vector3(position.x - centerX, position.y - centerY, position.z).normalize();

        uvs[offset++] = new Vector2(j / tubularSegments, i / radialSegments);
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

    PrimitiveMesh._initialize(torusMesh, positions, normals, uvs, indices, noLongerAccessible, isRestoreMode);
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
    isRestoreMode: boolean
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

    const positions = new Array<Vector3>(totalVertexCount);
    const normals = new Array<Vector3>(totalVertexCount);
    const uvs = new Array<Vector2>(totalVertexCount);

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

      // Position
      positions[i] = new Vector3(posX, posY, posZ);
      // Normal
      normals[i] = new Vector3(sinTheta, slope, cosTheta);
      // Texcoord
      uvs[i] = new Vector2(u, 1 - v);
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
    positions[torsoVertexCount] = new Vector3(0, -halfHeight, 0);
    // Bottom normal
    normals[torsoVertexCount] = new Vector3(0, -1, 0);
    // Bottom texcoord
    uvs[torsoVertexCount] = new Vector2(0.5, 0.5);

    // Add bottom cap vertices
    let offset = torsoVertexCount + 1;
    const diameterBottomReciprocal = 1.0 / (radius * 2);
    for (let i = 0; i < radialSegments; ++i) {
      const curPos = positions[i];
      let curPosX = curPos.x;
      let curPosZ = curPos.z;

      // Bottom position
      positions[offset] = new Vector3(curPosX, -halfHeight, curPosZ);
      // Bottom normal
      normals[offset] = new Vector3(0, -1, 0);
      // Bottom texcoord
      uvs[offset++] = new Vector2(curPosX * diameterBottomReciprocal + 0.5, 0.5 - curPosZ * diameterBottomReciprocal);
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

    PrimitiveMesh._initialize(coneMesh, positions, normals, uvs, indices, noLongerAccessible, isRestoreMode);
  }

  static _setCapsuleData(
    capsuleMesh: ModelMesh,
    radius: number,
    height: number,
    radialSegments: number,
    heightSegments: number,
    noLongerAccessible: boolean,
    isRestoreMode: boolean
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

    const positions = new Array<Vector3>(totalVertexCount);
    const normals = new Array<Vector3>(totalVertexCount);
    const uvs = new Array<Vector2>(totalVertexCount);

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

      positions[i] = new Vector3(radius * sinTheta, y * unitHeight - halfHeight, radius * cosTheta);
      normals[i] = new Vector3(sinTheta, 0, cosTheta);
      uvs[i] = new Vector2(u, 1 - v);
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
      positions,
      normals,
      uvs,
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
      positions,
      normals,
      uvs,
      indices,
      indicesOffset + 6 * capRectangleCount
    );

    if (!isRestoreMode) {
      const { bounds } = capsuleMesh;
      bounds.min.set(-radius, -radius - halfHeight, -radius);
      bounds.max.set(radius, radius + halfHeight, radius);
    }

    PrimitiveMesh._initialize(capsuleMesh, positions, normals, uvs, indices, noLongerAccessible, isRestoreMode);
  }

  private static _initialize(
    mesh: ModelMesh,
    positions: Vector3[],
    normals: Vector3[],
    uvs: Vector2[],
    indices: Uint16Array | Uint32Array,
    noLongerAccessible: boolean,
    isRestoreMode: boolean
  ) {
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setUVs(uvs);
    mesh.setIndices(indices);
    mesh.calculateTangents();

    mesh.uploadData(noLongerAccessible);

    if (!isRestoreMode) {
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
    positions: Vector3[],
    normals: Vector3[],
    uvs: Vector2[],
    indices: Uint16Array | Uint32Array,
    indicesOffset: number
  ) {
    const radialCount = radialSegments + 1;
    const halfHeight = height * 0.5 * posIndex;
    const capVertexCount = radialCount * radialCount;
    const capRectangleCount = radialSegments * radialSegments;
    const radialCountReciprocal = 1.0 / radialCount;
    const radialSegmentsReciprocal = 1.0 / radialSegments;

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

      const index = i + offset;
      positions[index] = new Vector3(posX, posY, posZ);
      normals[index] = new Vector3(posX, posY - halfHeight, posZ);
      uvs[index] = new Vector2(u, v);
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
