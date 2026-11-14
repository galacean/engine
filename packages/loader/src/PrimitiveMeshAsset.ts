import type {
  CapsuleMeshOptions,
  CircleMeshOptions,
  ConeMeshOptions,
  CuboidMeshOptions,
  CylinderMeshOptions,
  LatheMeshOptions,
  LinearExtrudedPolygonMeshOptions,
  PathExtrudedPolygonMeshOptions,
  PlaneMeshOptions,
  PolygonMeshOptions,
  RegularPolyhedronMeshOptions,
  RingMeshOptions,
  RoundedCuboidMeshOptions,
  SphereMeshOptions,
  TorusKnotMeshOptions,
  TorusMeshOptions,
  TruncatedConeMeshOptions,
  TubeMeshOptions
} from "@galacean/engine-core";
import type { Vector2 } from "@galacean/engine-math";

/**
 * @internal
 */
export type SerializedPrimitiveMeshOptions<T> = {
  [Key in keyof T]: Extract<T[Key], Vector2> extends never ? T[Key] : { x: number; y: number };
};

type SerializedPolygonShape = {
  points: readonly { x: number; y: number }[];
  holes?: readonly (readonly { x: number; y: number }[])[];
};

/**
 * Serialized inputs and optional settings for every primitive mesh factory.
 * Required inputs use the same units as factory arguments. Vector inputs store their components as plain JSON objects.
 */
export type PrimitiveMeshAsset =
  | {
      type: "sphere";
      /**
       * The radius in local units.
       */
      sphereRadius: number;
      sphereOptions?: SerializedPrimitiveMeshOptions<SphereMeshOptions>;
    }
  | {
      type: "cuboid";
      /**
       * The full size along X in local units.
       */
      cuboidWidth: number;
      /**
       * The full size along Y in local units.
       */
      cuboidHeight: number;
      /**
       * The full size along Z in local units.
       */
      cuboidDepth: number;
      cuboidOptions?: CuboidMeshOptions;
    }
  | {
      type: "plane";
      /**
       * The full size along X in local units.
       */
      planeWidth: number;
      /**
       * The full size along Z in local units.
       */
      planeDepth: number;
      planeOptions?: PlaneMeshOptions;
    }
  | {
      type: "cylinder";
      /**
       * The radius in local units.
       */
      cylinderRadius: number;
      /**
       * The full size along Y in local units.
       */
      cylinderHeight: number;
      cylinderOptions?: SerializedPrimitiveMeshOptions<CylinderMeshOptions>;
    }
  | {
      type: "truncatedCone";
      /**
       * The top radius in local units.
       */
      truncatedConeTopRadius: number;
      /**
       * The bottom radius in local units.
       */
      truncatedConeBottomRadius: number;
      /**
       * The full size along Y in local units.
       */
      truncatedConeHeight: number;
      truncatedConeOptions?: SerializedPrimitiveMeshOptions<TruncatedConeMeshOptions>;
    }
  | {
      type: "cone";
      /**
       * The bottom radius in local units.
       */
      coneRadius: number;
      /**
       * The full size along Y in local units.
       */
      coneHeight: number;
      coneOptions?: SerializedPrimitiveMeshOptions<ConeMeshOptions>;
    }
  | {
      type: "capsule";
      /**
       * The radius of the cylinder and hemispherical ends in local units.
       */
      capsuleRadius: number;
      /**
       * The straight cylindrical section height in local units; total height is `capsuleCylinderHeight + 2 * capsuleRadius`.
       */
      capsuleCylinderHeight: number;
      capsuleOptions?: CapsuleMeshOptions;
    }
  | {
      type: "torus";
      /**
       * The distance from the origin to the tube centerline in local units.
       */
      torusRadius: number;
      /**
       * The radius of the tube cross-section in local units.
       */
      torusTubeRadius: number;
      torusOptions?: SerializedPrimitiveMeshOptions<TorusMeshOptions>;
    }
  | {
      type: "circle";
      /**
       * The radius in local units.
       */
      circleRadius: number;
      circleOptions?: SerializedPrimitiveMeshOptions<CircleMeshOptions>;
    }
  | {
      type: "ring";
      /**
       * The outer radius in local units.
       */
      ringOuterRadius: number;
      /**
       * The inner radius in local units.
       */
      ringInnerRadius: number;
      ringOptions?: SerializedPrimitiveMeshOptions<RingMeshOptions>;
    }
  | {
      type: "tetrahedron";
      /**
       * The distance from the origin to each vertex in local units.
       */
      tetrahedronRadius: number;
      tetrahedronOptions?: RegularPolyhedronMeshOptions;
    }
  | {
      type: "octahedron";
      /**
       * The distance from the origin to each vertex in local units.
       */
      octahedronRadius: number;
      octahedronOptions?: RegularPolyhedronMeshOptions;
    }
  | {
      type: "icosahedron";
      /**
       * The distance from the origin to each vertex in local units.
       */
      icosahedronRadius: number;
      icosahedronOptions?: RegularPolyhedronMeshOptions;
    }
  | {
      type: "dodecahedron";
      /**
       * The distance from the origin to each vertex in local units.
       */
      dodecahedronRadius: number;
      dodecahedronOptions?: RegularPolyhedronMeshOptions;
    }
  | {
      type: "lathe";
      latheProfile: readonly { x: number; y: number }[];
      latheOptions?: SerializedPrimitiveMeshOptions<LatheMeshOptions>;
    }
  | {
      type: "tube";
      tubePath: readonly { x: number; y: number; z: number }[];
      /**
       * The radius of the cross-section in local units.
       */
      tubeRadius: number;
      tubeOptions?: TubeMeshOptions;
    }
  | {
      type: "polygon";
      polygonShapes: readonly SerializedPolygonShape[];
      polygonOptions?: PolygonMeshOptions;
    }
  | {
      type: "extrudedPolygon";
      /**
       * The total extrusion depth in local units, including both bevels.
       */
      extrudedPolygonDepth: number;
      extrudedPolygonShapes: readonly SerializedPolygonShape[];
      extrudedPolygonOptions?: LinearExtrudedPolygonMeshOptions;
    }
  | {
      type: "extrudedPolygon";
      /**
       * The path points in local coordinates.
       */
      extrudedPolygonPath: readonly { x: number; y: number; z: number }[];
      extrudedPolygonShapes: readonly SerializedPolygonShape[];
      extrudedPolygonOptions?: PathExtrudedPolygonMeshOptions;
    }
  | {
      type: "torusKnot";
      /**
       * The base radius of the torus in local units.
       */
      torusKnotRadius: number;
      /**
       * The radius of the tube cross-section in local units.
       */
      torusKnotTubeRadius: number;
      /**
       * The signed integer revolution count around the torus axis.
       */
      torusKnotAxisTurns: number;
      /**
       * The signed integer revolution count around the torus cross-section.
       */
      torusKnotCrossSectionTurns: number;
      torusKnotOptions?: TorusKnotMeshOptions;
    }
  | {
      type: "roundedCuboid";
      /**
       * The full size along X in local units.
       */
      roundedCuboidWidth: number;
      /**
       * The full size along Y in local units.
       */
      roundedCuboidHeight: number;
      /**
       * The full size along Z in local units.
       */
      roundedCuboidDepth: number;
      /**
       * The edge and corner radius in local units, clamped to half the smallest dimension.
       */
      roundedCuboidCornerRadius: number;
      roundedCuboidOptions?: RoundedCuboidMeshOptions;
    };
