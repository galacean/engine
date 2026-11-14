import { MathUtil, Vector2, Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { GLCapabilityType } from "../base/Constant";
import { BufferBindFlag, BufferUsage, VertexElement, VertexElementFormat } from "../graphic";
import { Buffer } from "../graphic/Buffer";
import { ModelMesh } from "./ModelMesh";
import { MeshTangentUtils } from "./MeshTangentUtils";
import type {
  SphereMeshOptions,
  CuboidMeshOptions,
  PlaneMeshOptions,
  CylinderMeshOptions,
  TruncatedConeMeshOptions,
  ConeMeshOptions,
  CapsuleMeshOptions,
  TorusMeshOptions,
  CircleMeshOptions,
  RingMeshOptions,
  RegularPolyhedronMeshOptions,
  LatheMeshOptions,
  TubeMeshOptions,
  PolygonMeshOptions,
  LinearExtrusionMeshOptions,
  PathExtrusionMeshOptions,
  TorusKnotMeshOptions,
  RoundedCuboidMeshOptions,
  PolygonShape
} from "./PrimitiveMeshOptions";
import { PrimitiveMeshCapMode } from "./enums/PrimitiveMeshCapMode";
import { VertexAttribute } from "./enums/VertexAttribute";
import { PrimitiveMeshBuilder } from "./primitive/PrimitiveMeshBuilder";
import { PrimitiveMeshRestorer } from "./primitive/PrimitiveMeshRestorer";
import { MeshPathUtils } from "./primitive/MeshPathUtils";
import { PolygonUtils } from "./primitive/PolygonUtils";
import { SubdivisionUtils } from "./primitive/SubdivisionUtils";

/**
 * Creates primitive meshes in local space. Angle ranges use degrees.
 * Meshes have one sub-mesh unless material grouping is enabled.
 * @remarks
 * Input arrays and vectors are copied. Changing them later does not update the mesh.
 */
export class PrimitiveMesh {
  private static readonly _sphereSeedPositions = new Float32Array([
    -1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1, 1, 1, -1, -1, 1, 1, -1, -1, -1, -1, -1, 1, -1
  ]);

  private static readonly _sphereSeedCells = new Float32Array([
    0, 1, 2, 3, 3, 2, 4, 5, 5, 4, 6, 7, 7, 0, 3, 5, 7, 6, 1, 0, 6, 4, 2, 1
  ]);
  private static readonly _goldenRatio = (1 + Math.sqrt(5)) / 2;
  private static readonly _inverseGoldenRatio = 1 / PrimitiveMesh._goldenRatio;
  private static readonly _regularPolyhedra: Record<string, [number[], number[]]> = {
    tetrahedron: [
      [1, 1, 1, -1, -1, 1, -1, 1, -1, 1, -1, -1],
      [2, 1, 0, 0, 3, 2, 1, 3, 0, 2, 3, 1]
    ],
    octahedron: [
      [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1],
      [0, 2, 4, 0, 4, 3, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 3, 1, 3, 4, 1, 4, 2]
    ],
    icosahedron: [
      [
        -1,
        PrimitiveMesh._goldenRatio,
        0,
        1,
        PrimitiveMesh._goldenRatio,
        0,
        -1,
        -PrimitiveMesh._goldenRatio,
        0,
        1,
        -PrimitiveMesh._goldenRatio,
        0,
        0,
        -1,
        PrimitiveMesh._goldenRatio,
        0,
        1,
        PrimitiveMesh._goldenRatio,
        0,
        -1,
        -PrimitiveMesh._goldenRatio,
        0,
        1,
        -PrimitiveMesh._goldenRatio,
        PrimitiveMesh._goldenRatio,
        0,
        -1,
        PrimitiveMesh._goldenRatio,
        0,
        1,
        -PrimitiveMesh._goldenRatio,
        0,
        -1,
        -PrimitiveMesh._goldenRatio,
        0,
        1
      ],
      [
        0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4,
        2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1
      ]
    ],
    dodecahedron: [
      [
        -1,
        -1,
        -1,
        -1,
        -1,
        1,
        -1,
        1,
        -1,
        -1,
        1,
        1,
        1,
        -1,
        -1,
        1,
        -1,
        1,
        1,
        1,
        -1,
        1,
        1,
        1,
        0,
        -PrimitiveMesh._inverseGoldenRatio,
        -PrimitiveMesh._goldenRatio,
        0,
        -PrimitiveMesh._inverseGoldenRatio,
        PrimitiveMesh._goldenRatio,
        0,
        PrimitiveMesh._inverseGoldenRatio,
        -PrimitiveMesh._goldenRatio,
        0,
        PrimitiveMesh._inverseGoldenRatio,
        PrimitiveMesh._goldenRatio,
        -PrimitiveMesh._inverseGoldenRatio,
        -PrimitiveMesh._goldenRatio,
        0,
        -PrimitiveMesh._inverseGoldenRatio,
        PrimitiveMesh._goldenRatio,
        0,
        PrimitiveMesh._inverseGoldenRatio,
        -PrimitiveMesh._goldenRatio,
        0,
        PrimitiveMesh._inverseGoldenRatio,
        PrimitiveMesh._goldenRatio,
        0,
        -PrimitiveMesh._goldenRatio,
        0,
        -PrimitiveMesh._inverseGoldenRatio,
        PrimitiveMesh._goldenRatio,
        0,
        -PrimitiveMesh._inverseGoldenRatio,
        -PrimitiveMesh._goldenRatio,
        0,
        PrimitiveMesh._inverseGoldenRatio,
        PrimitiveMesh._goldenRatio,
        0,
        PrimitiveMesh._inverseGoldenRatio
      ],
      [
        3, 11, 7, 3, 7, 15, 3, 15, 13, 7, 19, 17, 7, 17, 6, 7, 6, 15, 17, 4, 8, 17, 8, 10, 17, 10, 6, 8, 0, 16, 8, 16,
        2, 8, 2, 10, 0, 12, 1, 0, 1, 18, 0, 18, 16, 6, 10, 2, 6, 2, 13, 6, 13, 15, 2, 16, 18, 2, 18, 3, 2, 3, 13, 18, 1,
        9, 18, 9, 11, 18, 11, 3, 4, 14, 12, 4, 12, 0, 4, 0, 8, 11, 9, 5, 11, 5, 19, 11, 19, 7, 19, 5, 14, 19, 14, 4, 19,
        4, 17, 1, 12, 14, 1, 14, 5, 1, 5, 9
      ]
    ]
  };

  /**
   * Create a sphere or an open spherical section from a subdivided cube.
   * @param engine - The engine that owns the mesh
   * @param radius - The radius in local units
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createSphere(engine: Engine, radius: number, options: SphereMeshOptions = {}): ModelMesh {
    const { subdivisions = 3, horizontalRange, verticalRange } = options;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createSphereData,
      [
        radius,
        subdivisions,
        horizontalRange?.x ?? 0,
        horizontalRange?.y ?? 360,
        verticalRange?.x ?? 0,
        verticalRange?.y ?? 180
      ],
      options
    );
  }

  /**
   * Create an axis-aligned cuboid centered at the origin.
   * @param engine - The engine that owns the mesh
   * @param width - The full size along X in local units
   * @param height - The full size along Y in local units
   * @param depth - The full size along Z in local units
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createCuboid(
    engine: Engine,
    width: number,
    height: number,
    depth: number,
    options: CuboidMeshOptions = {}
  ): ModelMesh {
    const { widthSegments = 1, heightSegments = widthSegments, depthSegments = widthSegments } = options;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createCuboidData,
      [width, height, depth, widthSegments, heightSegments, depthSegments],
      options
    );
  }

  /**
   * Create a plane in XZ facing +Y, centered at the origin.
   * @param engine - The engine that owns the mesh
   * @param width - The full size along X in local units
   * @param height - The full size along Z in local units
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createPlane(engine: Engine, width: number, height: number, options: PlaneMeshOptions = {}): ModelMesh {
    const { horizontalSegments = 1, verticalSegments = horizontalSegments } = options;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createPlaneData,
      [width, height, horizontalSegments, verticalSegments],
      options
    );
  }

  /**
   * Create a cylinder centered on Y with equal end radii.
   * @param engine - The engine that owns the mesh
   * @param radius - The radius in local units
   * @param height - The full size along Y in local units
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createCylinder(engine: Engine, radius: number, height: number, options: CylinderMeshOptions = {}): ModelMesh {
    const { radialSegments = 20, heightSegments = 1, caps = PrimitiveMeshCapMode.Both, angleRange } = options;
    const startAngle = angleRange?.x ?? 0;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createCylinderData,
      [
        radius,
        radius,
        height,
        radialSegments,
        heightSegments,
        caps === PrimitiveMeshCapMode.Both || caps === PrimitiveMeshCapMode.Top,
        caps === PrimitiveMeshCapMode.Both || caps === PrimitiveMeshCapMode.Bottom,
        startAngle,
        (angleRange?.y ?? 360) - startAngle
      ],
      options
    );
  }

  /**
   * Create a truncated cone centered on Y with independently sized ends.
   * @param engine - The engine that owns the mesh
   * @param topRadius - The top radius in local units
   * @param bottomRadius - The bottom radius in local units
   * @param height - The full size along Y in local units
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createTruncatedCone(
    engine: Engine,
    topRadius: number,
    bottomRadius: number,
    height: number,
    options: TruncatedConeMeshOptions = {}
  ): ModelMesh {
    const { radialSegments = 20, heightSegments = 1, caps = PrimitiveMeshCapMode.Both, angleRange } = options;
    const startAngle = angleRange?.x ?? 0;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createCylinderData,
      [
        topRadius,
        bottomRadius,
        height,
        radialSegments,
        heightSegments,
        caps === PrimitiveMeshCapMode.Both || caps === PrimitiveMeshCapMode.Top,
        caps === PrimitiveMeshCapMode.Both || caps === PrimitiveMeshCapMode.Bottom,
        startAngle,
        (angleRange?.y ?? 360) - startAngle
      ],
      options
    );
  }

  /**
   * Create a cone centered on Y with its tip at the top.
   * @param engine - The engine that owns the mesh
   * @param radius - The bottom radius in local units
   * @param height - The full size along Y in local units
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createCone(engine: Engine, radius: number, height: number, options: ConeMeshOptions = {}): ModelMesh {
    const { radialSegments = 20, heightSegments = 1, cap = true, angleRange } = options;
    const startAngle = angleRange?.x ?? 0;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createCylinderData,
      [0, radius, height, radialSegments, heightSegments, false, cap, startAngle, (angleRange?.y ?? 360) - startAngle],
      options
    );
  }

  /**
   * Create a capsule centered on Y.
   * @param engine - The engine that owns the mesh
   * @param radius - The radius of the cylinder and hemispherical ends in local units
   * @param height - The straight cylindrical section height in local units; total height is `height + 2 * radius`
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createCapsule(engine: Engine, radius: number, height: number, options: CapsuleMeshOptions = {}): ModelMesh {
    const { radialSegments = 6, capSegments = radialSegments, heightSegments = 1 } = options;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createCapsuleData,
      [radius, height, radialSegments, capSegments, heightSegments],
      options
    );
  }

  /**
   * Create a torus centered in XY around Z.
   * @param engine - The engine that owns the mesh
   * @param radius - The distance from the origin to the tube centerline in local units
   * @param tubeRadius - The radius of the tube cross-section in local units
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createTorus(engine: Engine, radius: number, tubeRadius: number, options: TorusMeshOptions = {}): ModelMesh {
    const { tubularSegments = 30, radialSegments = 30, angleRange, tubeRange } = options;
    const startAngle = angleRange?.x ?? 0;
    const tubeStartAngle = tubeRange?.x ?? 0;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createTorusData,
      [
        radius,
        tubeRadius,
        radialSegments,
        tubularSegments,
        (angleRange?.y ?? 360) - startAngle,
        tubeStartAngle,
        (tubeRange?.y ?? 360) - tubeStartAngle,
        startAngle
      ],
      options
    );
  }

  /**
   * Create a filled disk or sector in XY facing +Z.
   * @param engine - The engine that owns the mesh
   * @param radius - The radius in local units
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createCircle(engine: Engine, radius: number, options: CircleMeshOptions = {}): ModelMesh {
    const { segments = 32, angleRange } = options;
    const startAngle = angleRange?.x ?? 0;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createCircleData,
      [radius, segments, startAngle, (angleRange?.y ?? 360) - startAngle],
      options
    );
  }

  /**
   * Create a ring or ring sector in XY facing +Z.
   * @param engine - The engine that owns the mesh
   * @param outerRadius - The outer radius in local units
   * @param innerRadius - The inner radius in local units
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createRing(
    engine: Engine,
    outerRadius: number,
    innerRadius: number,
    options: RingMeshOptions = {}
  ): ModelMesh {
    const { radialSegments = 32, widthSegments = 1, angleRange } = options;
    const startAngle = angleRange?.x ?? 0;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createRingData,
      [innerRadius, outerRadius, radialSegments, widthSegments, startAngle, (angleRange?.y ?? 360) - startAngle],
      options
    );
  }

  /**
   * Create a regular tetrahedron or its spherical subdivision.
   * @param engine - The engine that owns the mesh
   * @param radius - The distance from the origin to each vertex in local units
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createTetrahedron(engine: Engine, radius: number, options: RegularPolyhedronMeshOptions = {}): ModelMesh {
    const { segments = 1 } = options;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createRegularPolyhedronData,
      ["tetrahedron", radius, segments],
      options
    );
  }

  /**
   * Create a regular octahedron or its spherical subdivision.
   * @param engine - The engine that owns the mesh
   * @param radius - The distance from the origin to each vertex in local units
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createOctahedron(engine: Engine, radius: number, options: RegularPolyhedronMeshOptions = {}): ModelMesh {
    const { segments = 1 } = options;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createRegularPolyhedronData,
      ["octahedron", radius, segments],
      options
    );
  }

  /**
   * Create a regular icosahedron or its spherical subdivision.
   * @param engine - The engine that owns the mesh
   * @param radius - The distance from the origin to each vertex in local units
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createIcosahedron(engine: Engine, radius: number, options: RegularPolyhedronMeshOptions = {}): ModelMesh {
    const { segments = 1 } = options;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createRegularPolyhedronData,
      ["icosahedron", radius, segments],
      options
    );
  }

  /**
   * Create a regular dodecahedron or its spherical subdivision.
   * @param engine - The engine that owns the mesh
   * @param radius - The distance from the origin to each vertex in local units
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createDodecahedron(engine: Engine, radius: number, options: RegularPolyhedronMeshOptions = {}): ModelMesh {
    const { segments = 1 } = options;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createRegularPolyhedronData,
      ["dodecahedron", radius, segments],
      options
    );
  }

  /**
   * Revolve a radius-height profile around Y.
   * @param engine - The engine that owns the mesh
   * @param profile - The radius-height profile, with at least two points; X is radius and Y is height
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createLathe(engine: Engine, profile: readonly Vector2[], options: LatheMeshOptions = {}): ModelMesh {
    const { segments = 12, angleRange } = options;
    const startAngle = angleRange?.x ?? 0;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createLatheData,
      [profile, segments, startAngle, (angleRange?.y ?? 360) - startAngle],
      options
    );
  }

  /**
   * Sweep a circular cross-section along a path.
   * @param engine - The engine that owns the mesh
   * @param path - The centerline points, resampled at equal distances along the polyline; at least two distinct points are required
   * @param radius - The radius of the cross-section in local units
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createTube(
    engine: Engine,
    path: readonly Vector3[],
    radius: number,
    options: TubeMeshOptions = {}
  ): ModelMesh {
    const { tubularSegments = 64, radialSegments = 8, closed = false } = options;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createTubeData,
      [path, radius, tubularSegments, radialSegments, closed],
      options
    );
  }

  /**
   * Triangulate one or more polygons in XY facing +Z.
   * @param engine - The engine that owns the mesh
   * @param shapes - A contour, a polygon with holes, or an array of polygons; closing points need not be repeated
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createPolygon(
    engine: Engine,
    shapes: readonly Vector2[] | PolygonShape | readonly PolygonShape[],
    options: PolygonMeshOptions = {}
  ): ModelMesh {
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createPolygonData,
      [PrimitiveMesh._polygons(shapes)],
      options
    );
  }

  /**
   * Extrude polygons along +Z or a spatial path.
   * @remarks
   * A path selects path extrusion and ignores bevel settings.
   * A numeric depth extrudes along +Z and ignores `closed`.
   * @param engine - The engine that owns the mesh
   * @param shapes - A contour, a polygon with holes, or an array of polygons; closing points need not be repeated
   * @param depthOrPath - The total depth along +Z, including bevels, or the path points with at least two distinct points
   * @param options - Linear or path extrusion settings
   * @returns The generated mesh
   */
  static createExtrusion(
    engine: Engine,
    shapes: readonly Vector2[] | PolygonShape | readonly PolygonShape[],
    depthOrPath: number | readonly Vector3[],
    options: LinearExtrusionMeshOptions | PathExtrusionMeshOptions = {}
  ): ModelMesh {
    const {
      steps = 1,
      closed = false,
      bevelSize = 0,
      bevelThickness = bevelSize,
      bevelOffset = 0,
      bevelSegments = 3
    }: LinearExtrusionMeshOptions & PathExtrusionMeshOptions = options;
    const path = typeof depthOrPath === "number" ? undefined : depthOrPath;
    const depth = typeof depthOrPath === "number" ? depthOrPath : 0;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createExtrusionData,
      [
        PrimitiveMesh._polygons(shapes),
        depth,
        steps,
        path,
        path ? closed : false,
        bevelThickness,
        bevelSize,
        bevelOffset,
        bevelSegments
      ],
      options
    );
  }

  /**
   * Create a closed torus knot. At least one of `p` and `q` must be nonzero.
   * @param engine - The engine that owns the mesh
   * @param radius - The base radius of the torus in local units
   * @param tubeRadius - The radius of the tube cross-section in local units
   * @param p - The signed integer revolution count around the torus axis; negative values reverse the winding
   * @param q - The signed integer revolution count through the torus hole; negative values reverse the winding
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createTorusKnot(
    engine: Engine,
    radius: number,
    tubeRadius: number,
    p: number,
    q: number,
    options: TorusKnotMeshOptions = {}
  ): ModelMesh {
    const { tubularSegments = 64, radialSegments = 8 } = options;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createTorusKnotData,
      [radius, tubeRadius, tubularSegments, radialSegments, p, q],
      options
    );
  }

  /**
   * Create an axis-aligned cuboid with rounded edges and corners.
   * @remarks
   * UVs preserve the cuboid's face orientations and account for rounded edge length.
   * @param engine - The engine that owns the mesh
   * @param width - The full size along X in local units
   * @param height - The full size along Y in local units
   * @param depth - The full size along Z in local units
   * @param cornerRadius - The edge and corner radius in local units, clamped to half the smallest dimension
   * @param options - Optional mesh generation settings
   * @returns The generated mesh
   */
  static createRoundedCuboid(
    engine: Engine,
    width: number,
    height: number,
    depth: number,
    cornerRadius: number,
    options: RoundedCuboidMeshOptions = {}
  ): ModelMesh {
    const { segments = 2 } = options;
    return PrimitiveMesh._createMesh(
      engine,
      PrimitiveMesh._createRoundedCuboidData,
      [width, height, depth, cornerRadius, segments],
      options
    );
  }

  private static _createPlaneData(
    width: number,
    height: number,
    horizontalSegments: number,
    verticalSegments: number
  ): PrimitiveMeshBuilder {
    const columns = PrimitiveMesh._getSegmentCount(horizontalSegments);
    const rows = PrimitiveMesh._getSegmentCount(verticalSegments);
    const data = new PrimitiveMeshBuilder((columns + 1) * (rows + 1), columns * rows * 6);
    for (let y = 0; y <= rows; y++) {
      for (let x = 0; x <= columns; x++) {
        data.addVertex((x / columns - 0.5) * width, 0, (y / rows - 0.5) * height, 0, 1, 0, x / columns, y / rows);
      }
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const a = y * (columns + 1) + x;
        const c = a + columns + 1;
        data.addTriangle(a, c, a + 1);
        data.addTriangle(a + 1, c, c + 1);
      }
    }
    data.boundsExtent = new Vector3(width / 2, 0, height / 2);
    return data;
  }

  private static _createCuboidData(
    width: number,
    height: number,
    depth: number,
    widthSegments: number,
    heightSegments: number,
    depthSegments: number
  ): PrimitiveMeshBuilder {
    const x = width / 2;
    const y = height / 2;
    const z = depth / 2;
    const sx = PrimitiveMesh._getSegmentCount(widthSegments);
    const sy = PrimitiveMesh._getSegmentCount(heightSegments);
    const sz = PrimitiveMesh._getSegmentCount(depthSegments);
    const data = new PrimitiveMeshBuilder(
      2 * ((sx + 1) * (sy + 1) + (sx + 1) * (sz + 1) + (sy + 1) * (sz + 1)),
      12 * (sx * sy + sx * sz + sy * sz)
    );
    // Origins and UV directions preserve the existing cuboid texture orientation
    grid(
      new Vector3(-x, y, -z),
      new Vector3(2 * x, 0, 0),
      new Vector3(0, 0, 2 * z),
      new Vector3(0, 1, 0),
      sx,
      sz,
      false,
      false
    );
    grid(
      new Vector3(-x, -y, -z),
      new Vector3(2 * x, 0, 0),
      new Vector3(0, 0, 2 * z),
      new Vector3(0, -1, 0),
      sx,
      sz,
      false,
      true
    );
    grid(
      new Vector3(-x, y, -z),
      new Vector3(0, 0, 2 * z),
      new Vector3(0, -2 * y, 0),
      new Vector3(-1, 0, 0),
      sz,
      sy,
      false,
      false
    );
    grid(
      new Vector3(x, y, -z),
      new Vector3(0, 0, 2 * z),
      new Vector3(0, -2 * y, 0),
      new Vector3(1, 0, 0),
      sz,
      sy,
      true,
      false
    );
    grid(
      new Vector3(-x, y, z),
      new Vector3(2 * x, 0, 0),
      new Vector3(0, -2 * y, 0),
      new Vector3(0, 0, 1),
      sx,
      sy,
      false,
      false
    );
    grid(
      new Vector3(-x, y, -z),
      new Vector3(2 * x, 0, 0),
      new Vector3(0, -2 * y, 0),
      new Vector3(0, 0, -1),
      sx,
      sy,
      true,
      false
    );
    data.boundsExtent = new Vector3(width / 2, height / 2, depth / 2);
    return data;

    function grid(
      origin: Vector3,
      u: Vector3,
      v: Vector3,
      normal: Vector3,
      columns: number,
      rows: number,
      flipU: boolean,
      flipV: boolean
    ): void {
      const base = data.vertexCount;
      const start = data.indexCount;
      const crossDot =
        (u.y * v.z - u.z * v.y) * normal.x + (u.z * v.x - u.x * v.z) * normal.y + (u.x * v.y - u.y * v.x) * normal.z;
      for (let row = 0; row <= rows; row++) {
        for (let column = 0; column <= columns; column++) {
          const a = column / columns;
          const b = row / rows;
          data.addVertex(
            origin.x + u.x * a + v.x * b,
            origin.y + u.y * a + v.y * b,
            origin.z + u.z * a + v.z * b,
            normal.x,
            normal.y,
            normal.z,
            flipU ? 1 - a : a,
            flipV ? 1 - b : b
          );
        }
      }
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const a = base + row * (columns + 1) + column;
          const c = a + columns + 1;
          if (crossDot > 0) {
            data.addTriangle(a, a + 1, c);
            data.addTriangle(a + 1, c + 1, c);
          } else {
            data.addTriangle(a, c, a + 1);
            data.addTriangle(a + 1, c, c + 1);
          }
        }
      }
      data.addGroup(start);
    }
  }

  private static _createCylinderData(
    radiusTop: number,
    radiusBottom: number,
    height: number,
    radialSegments: number,
    heightSegments: number,
    includeTopCap: boolean,
    includeBottomCap: boolean,
    startAngleDegrees: number,
    arcDegrees: number
  ): PrimitiveMeshBuilder {
    const radial = PrimitiveMesh._getSegmentCount(radialSegments, 3);
    const vertical = PrimitiveMesh._getSegmentCount(heightSegments);
    const startAngle = MathUtil.degreeToRadian(startAngleDegrees);
    const arc = MathUtil.degreeToRadian(arcDegrees);
    const circle = PrimitiveMesh._createArcSamples(radial, startAngle, arc);
    const slope = height === 0 ? 0 : (radiusBottom - radiusTop) / height;
    const full = Math.abs(arc) === Math.PI * 2;
    const capCount = (includeTopCap && radiusTop !== 0 ? 1 : 0) + (includeBottomCap && radiusBottom !== 0 ? 1 : 0);
    const sideTriangles = 2 * vertical - (radiusTop === 0 ? 1 : 0) - (radiusBottom === 0 ? 1 : 0);
    const data = new PrimitiveMeshBuilder(
      (radial + 1) * (vertical + 1) + capCount * (radial + (full ? 1 : 2)),
      radial * (sideTriangles + capCount) * 3
    );
    for (let y = 0; y <= vertical; y++) {
      const v = y / vertical;
      const radius = radiusBottom + (radiusTop - radiusBottom) * v;
      for (let x = 0; x <= radial; x++) {
        const u = x / radial;
        const cos = circle[x * 2];
        const sin = circle[x * 2 + 1];
        data.addVertex(radius * sin, (v - 0.5) * height, radius * cos, sin, slope, cos, u, 1 - v);
      }
    }
    for (let y = 0; y < vertical; y++) {
      for (let x = 0; x < radial; x++) {
        const a = y * (radial + 1) + x;
        const c = a + radial + 1;
        if (radiusBottom !== 0 || y !== 0) {
          data.addTriangle(a + 1, c, a);
        }
        if (radiusTop !== 0 || y !== vertical - 1) {
          data.addTriangle(a + 1, c + 1, c);
        }
      }
    }
    data.addGroup(0);
    if (includeTopCap) {
      cap(radiusTop, 1);
    }
    if (includeBottomCap) {
      cap(radiusBottom, -1);
    }
    data.boundsExtent = new Vector3(Math.max(radiusTop, radiusBottom), height / 2, Math.max(radiusTop, radiusBottom));
    return data;

    function cap(radius: number, sign: number): void {
      if (radius === 0) {
        return;
      }
      const start = data.indexCount;
      const center = data.addVertex(0, (sign * height) / 2, 0, 0, sign, 0, 0.5, 0.5);
      // A partial cap includes both endpoints; a full cap reuses its first rim vertex
      const rimCount = full ? radial : radial + 1;
      for (let x = 0; x < rimCount; x++) {
        const cos = circle[x * 2];
        const sin = circle[x * 2 + 1];
        data.addVertex(
          radius * sin,
          (sign * height) / 2,
          radius * cos,
          0,
          sign,
          0,
          (sin + 1) / 2,
          (cos * sign + 1) / 2
        );
      }
      for (let x = 0; x < radial; x++) {
        const current = center + x + 1;
        const next = full && x === radial - 1 ? center + 1 : current + 1;
        if (sign > 0) {
          data.addTriangle(center, current, next);
        } else {
          data.addTriangle(center, next, current);
        }
      }
      data.addGroup(start);
    }
  }

  private static _createCapsuleData(
    radius: number,
    height: number,
    radialSegments: number,
    capSegments: number,
    heightSegments: number
  ): PrimitiveMeshBuilder {
    const radial = PrimitiveMesh._getSegmentCount(radialSegments, 3);
    const caps = PrimitiveMesh._getSegmentCount(capSegments);
    const vertical = PrimitiveMesh._getSegmentCount(heightSegments);
    const rows = caps * 2 + vertical;
    const circle = PrimitiveMesh._createArcSamples(radial, Math.PI);
    const capLength = (Math.PI * radius) / 2;
    const totalLength = capLength * 2 + height;
    const data = new PrimitiveMeshBuilder((radial + 1) * (rows + 1), radial * (rows - 1) * 6);
    for (let y = 0; y <= rows; y++) {
      let py: number;
      let ringRadius: number;
      let ny: number;
      let distance: number;
      if (y <= caps) {
        const angle = ((y / caps) * Math.PI) / 2;
        ringRadius = radius * Math.sin(angle);
        ny = -Math.cos(angle);
        py = -height / 2 + radius * ny;
        distance = (y / caps) * capLength;
      } else if (y <= caps + vertical) {
        ringRadius = radius;
        ny = 0;
        py = -height / 2 + ((y - caps) / vertical) * height;
        distance = capLength + ((y - caps) / vertical) * height;
      } else {
        const angle = (((y - caps - vertical) / caps) * Math.PI) / 2;
        ringRadius = radius * Math.cos(angle);
        ny = Math.sin(angle);
        py = height / 2 + radius * ny;
        distance = capLength + height + ((y - caps - vertical) / caps) * capLength;
      }
      const normalRadius = Math.sqrt(Math.max(0, 1 - ny * ny));
      // Center pole UVs between the other two vertices of each triangle
      const offset = y === 0 ? -0.5 / radial : y === rows ? 0.5 / radial : 0;
      for (let x = 0; x <= radial; x++) {
        const cos = circle[x * 2];
        const sin = circle[x * 2 + 1];
        data.addVertex(
          ringRadius * sin,
          py,
          ringRadius * cos,
          sin * normalRadius,
          ny,
          cos * normalRadius,
          x / radial + offset,
          totalLength > 0 ? 1 - distance / totalLength : 0
        );
      }
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < radial; x++) {
        const a = y * (radial + 1) + x;
        const c = a + radial + 1;
        if (y !== 0) {
          data.addTriangle(a + 1, c, a);
        }
        if (y !== rows - 1) {
          data.addTriangle(a + 1, c + 1, c);
        }
      }
    }
    data.boundsExtent = new Vector3(radius, height / 2 + radius, radius);
    return data;
  }

  private static _createTorusData(
    radius: number,
    tubeRadius: number,
    radialSegments: number,
    tubularSegments: number,
    arcDegrees: number,
    tubeStartAngleDegrees: number,
    tubeArcDegrees: number,
    startAngleDegrees: number
  ): PrimitiveMeshBuilder {
    const radial = PrimitiveMesh._getSegmentCount(radialSegments, 3);
    const tubular = PrimitiveMesh._getSegmentCount(tubularSegments, 1);
    const arc = MathUtil.degreeToRadian(arcDegrees);
    const tubeStart = MathUtil.degreeToRadian(tubeStartAngleDegrees);
    const tubeArc = MathUtil.degreeToRadian(tubeArcDegrees);
    const circle = PrimitiveMesh._createArcSamples(tubular, MathUtil.degreeToRadian(startAngleDegrees), arc);
    const data = new PrimitiveMeshBuilder((radial + 1) * (tubular + 1), radial * tubular * 6);
    for (let y = 0; y <= radial; y++) {
      const v = tubeStart + (y / radial) * tubeArc;
      const cosV = Math.cos(v);
      const nz = Math.sin(v);
      for (let x = 0; x <= tubular; x++) {
        const cosU = circle[x * 2];
        const sinU = circle[x * 2 + 1];
        const nx = cosV * cosU;
        const ny = cosV * sinU;
        data.addVertex(
          radius * cosU + tubeRadius * nx,
          radius * sinU + tubeRadius * ny,
          tubeRadius * nz,
          nx,
          ny,
          nz,
          x / tubular,
          y / radial
        );
      }
    }
    for (let y = 0; y < radial; y++) {
      for (let x = 0; x < tubular; x++) {
        const a = y * (tubular + 1) + x;
        const c = a + tubular + 1;
        data.addTriangle(c, a, c + 1);
        data.addTriangle(a, a + 1, c + 1);
      }
    }
    data.boundsExtent = new Vector3(radius + tubeRadius, radius + tubeRadius, tubeRadius);
    return data;
  }

  private static _createCircleData(
    radius: number,
    segments: number,
    startAngle: number,
    arcDegrees: number
  ): PrimitiveMeshBuilder {
    const count = PrimitiveMesh._getSegmentCount(segments, 3);
    const start = MathUtil.degreeToRadian(startAngle);
    const arc = MathUtil.degreeToRadian(arcDegrees);
    const data = new PrimitiveMeshBuilder(count + 2, count * 3);
    data.addVertex(0, 0, 0, 0, 0, 1, 0.5, 0.5);
    for (let i = 0; i <= count; i++) {
      const angle = start + (i / count) * arc;
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      data.addVertex(radius * x, radius * y, 0, 0, 0, 1, (x + 1) / 2, (y + 1) / 2);
      if (i > 0) {
        data.addTriangle(0, i, i + 1);
      }
    }
    return data;
  }

  private static _createRingData(
    innerRadius: number,
    outerRadius: number,
    radialSegments: number,
    widthSegments: number,
    startAngle: number,
    arcDegrees: number
  ): PrimitiveMeshBuilder {
    const radial = PrimitiveMesh._getSegmentCount(radialSegments, 3);
    const width = PrimitiveMesh._getSegmentCount(widthSegments);
    const start = MathUtil.degreeToRadian(startAngle);
    const arc = MathUtil.degreeToRadian(arcDegrees);
    const circle = PrimitiveMesh._createArcSamples(radial, start, arc);
    const data = new PrimitiveMeshBuilder((radial + 1) * (width + 1), radial * width * 6);
    for (let y = 0; y <= width; y++) {
      const radius = innerRadius + ((outerRadius - innerRadius) * y) / width;
      for (let x = 0; x <= radial; x++) {
        const px = radius * circle[x * 2];
        const py = radius * circle[x * 2 + 1];
        data.addVertex(
          px,
          py,
          0,
          0,
          0,
          1,
          outerRadius !== 0 ? (px / outerRadius + 1) / 2 : 0.5,
          outerRadius !== 0 ? (py / outerRadius + 1) / 2 : 0.5
        );
      }
    }
    for (let y = 0; y < width; y++) {
      for (let x = 0; x < radial; x++) {
        const a = y * (radial + 1) + x;
        const c = a + radial + 1;
        data.addTriangle(a, c, a + 1);
        data.addTriangle(a + 1, c, c + 1);
      }
    }
    return data;
  }

  private static _createRoundedCuboidData(
    width: number,
    height: number,
    depth: number,
    cornerRadius: number,
    edgeSegments: number
  ): PrimitiveMeshBuilder {
    const radius = Math.max(0, Math.min(cornerRadius, width / 2, height / 2, depth / 2));
    if (radius === 0) {
      return PrimitiveMesh._createCuboidData(width, height, depth, 1, 1, 1);
    }
    const cornerSegments = PrimitiveMesh._getSegmentCount(edgeSegments);
    const count = cornerSegments * 2 + 1;
    const data = PrimitiveMesh._createCuboidData(width, height, depth, count, count, count);
    const inner = new Vector3(width / 2 - radius, height / 2 - radius, depth / 2 - radius);
    const center = new Vector3();
    const delta = new Vector3();
    const components = ["x", "y", "z"] as const;
    const uvAxes = { x: ["z", "y"], y: ["x", "z"], z: ["x", "y"] } as const;
    for (let i = 0; i < data.vertexCount * 8; i += 8) {
      const faceAxis = data.vertices[i + 3] !== 0 ? "x" : data.vertices[i + 4] !== 0 ? "y" : "z";
      for (let axis = 0; axis < 3; axis++) {
        const component = components[axis];
        const halfSize = inner[component] + radius;
        const gridIndex = Math.round(((data.vertices[i + axis] / halfSize + 1) / 2) * count);
        const p =
          gridIndex <= cornerSegments
            ? -inner[component] - radius * (1 - gridIndex / cornerSegments)
            : inner[component] + (radius * (gridIndex - cornerSegments - 1)) / cornerSegments;
        center[component] = Math.max(-inner[component], Math.min(inner[component], p));
        delta[component] = p - center[component];
      }
      const length = Math.hypot(delta.x, delta.y, delta.z);
      for (let axis = 0; axis < 3; axis++) {
        const component = components[axis];
        const n = delta[component] / length;
        data.vertices[i + axis] = center[component] + n * radius;
        data.vertices[i + 3 + axis] = n;
      }
      for (let uv = 0; uv < 2; uv++) {
        const component = uvAxes[faceAxis][uv];
        const angle = Math.atan2(Math.abs(delta[component]), Math.abs(delta[faceAxis]));
        const distance = Math.abs(center[component]) + radius * angle;
        const surfaceLength = inner[component] * 2 + (Math.PI * radius) / 2;
        const direction = Math.sign(data.vertices[i + 6 + uv] - 0.5);
        data.vertices[i + 6 + uv] = 0.5 + (direction * distance) / surfaceLength;
      }
    }
    return data;
  }

  private static _createLatheData(
    points: readonly Vector2[],
    segmentCount: number,
    startAngle: number,
    arcDegrees: number
  ): PrimitiveMeshBuilder {
    if (points.length < 2) {
      throw new Error("A lathe profile needs at least two points.");
    }
    const count = PrimitiveMesh._getSegmentCount(segmentCount);
    const start = MathUtil.degreeToRadian(startAngle);
    const arc = MathUtil.degreeToRadian(arcDegrees);
    const data = new PrimitiveMeshBuilder((count + 1) * points.length, count * (points.length - 1) * 6);
    const normals: Vector3[] = [];
    for (let i = 0; i < points.length; i++) {
      const previous = points[Math.max(0, i - 1)];
      const current = points[i];
      const next = points[Math.min(points.length - 1, i + 1)];
      const a = PrimitiveMesh._normalizeVector(new Vector3(current.y - previous.y, previous.x - current.x, 0));
      const b = PrimitiveMesh._normalizeVector(new Vector3(next.y - current.y, current.x - next.x, 0));
      normals.push(PrimitiveMesh._normalizeVector(a.add(b)));
    }
    for (let x = 0; x <= count; x++) {
      const angle = start + (x / count) * arc;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      for (let y = 0; y < points.length; y++) {
        const point = points[y];
        const normal = normals[y];
        data.addVertex(
          point.x * sin,
          point.y,
          point.x * cos,
          normal.x * sin,
          normal.y,
          normal.x * cos,
          x / count,
          y / (points.length - 1)
        );
      }
    }
    for (let x = 0; x < count; x++) {
      for (let y = 0; y < points.length - 1; y++) {
        const a = x * points.length + y;
        const b = a + points.length;
        if (points[y].x !== 0) {
          data.addTriangle(a, b, a + 1);
        }
        if (points[y + 1].x !== 0) {
          data.addTriangle(b, b + 1, a + 1);
        }
      }
    }
    return data;
  }

  private static _createTubeData(
    path: readonly Vector3[],
    radius: number,
    tubularSegments: number,
    radialSegments: number,
    closed: boolean
  ): PrimitiveMeshBuilder {
    const tangents: Vector3[] = [];
    const points = MeshPathUtils.sample(path, PrimitiveMesh._getSegmentCount(tubularSegments), closed, tangents);
    return PrimitiveMesh._createTubeSurfaceData(points, radius, radialSegments, closed, tangents);
  }

  private static _createTubeSurfaceData(
    points: readonly Vector3[],
    radius: number,
    radialSegments: number,
    closed: boolean,
    fallbackTangents?: readonly Vector3[]
  ): PrimitiveMeshBuilder {
    const count = points.length - 1;
    const radial = PrimitiveMesh._getSegmentCount(radialSegments, 3);
    const frames = MeshPathUtils.computeFrames(points, closed, fallbackTangents);
    const data = new PrimitiveMeshBuilder((count + 1) * (radial + 1), count * radial * 6);
    const circle = PrimitiveMesh._createArcSamples(radial);
    for (let y = 0; y <= count; y++) {
      const point = points[y];
      const normal = frames.normals[y];
      const binormal = frames.binormals[y];
      for (let x = 0; x <= radial; x++) {
        const c = circle[x * 2];
        const s = circle[x * 2 + 1];
        const nx = normal.x * c + binormal.x * s;
        const ny = normal.y * c + binormal.y * s;
        const nz = normal.z * c + binormal.z * s;
        data.addVertex(
          point.x + radius * nx,
          point.y + radius * ny,
          point.z + radius * nz,
          nx,
          ny,
          nz,
          y / count,
          x / radial
        );
      }
    }
    for (let y = 0; y < count; y++) {
      for (let x = 0; x < radial; x++) {
        const a = y * (radial + 1) + x;
        const c = a + radial + 1;
        data.addTriangle(a, a + 1, c);
        data.addTriangle(a + 1, c + 1, c);
      }
    }
    return data;
  }

  private static _createTorusKnotData(
    radius: number,
    tubeRadius: number,
    tubularSegments: number,
    radialSegments: number,
    p: number,
    q: number
  ): PrimitiveMeshBuilder {
    if (p === 0 && q === 0) {
      throw new Error("A torus knot needs at least one nonzero winding.");
    }
    const count = PrimitiveMesh._getSegmentCount(tubularSegments);
    const points: Vector3[] = [];
    const tangents: Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const u = p * angle;
      const v = q * angle;
      points.push(
        new Vector3(
          (radius * (2 + Math.cos(v)) * Math.cos(u)) / 2,
          (radius * (2 + Math.cos(v)) * Math.sin(u)) / 2,
          (radius * Math.sin(v)) / 2
        )
      );
      const radialDerivative = -q * Math.sin(v);
      const angularDerivative = p * (2 + Math.cos(v));
      tangents.push(
        new Vector3(
          radialDerivative * Math.cos(u) - angularDerivative * Math.sin(u),
          radialDerivative * Math.sin(u) + angularDerivative * Math.cos(u),
          q * Math.cos(v)
        )
      );
    }
    points.push(points[0]);
    tangents.push(tangents[0]);
    return PrimitiveMesh._createTubeSurfaceData(points, tubeRadius, radialSegments, true, tangents);
  }

  private static _createRegularPolyhedronData(
    type: "tetrahedron" | "octahedron" | "icosahedron" | "dodecahedron",
    radius: number,
    segments: number
  ): PrimitiveMeshBuilder {
    const [positions, indices] = PrimitiveMesh._regularPolyhedra[type];
    const divisions = PrimitiveMesh._getSegmentCount(segments);
    const vertexCount = indices.length * divisions * divisions;
    const data = new PrimitiveMeshBuilder(vertexCount, vertexCount);
    const vertices = new Float64Array(((divisions + 1) * (divisions + 2) * 8) / 2);
    const left = new Vector3();
    const right = new Vector3();
    const point = new Vector3();
    for (let face = 0; face < indices.length; face += 3) {
      let offset = 0;
      for (let i = 0; i <= divisions; i++) {
        left.copyFromArray(positions, indices[face] * 3);
        right.copyFromArray(positions, indices[face + 1] * 3);
        point.copyFromArray(positions, indices[face + 2] * 3);
        Vector3.lerp(left, point, i / divisions, left);
        Vector3.lerp(right, point, i / divisions, right);
        for (let j = 0; j <= divisions - i; j++) {
          Vector3.lerp(left, right, divisions === i ? 0 : j / (divisions - i), point);
          PrimitiveMesh._normalizeVector(point);
          vertices[offset] = point.x * radius;
          vertices[offset + 1] = point.y * radius;
          vertices[offset + 2] = point.z * radius;
          point.copyToArray(vertices, offset + 3);
          vertices[offset + 6] = Math.atan2(point.z, -point.x) / (2 * Math.PI) + 0.5;
          vertices[offset + 7] = Math.acos(Math.max(-1, Math.min(1, point.y))) / Math.PI;
          offset += 8;
        }
      }
      let row = 0;
      for (let i = 0; i < divisions; i++) {
        const next = row + divisions - i + 1;
        for (let j = 0; j < divisions - i; j++) {
          PrimitiveMesh._addPolyhedronFace(
            data,
            vertices,
            (row + j + 1) * 8,
            (next + j) * 8,
            (row + j) * 8,
            divisions === 1
          );
          if (j < divisions - i - 1) {
            PrimitiveMesh._addPolyhedronFace(
              data,
              vertices,
              (row + j + 1) * 8,
              (next + j + 1) * 8,
              (next + j) * 8,
              divisions === 1
            );
          }
        }
        row = next;
      }
    }
    return data;
  }

  private static _addPolyhedronFace(
    data: PrimitiveMeshBuilder,
    vertices: Float64Array,
    a: number,
    b: number,
    c: number,
    flat: boolean
  ): void {
    let uA = vertices[a + 6];
    let uB = vertices[b + 6];
    let uC = vertices[c + 6];
    const poleA = Math.abs(vertices[a + 4]) > 1 - 1e-10;
    const poleB = Math.abs(vertices[b + 4]) > 1 - 1e-10;
    const poleC = Math.abs(vertices[c + 4]) > 1 - 1e-10;
    if (poleA) {
      uA = uB;
    }
    if (poleB) {
      uB = uC;
    }
    if (poleC) {
      uC = uA;
    }
    const minU = Math.min(uA, uB, uC);
    const maxU = Math.max(uA, uB, uC);
    const middleU = uA === minU ? Math.min(uB, uC) : uB === minU ? Math.min(uA, uC) : Math.min(uA, uB);
    // Choose the shortest U interval before averaging pole coordinates
    let gap = 1 + minU - maxU;
    let startU = minU;
    if (middleU - minU > gap) {
      gap = middleU - minU;
      startU = middleU;
    }
    if (maxU - middleU > gap) {
      startU = maxU;
    }
    if (uA < startU) {
      uA += 1;
    }
    if (uB < startU) {
      uB += 1;
    }
    if (uC < startU) {
      uC += 1;
    }
    if (poleA) {
      uA = (uB + uC) / 2;
    }
    if (poleB) {
      uB = (uC + uA) / 2;
    }
    if (poleC) {
      uC = (uA + uB) / 2;
    }
    let nx = 0;
    let ny = 0;
    let nz = 0;
    if (flat) {
      const abX = vertices[b] - vertices[a];
      const abY = vertices[b + 1] - vertices[a + 1];
      const abZ = vertices[b + 2] - vertices[a + 2];
      const acX = vertices[c] - vertices[a];
      const acY = vertices[c + 1] - vertices[a + 1];
      const acZ = vertices[c + 2] - vertices[a + 2];
      nx = abY * acZ - abZ * acY;
      ny = abZ * acX - abX * acZ;
      nz = abX * acY - abY * acX;
      const length = Math.hypot(nx, ny, nz);
      const inverse = length > 0 ? 1 / length : 0;
      nx *= inverse;
      ny *= inverse;
      nz *= inverse;
    }
    const start = data.vertexCount;
    for (let i = 0; i < 3; i++) {
      const offset = i === 0 ? a : i === 1 ? b : c;
      data.addVertex(
        vertices[offset],
        vertices[offset + 1],
        vertices[offset + 2],
        flat ? nx : vertices[offset + 3],
        flat ? ny : vertices[offset + 4],
        flat ? nz : vertices[offset + 5],
        i === 0 ? uA : i === 1 ? uB : uC,
        vertices[offset + 7]
      );
    }
    data.addTriangle(start, start + 1, start + 2);
  }

  private static _createPolygonData(shapes: readonly PolygonShape[]): PrimitiveMeshBuilder {
    const data = new PrimitiveMeshBuilder();
    for (const polygon of shapes) {
      const contours = PolygonUtils.prepareContours(polygon);
      const { points, indices } = PolygonUtils.triangulateContours(contours);
      const base = data.vertexCount;
      const start = data.indexCount;
      for (const point of points) {
        data.addVertex(point.x, point.y, 0, 0, 0, 1, point.x, point.y);
      }
      for (const index of indices) {
        data.addIndex(base + index);
      }
      data.addGroup(start);
    }
    return data;
  }

  private static _createExtrusionData(
    shapes: readonly PolygonShape[],
    depth: number,
    stepCount: number,
    pathInput: readonly Vector3[] | undefined,
    closed: boolean,
    bevelThickness: number,
    bevelSize: number,
    bevelOffset: number,
    bevelSegmentCount: number
  ): PrimitiveMeshBuilder {
    const data = new PrimitiveMeshBuilder();
    const steps = PrimitiveMesh._getSegmentCount(stepCount, closed ? 3 : 1);
    const tangents: Vector3[] = [];
    const path = pathInput ? MeshPathUtils.sample(pathInput, steps, closed, tangents) : undefined;
    const frames = path ? MeshPathUtils.computeFrames(path, closed, tangents) : undefined;
    const bevelEnabled = !path && bevelSize > 0;
    const bevelSegments = bevelEnabled ? PrimitiveMesh._getSegmentCount(bevelSegmentCount) : 0;
    const thickness = bevelEnabled ? Math.min(bevelThickness, depth / 2) : 0;
    const size = bevelEnabled ? bevelSize : 0;
    const offset = path ? 0 : bevelOffset;
    const layers: { z: number; inset: number }[] = [];
    const uvA = new Vector2();
    const uvB = new Vector2();
    const uvC = new Vector2();
    const uvD = new Vector2();
    for (let i = 0; i < bevelSegments; i++) {
      const angle = ((i / bevelSegments) * Math.PI) / 2;
      layers.push({ z: thickness * (1 - Math.cos(angle)), inset: size * (1 - Math.sin(angle)) });
    }
    for (let i = 0; i <= steps; i++) {
      layers.push({ z: thickness + ((depth - thickness * 2) * i) / steps, inset: 0 });
    }
    for (let i = 1; i <= bevelSegments; i++) {
      const angle = ((i / bevelSegments) * Math.PI) / 2;
      layers.push({
        z: depth - thickness + thickness * Math.sin(angle),
        inset: size * (1 - Math.cos(angle))
      });
    }

    for (const polygon of shapes) {
      const contours = PolygonUtils.prepareContours(polygon);
      const offsetContours = new Array<Vector2[][]>(layers.length);
      for (let i = 0; i < layers.length; i++) {
        offsetContours[i] =
          i > 0 && layers[i].inset === layers[i - 1].inset
            ? offsetContours[i - 1]
            : contours.map((contour) => PrimitiveMesh._insetContour(contour, layers[i].inset - offset));
      }
      const rings = offsetContours.map((contour, layer) => {
        const { z } = layers[layer];
        const center = path?.[layer];
        const normal = frames?.normals[layer];
        const binormal = frames?.binormals[layer];
        return contour.map((points) =>
          points.map((point) =>
            center
              ? new Vector3(
                  center.x + normal!.x * point.x + binormal!.x * point.y,
                  center.y + normal!.y * point.x + binormal!.y * point.y,
                  center.z + normal!.z * point.x + binormal!.z * point.y
                )
              : new Vector3(point.x, point.y, z)
          )
        );
      });
      if (!closed) {
        const capStart = data.indexCount;
        cap(0, false);
        cap(layers.length - 1, true);
        data.addGroup(capStart);
      }
      const sideStart = data.indexCount;
      for (let contour = 0; contour < contours.length; contour++) {
        const original = contours[contour];
        const distances = [0];
        for (let point = 0; point < original.length; point++) {
          const next = original[(point + 1) % original.length];
          distances.push(distances[point] + Math.hypot(next.x - original[point].x, next.y - original[point].y));
        }
        for (let layer = 0; layer < layers.length - 1; layer++) {
          for (let point = 0; point < original.length; point++) {
            const next = (point + 1) % original.length;
            const a = rings[layer][contour][point];
            const b = rings[layer][contour][next];
            const c = rings[layer + 1][contour][point];
            const d = rings[layer + 1][contour][next];
            uvA.set(distances[point], layer / (layers.length - 1));
            uvB.set(distances[point + 1], uvA.y);
            uvC.set(uvA.x, (layer + 1) / (layers.length - 1));
            uvD.set(uvB.x, uvC.y);
            data.addFace(a, b, c, uvA, uvB, uvC);
            data.addFace(b, d, c, uvB, uvD, uvC);
          }
        }
      }
      data.addGroup(sideStart);

      function cap(layer: number, top: boolean): void {
        const { points, indices } = PolygonUtils.triangulateContours(offsetContours[layer]);
        const positions = rings[layer].flat();
        for (let i = 0; i < indices.length; i += 3) {
          const a = indices[i];
          const b = indices[i + (top ? 1 : 2)];
          const c = indices[i + (top ? 2 : 1)];
          data.addFace(positions[a], positions[b], positions[c], points[a], points[b], points[c]);
        }
      }
    }
    return data;
  }

  private static _insetContour(contour: Vector2[], distance: number): Vector2[] {
    if (distance === 0) {
      return contour;
    }
    return contour.map((point, index) => {
      const previous = contour[(index + contour.length - 1) % contour.length];
      const next = contour[(index + 1) % contour.length];
      const ax = point.x - previous.x;
      const ay = point.y - previous.y;
      const bx = next.x - point.x;
      const by = next.y - point.y;
      const al = Math.hypot(ax, ay);
      const bl = Math.hypot(bx, by);
      const nx = -ay / al - by / bl;
      const ny = ax / al + bx / bl;
      const denominator = nx * (-by / bl) + ny * (bx / bl);
      const scale = Math.abs(denominator) > 1e-10 ? distance / denominator : 0;
      return new Vector2(point.x + nx * scale, point.y + ny * scale);
    });
  }

  private static _createSphereData(
    radius: number,
    subdivisions: number,
    horizontalStart: number,
    horizontalEnd: number,
    verticalStart: number,
    verticalEnd: number
  ): PrimitiveMeshBuilder {
    const horizontalArc = Math.min(360, horizontalEnd - horizontalStart);
    verticalStart = Math.max(0, verticalStart);
    verticalEnd = Math.min(180, verticalEnd);
    if (horizontalArc < 360 || verticalStart > 0 || verticalEnd < 180) {
      const surface = PrimitiveMesh._createSphereSurfaceData(1, subdivisions);
      return PrimitiveMesh._createSphereSectionData(
        surface,
        radius,
        horizontalStart,
        horizontalArc,
        verticalStart,
        verticalEnd
      );
    }

    const data = PrimitiveMesh._createSphereSurfaceData(radius, subdivisions);
    if (horizontalStart !== 0) {
      const angle = MathUtil.degreeToRadian(horizontalStart);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const vertices = data.vertices;
      for (let i = 0; i < vertices.length; i += 8) {
        const x = vertices[i];
        const z = vertices[i + 2];
        const nx = vertices[i + 3];
        const nz = vertices[i + 5];
        vertices[i] = x * cos + z * sin;
        vertices[i + 2] = -x * sin + z * cos;
        vertices[i + 3] = nx * cos + nz * sin;
        vertices[i + 5] = -nx * sin + nz * cos;
      }
    }
    return data;
  }

  private static _createSphereSectionData(
    surface: PrimitiveMeshBuilder,
    radius: number,
    horizontalStart: number,
    horizontalArc: number,
    verticalStart: number,
    verticalEnd: number
  ): PrimitiveMeshBuilder {
    const data = new PrimitiveMeshBuilder(surface.vertexCount, surface.indexCount);
    if (horizontalArc <= 0 || verticalEnd <= verticalStart) {
      return data;
    }
    const vertices = surface.vertices;
    const indices = surface.indices;
    const horizontalArcRadians = MathUtil.degreeToRadian(horizontalArc);
    const verticalStartRadians = MathUtil.degreeToRadian(verticalStart);
    const verticalArcRadians = MathUtil.degreeToRadian(verticalEnd - verticalStart);
    const startAngle = MathUtil.degreeToRadian(horizontalStart);
    const cos = Math.cos(startAngle);
    const sin = Math.sin(startAngle);
    const fullTurn = horizontalArc === 360;
    const segmentCount = fullTurn ? 1 : Math.ceil(horizontalArc / 180);
    const boundaries: { start: Vector3; end: Vector3 }[] = [];
    for (let i = 0; i < segmentCount; i++) {
      const start = (horizontalArcRadians * i) / segmentCount;
      const end = (horizontalArcRadians * (i + 1)) / segmentCount;
      boundaries.push({
        start: new Vector3(Math.sin(start), 0, Math.cos(start)),
        end: new Vector3(-Math.sin(end), 0, -Math.cos(end))
      });
    }
    const topNormal = new Vector3(0, -1, 0);
    const bottomNormal = new Vector3(0, 1, 0);
    const topOffset = -Math.cos(verticalStartRadians);
    const bottomOffset = Math.cos(MathUtil.degreeToRadian(verticalEnd));
    const vertexMap = new Map<string, number>();
    const trianglePoints = [new Vector3(), new Vector3(), new Vector3()];
    const verticalPoints: Vector3[] = [];
    const clippedPoints: Vector3[] = [];
    const polygonPoints: Vector3[] = [];
    const points = new Array<Vector3>(3);
    const uvs = new Float64Array(6);
    const poles = new Array<boolean>(3);
    const ab = new Vector3();
    const ac = new Vector3();
    for (let i = 0; i < indices.length; i += 3) {
      let triangle = trianglePoints;
      let triangleCount = 3;
      for (let corner = 0; corner < 3; corner++) {
        const offset = indices[i + corner] * 8;
        PrimitiveMesh._normalizeVector(
          triangle[corner].set(vertices[offset], vertices[offset + 1], vertices[offset + 2])
        );
      }
      if (verticalStart > 0) {
        triangleCount = PrimitiveMesh._clipSpherePolygon(triangle, triangleCount, topNormal, topOffset, verticalPoints);
        triangle = verticalPoints;
      }
      if (verticalEnd < 180) {
        const output = triangle === trianglePoints ? verticalPoints : trianglePoints;
        triangleCount = PrimitiveMesh._clipSpherePolygon(triangle, triangleCount, bottomNormal, bottomOffset, output);
        triangle = output;
      }
      for (const boundary of boundaries) {
        let polygon = triangle;
        let polygonCount = triangleCount;
        if (!fullTurn) {
          polygonCount = PrimitiveMesh._clipSpherePolygon(polygon, polygonCount, boundary.start, 0, clippedPoints);
          polygonCount = PrimitiveMesh._clipSpherePolygon(clippedPoints, polygonCount, boundary.end, 0, polygonPoints);
          polygon = polygonPoints;
        }
        for (let corner = 1; corner + 1 < polygonCount; corner++) {
          points[0] = polygon[0];
          points[1] = polygon[corner];
          points[2] = polygon[corner + 1];
          Vector3.subtract(points[1], points[0], ab);
          Vector3.subtract(points[2], points[0], ac);
          Vector3.cross(ab, ac, ab);
          if (ab.length() < 1e-12) {
            continue;
          }
          let minU = Infinity;
          let maxU = -Infinity;
          let nonPoleCount = 0;
          for (let j = 0; j < 3; j++) {
            const point = points[j];
            let angle = Math.atan2(point.z, -point.x);
            angle = angle < -1e-10 ? angle + Math.PI * 2 : Math.max(0, angle);
            const u = MathUtil.clamp(angle / horizontalArcRadians, 0, 1);
            uvs[j * 2] = u;
            uvs[j * 2 + 1] = MathUtil.clamp(
              (Math.acos(MathUtil.clamp(point.y, -1, 1)) - verticalStartRadians) / verticalArcRadians,
              0,
              1
            );
            poles[j] = Math.hypot(point.x, point.z) <= 1e-10;
            if (!poles[j]) {
              minU = Math.min(minU, u);
              maxU = Math.max(maxU, u);
              nonPoleCount++;
            }
          }
          let sumU = 0;
          for (let j = 0; j < 3; j++) {
            if (!poles[j]) {
              if (fullTurn && maxU - minU > 0.5 && uvs[j * 2] < 0.5) {
                uvs[j * 2] += 1;
              }
              sumU += uvs[j * 2];
            }
          }
          for (let j = 0; j < 3; j++) {
            const point = points[j];
            const u = poles[j] ? sumU / nonPoleCount : uvs[j * 2];
            const v = uvs[j * 2 + 1];
            const key = `${Math.round(point.x * 1e10)},${Math.round(point.y * 1e10)},${Math.round(point.z * 1e10)},${Math.round(u * 1e10)},${Math.round(v * 1e10)}`;
            let index = vertexMap.get(key);
            if (index === undefined) {
              const nx = point.x * cos + point.z * sin;
              const nz = -point.x * sin + point.z * cos;
              index = data.addVertex(radius * nx, radius * point.y, radius * nz, nx, point.y, nz, u, v);
              vertexMap.set(key, index);
            }
            data.addIndex(index);
          }
        }
      }
    }
    data.boundsExtent = new Vector3(radius, radius, radius);
    return data;
  }

  private static _clipSpherePolygon(
    polygon: readonly Vector3[],
    count: number,
    normal: Vector3,
    offset: number,
    out: Vector3[]
  ): number {
    if (count === 0) {
      return 0;
    }
    let resultCount = 0;
    let previous = polygon[count - 1];
    let previousDistance = Vector3.dot(previous, normal) - offset;
    for (let i = 0; i < count; i++) {
      const current = polygon[i];
      const distance = Vector3.dot(current, normal) - offset;
      const inside = distance >= -1e-9;
      const previousInside = previousDistance >= -1e-9;
      if (inside !== previousInside) {
        const point = (out[resultCount++] ??= new Vector3());
        const t = previousDistance / (previousDistance - distance);
        if (t < 1e-10) {
          point.copyFrom(previous);
        } else if (t > 1 - 1e-10) {
          point.copyFrom(current);
        } else {
          Vector3.lerp(previous, current, t, point);
          // Preserve latitude boundaries when projecting the intersection back onto the sphere
          const length = Math.hypot(point.x, point.z);
          const scale = length > 0 ? Math.sqrt(Math.max(0, 1 - point.y * point.y)) / length : 0;
          point.x *= scale;
          point.z *= scale;
        }
      }
      if (inside) {
        (out[resultCount++] ??= new Vector3()).copyFrom(current);
      }
      previous = current;
      previousDistance = distance;
    }
    return resultCount;
  }

  private static _createSphereSurfaceData(radius: number, subdivisions: number): PrimitiveMeshBuilder {
    // Level 7 exceeds the 16-bit vertex index range
    const level = MathUtil.clamp(Math.floor(subdivisions), 1, 6);

    const { positions, quads: cells } = SubdivisionUtils.subdivideQuads(
      PrimitiveMesh._sphereSeedPositions,
      PrimitiveMesh._sphereSeedCells,
      level
    );

    const positionCount = positions.length / 3;
    const cellsCount = cells.length / 4;
    const poleOffset = positionCount + Math.pow(2, level + 1) - 1;
    // Reserve pole duplicates so each triangle can use a local U coordinate
    const vertexCount = poleOffset + 16;

    const vertices = new Float32Array(vertexCount * 8);
    const indices = new Uint16Array(cellsCount * 6);

    let seamCount = 0;
    const seamVertices = <Record<number, number>>{};

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

      // Duplicate the seam so adjacent triangles can use U = 0 and U = 1
      if (vertices[offset + 6] === 0) {
        const seamOffset = 8 * (positionCount + seamCount++);

        vertices.set(vertices.subarray(offset, offset + 8), seamOffset);
        vertices[seamOffset + 6] = 1.0;

        seamVertices[offset / 8] = seamOffset / 8;
      }
    }

    let offset = 0;
    let poleIndex = 0;
    for (let i = 0; i < cellsCount; i++) {
      const idx = 4 * i;

      let indexA = cells[idx];
      let indexB = cells[idx + 1];
      let indexC = cells[idx + 2];
      let indexD = cells[idx + 3];

      const floatIndexA = 8 * indexA;
      const floatIndexB = 8 * indexB;
      const floatIndexC = 8 * indexC;
      const floatIndexD = 8 * indexD;

      // Use the U = 1 copies on the negative-Z side of the seam
      if (vertices[floatIndexA + 2] + vertices[floatIndexB + 2] + vertices[floatIndexC + 2] < 0) {
        if (vertices[floatIndexA + 6] === 0) {
          indexA = seamVertices[indexA];
        }
        if (vertices[floatIndexB + 6] === 0) {
          indexB = seamVertices[indexB];
        }
        if (vertices[floatIndexC + 6] === 0) {
          indexC = seamVertices[indexC];
        }
        if (vertices[floatIndexD + 6] === 0) {
          indexD = seamVertices[indexD];
        }
      }

      indices[offset] = indexA;
      indices[offset + 1] = indexB;
      indices[offset + 2] = indexC;

      poleIndex = PrimitiveMesh._replacePoleUV(indices, vertices, offset, poleOffset, poleIndex);

      indices[offset + 3] = indexA;
      indices[offset + 4] = indexC;
      indices[offset + 5] = indexD;

      poleIndex = PrimitiveMesh._replacePoleUV(indices, vertices, offset + 3, poleOffset, poleIndex);

      offset += 6;
    }
    const data = new PrimitiveMeshBuilder();
    data.setData(vertices, indices);
    data.boundsExtent = new Vector3(radius, radius, radius);
    return data;
  }

  private static _replacePoleUV(
    indices: Uint16Array | Uint32Array,
    vertices: Float32Array,
    idx: number,
    poleOffset: number,
    poleIndex: number
  ): number {
    const v = vertices[8 * indices[idx] + 7];

    if (v === 0 || v === 1) {
      const offset = 8 * indices[idx];
      const addedOffset = 8 * (poleOffset + poleIndex);
      vertices.set(vertices.subarray(offset, offset + 8), addedOffset);
      vertices[addedOffset + 6] =
        0.5 * (vertices[offset + 6] + vertices[8 * indices[idx + 1] + 6] + vertices[8 * indices[idx + 2] + 6] - 0.5);

      indices[idx] = poleOffset + poleIndex++;
    }
    return poleIndex;
  }

  private static _createMesh<T extends unknown[]>(
    engine: Engine,
    generate: (...args: T) => PrimitiveMeshBuilder,
    args: T,
    { keepData = false, separateMaterials = false }: { keepData?: boolean; separateMaterials?: boolean }
  ): ModelMesh {
    for (let i = 0; i < args.length; i++) {
      args[i] = PrimitiveMesh._copy(args[i]);
    }
    const data = generate(...args);
    data.trim();
    if (data.vertexCount > 65535 && !engine._hardwareRenderer.canIUse(GLCapabilityType.elementIndexUint)) {
      throw new Error("The vertex count is over limit.");
    }
    const mesh = new ModelMesh(engine);
    const vertices = data.vertices;
    const indices = data.indices;
    mesh.setVertexElements([
      new VertexElement(VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0),
      new VertexElement(VertexAttribute.Normal, 12, VertexElementFormat.Vector3, 0),
      new VertexElement(VertexAttribute.UV, 24, VertexElementFormat.Vector2, 0)
    ]);
    const vertexBuffer = new Buffer(mesh.engine, BufferBindFlag.VertexBuffer, vertices, BufferUsage.Static, keepData);
    mesh.setVertexBufferBinding(vertexBuffer, 32, 0);
    mesh._initializeTangents(MeshTangentUtils.calculateTangentsFromBuffer(vertices, indices), !keepData);
    mesh.setIndices(indices);
    PrimitiveMesh._setBounds(mesh, data);
    mesh.uploadData(!keepData);
    mesh.clearSubMesh();
    if (separateMaterials && data.groups.length) {
      for (const group of data.groups) {
        mesh.addSubMesh(group.start, group.count);
      }
    } else {
      mesh.addSubMesh(0, indices.length);
    }
    engine.resourceManager.addContentRestorer(new PrimitiveMeshRestorer(mesh, generate, args));
    return mesh;
  }

  private static _polygons(
    input: readonly Vector2[] | PolygonShape | readonly PolygonShape[]
  ): readonly PolygonShape[] {
    if (!Array.isArray(input)) {
      return [input as PolygonShape];
    }
    if (input.length === 0 || "points" in input[0]) {
      return input as readonly PolygonShape[];
    }
    return [{ points: input as readonly Vector2[] }];
  }

  private static _setBounds(mesh: ModelMesh, data: PrimitiveMeshBuilder): void {
    const extent = data.boundsExtent;
    if (extent) {
      mesh.bounds.min.set(-extent.x || 0, -extent.y || 0, -extent.z || 0);
      mesh.bounds.max.copyFrom(extent);
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < data.vertices.length; i += 8) {
      minX = Math.min(minX, data.vertices[i]);
      minY = Math.min(minY, data.vertices[i + 1]);
      minZ = Math.min(minZ, data.vertices[i + 2]);
      maxX = Math.max(maxX, data.vertices[i]);
      maxY = Math.max(maxY, data.vertices[i + 1]);
      maxZ = Math.max(maxZ, data.vertices[i + 2]);
    }
    if (!data.vertices.length) {
      minX = minY = minZ = maxX = maxY = maxZ = 0;
    }
    mesh.bounds.min.set(minX, minY, minZ);
    mesh.bounds.max.set(maxX, maxY, maxZ);
  }

  private static _copy(value: unknown): unknown {
    if (value instanceof Vector2 || value instanceof Vector3) {
      return value.clone();
    }
    if (Array.isArray(value)) {
      return value.map(PrimitiveMesh._copy);
    }
    if (value && typeof value === "object") {
      const result = {};
      for (const key of Object.keys(value)) {
        result[key] = PrimitiveMesh._copy(value[key]);
      }
      return result;
    }
    return value;
  }

  private static _createArcSamples(segments: number, start: number = 0, arc: number = Math.PI * 2): Float64Array {
    const samples = new Float64Array((segments + 1) * 2);
    for (let i = 0; i <= segments; i++) {
      const angle = start + (i / segments) * arc;
      samples[i * 2] = Math.cos(angle);
      samples[i * 2 + 1] = Math.sin(angle);
    }
    return samples;
  }

  private static _getSegmentCount(value: number, minimum: number = 1): number {
    return Math.max(minimum, Math.floor(value));
  }

  private static _normalizeVector(vector: Vector3): Vector3 {
    const length = Math.hypot(vector.x, vector.y, vector.z);
    return vector.scale(length > 0 ? 1 / length : 0);
  }
}
