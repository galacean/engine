/** Bounded nearshore obstacle footprints compiled for foam/contact consumers. */

export type OceanObstacleVector2 = readonly [number, number];

interface OceanObstacleBase {
  readonly id: string;
  /** World-space XZ centre. */
  readonly centerXZ: OceanObstacleVector2;
  /** Positive height above the compiled bed at the obstacle centre. */
  readonly height: number;
}

export interface OceanCircleObstacleDescriptor extends OceanObstacleBase {
  readonly shape: "circle";
  readonly radius: number;
}

export interface OceanEllipseObstacleDescriptor extends OceanObstacleBase {
  readonly shape: "ellipse";
  readonly radiiXZ: OceanObstacleVector2;
  readonly rotationRadians: number;
}

export type OceanObstacleDescriptor =
  | OceanCircleObstacleDescriptor
  | OceanEllipseObstacleDescriptor;
