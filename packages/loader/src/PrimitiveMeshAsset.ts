import type {
  CapsuleMeshOptions,
  CircleMeshOptions,
  ConeMeshOptions,
  CuboidMeshOptions,
  CylinderMeshOptions,
  LatheMeshOptions,
  LinearExtrusionMeshOptions,
  PathExtrusionMeshOptions,
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
 * Serialized data for every primitive mesh factory, using the same option defaults and constraints.
 * Vector inputs store their components as plain JSON objects.
 */
export type PrimitiveMeshAsset =
  | {
      type: "sphere";
      sphereOptions?: SerializedPrimitiveMeshOptions<SphereMeshOptions>;
    }
  | {
      type: "cuboid";
      cuboidOptions?: CuboidMeshOptions;
    }
  | {
      type: "plane";
      planeOptions?: PlaneMeshOptions;
    }
  | {
      type: "cylinder";
      cylinderOptions?: SerializedPrimitiveMeshOptions<CylinderMeshOptions>;
    }
  | {
      type: "truncatedCone";
      truncatedConeOptions?: SerializedPrimitiveMeshOptions<TruncatedConeMeshOptions>;
    }
  | {
      type: "cone";
      coneOptions?: SerializedPrimitiveMeshOptions<ConeMeshOptions>;
    }
  | {
      type: "capsule";
      capsuleOptions?: CapsuleMeshOptions;
    }
  | {
      type: "torus";
      torusOptions?: SerializedPrimitiveMeshOptions<TorusMeshOptions>;
    }
  | {
      type: "circle";
      circleOptions?: SerializedPrimitiveMeshOptions<CircleMeshOptions>;
    }
  | {
      type: "ring";
      ringOptions?: SerializedPrimitiveMeshOptions<RingMeshOptions>;
    }
  | {
      type: "tetrahedron";
      tetrahedronOptions?: RegularPolyhedronMeshOptions;
    }
  | {
      type: "octahedron";
      octahedronOptions?: RegularPolyhedronMeshOptions;
    }
  | {
      type: "icosahedron";
      icosahedronOptions?: RegularPolyhedronMeshOptions;
    }
  | {
      type: "dodecahedron";
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
      tubeOptions?: TubeMeshOptions;
    }
  | {
      type: "polygon";
      polygonShapes: readonly SerializedPolygonShape[];
      polygonOptions?: PolygonMeshOptions;
    }
  | {
      type: "extrusion";
      extrusionShapes: readonly SerializedPolygonShape[];
      extrusionOptions?:
        | LinearExtrusionMeshOptions
        | (Omit<PathExtrusionMeshOptions, "path"> & { path: readonly { x: number; y: number; z: number }[] });
    }
  | {
      type: "torusKnot";
      torusKnotOptions?: TorusKnotMeshOptions;
    }
  | {
      type: "roundedCuboid";
      roundedCuboidOptions?: RoundedCuboidMeshOptions;
    };
