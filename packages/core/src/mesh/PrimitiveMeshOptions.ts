import type { Vector2 } from "@galacean/engine-math";
import type { PrimitiveMeshCapMode } from "./enums/PrimitiveMeshCapMode";

/**
 * Settings shared by all primitive meshes.
 */
export interface PrimitiveMeshOptions {
  /**
   * Whether to retain readable CPU copies of vertex attributes and indices after upload.
   * @defaultValue `false`
   */
  keepCPUData?: boolean;
}

/**
 * A polygon in the XY plane, optionally containing holes.
 * Either winding order is accepted for the outer contour and holes.
 */
export interface PolygonShape {
  /**
   * The outer contour, with at least three distinct points. The closing point need not be repeated.
   */
  points: readonly Vector2[];
  /**
   * Contours cut out of the polygon, each with at least three distinct points.
   * Closing points need not be repeated.
   * @defaultValue No holes.
   */
  holes?: readonly (readonly Vector2[])[];
}

/**
 * Settings for a sphere or an open spherical section generated from a subdivided cube.
 */
export interface SphereMeshOptions extends PrimitiveMeshOptions {
  /**
   * The subdivision level, rounded down and clamped to 1 through 6.
   * @defaultValue `3`
   */
  subdivisionLevel?: number;
  /**
   * The start (`x`) and end (`y`) horizontal angles in degrees, measured from -X towards +Z.
   * The span is limited to 360 degrees. Section boundaries remain open.
   * @defaultValue `new Vector2(0, 360)`
   */
  horizontalAngleRange?: Vector2;
  /**
   * The start (`x`) and end (`y`) polar angles in degrees, measured from +Y towards -Y.
   * The interval is clipped to [0, 180].
   * Section boundaries remain open.
   * @defaultValue `new Vector2(0, 180)`
   */
  verticalAngleRange?: Vector2;
}

/**
 * Settings for an axis-aligned cuboid centered at the origin.
 */
export interface CuboidMeshOptions extends PrimitiveMeshOptions {
  /**
   * The number of subdivisions along X, rounded down with a minimum of 1.
   * @defaultValue `1`
   */
  widthSegments?: number;
  /**
   * The number of subdivisions along Y, rounded down with a minimum of 1.
   * @defaultValue The value of `widthSegments`.
   */
  heightSegments?: number;
  /**
   * The number of subdivisions along Z, rounded down with a minimum of 1.
   * @defaultValue The value of `widthSegments`.
   */
  depthSegments?: number;
  /**
   * Whether to create one sub-mesh per face, ordered +Y, -Y, -X, +X, +Z, -Z.
   * @defaultValue `false`
   */
  separateMaterialSlots?: boolean;
}

/**
 * Settings for a plane in XZ facing +Y, centered at the origin.
 */
export interface PlaneMeshOptions extends PrimitiveMeshOptions {
  /**
   * The number of subdivisions along X, rounded down with a minimum of 1.
   * @defaultValue `1`
   */
  widthSegments?: number;
  /**
   * The number of subdivisions along Z, rounded down with a minimum of 1.
   * @defaultValue The value of `widthSegments`.
   */
  depthSegments?: number;
}

/**
 * Settings for a cylinder centered on Y with equal end radii.
 */
export interface CylinderMeshOptions extends PrimitiveMeshOptions {
  /**
   * The number of segments around the circumference, rounded down with a minimum of 3.
   * @defaultValue `20`
   */
  radialSegments?: number;
  /**
   * The number of subdivisions along Y, rounded down with a minimum of 1.
   * @defaultValue `1`
   */
  heightSegments?: number;
  /**
   * The ends to cap. Zero-radius ends and angular cut boundaries remain open.
   * @defaultValue `PrimitiveMeshCapMode.Both`
   */
  caps?: PrimitiveMeshCapMode;
  /**
   * The start (`x`) and end (`y`) angles in degrees around Y, measured from +Z towards +X.
   * @defaultValue `new Vector2(0, 360)`
   */
  angleRange?: Vector2;
  /**
   * Whether to create separate sub-meshes for the side, top and bottom, in that order.
   * Omitted or zero-radius caps do not occupy slots.
   * @defaultValue `false`
   */
  separateMaterialSlots?: boolean;
}

/**
 * Settings for a truncated cone centered on Y with independently sized ends.
 */
export interface TruncatedConeMeshOptions extends PrimitiveMeshOptions {
  /**
   * The number of segments around the circumference, rounded down with a minimum of 3.
   * @defaultValue `20`
   */
  radialSegments?: number;
  /**
   * The number of subdivisions along Y, rounded down with a minimum of 1.
   * @defaultValue `1`
   */
  heightSegments?: number;
  /**
   * The ends to cap. Zero-radius ends have no caps, and angular cut boundaries remain open.
   * @defaultValue `PrimitiveMeshCapMode.Both`
   */
  caps?: PrimitiveMeshCapMode;
  /**
   * The start (`x`) and end (`y`) angles in degrees around Y, measured from +Z towards +X.
   * @defaultValue `new Vector2(0, 360)`
   */
  angleRange?: Vector2;
  /**
   * Whether to create separate sub-meshes for the side, top and bottom, in that order.
   * Omitted or zero-radius caps do not occupy slots.
   * @defaultValue `false`
   */
  separateMaterialSlots?: boolean;
}

/**
 * Settings for a cone centered on Y with its tip at the top.
 */
export interface ConeMeshOptions extends PrimitiveMeshOptions {
  /**
   * The number of segments around the circumference, rounded down with a minimum of 3.
   * @defaultValue `20`
   */
  radialSegments?: number;
  /**
   * The number of subdivisions along Y, rounded down with a minimum of 1.
   * @defaultValue `1`
   */
  heightSegments?: number;
  /**
   * Whether to cap the bottom. A zero-radius bottom and angular cut boundaries remain open.
   * @defaultValue `true`
   */
  cap?: boolean;
  /**
   * The start (`x`) and end (`y`) angles in degrees around Y, measured from +Z towards +X.
   * @defaultValue `new Vector2(0, 360)`
   */
  angleRange?: Vector2;
  /**
   * Whether to create separate sub-meshes for the side and bottom, in that order.
   * An omitted or zero-radius bottom cap does not occupy a slot.
   * @defaultValue `false`
   */
  separateMaterialSlots?: boolean;
}

/**
 * Settings for a capsule centered on Y.
 */
export interface CapsuleMeshOptions extends PrimitiveMeshOptions {
  /**
   * The number of segments around the circumference, rounded down with a minimum of 3.
   * @defaultValue `6`
   */
  radialSegments?: number;
  /**
   * The number of subdivisions from each pole to the cylinder, rounded down with a minimum of 1.
   * @defaultValue The value of `radialSegments`.
   */
  capSegments?: number;
  /**
   * The number of subdivisions along the cylinder, rounded down with a minimum of 1.
   * @defaultValue `1`
   */
  heightSegments?: number;
}

/**
 * Settings for a torus centered in XY around Z.
 */
export interface TorusMeshOptions extends PrimitiveMeshOptions {
  /**
   * The number of segments around the torus, rounded down with a minimum of 1.
   * @defaultValue `30`
   */
  ringSegments?: number;
  /**
   * The number of segments around the tube cross-section, rounded down with a minimum of 3.
   * @defaultValue `30`
   */
  radialSegments?: number;
  /**
   * The start (`x`) and end (`y`) angles in degrees around Z, measured from +X towards +Y.
   * Cut ends remain open.
   * @defaultValue `new Vector2(0, 360)`
   */
  ringAngleRange?: Vector2;
  /**
   * The start (`x`) and end (`y`) tube cross-section angles in degrees, measured from the outward radial direction towards +Z.
   * Cut boundaries remain open.
   * @defaultValue `new Vector2(0, 360)`
   */
  tubeAngleRange?: Vector2;
}

/**
 * Settings for a filled disk or sector in XY facing +Z.
 */
export interface CircleMeshOptions extends PrimitiveMeshOptions {
  /**
   * The number of segments along the arc, rounded down with a minimum of 3.
   * @defaultValue `32`
   */
  segments?: number;
  /**
   * The start (`x`) and end (`y`) angles in degrees, measured from +X towards +Y.
   * @defaultValue `new Vector2(0, 360)`
   */
  angleRange?: Vector2;
}

/**
 * Settings for a ring or ring sector in XY facing +Z.
 */
export interface RingMeshOptions extends PrimitiveMeshOptions {
  /**
   * The number of segments along the arc, rounded down with a minimum of 3.
   * @defaultValue `32`
   */
  ringSegments?: number;
  /**
   * The number of subdivisions between the inner and outer edges, rounded down with a minimum of 1.
   * @defaultValue `1`
   */
  widthSegments?: number;
  /**
   * The start (`x`) and end (`y`) angles in degrees, measured from +X towards +Y.
   * @defaultValue `new Vector2(0, 360)`
   */
  angleRange?: Vector2;
}

/**
 * Settings shared by tetrahedra, octahedra, icosahedra and dodecahedra.
 */
export interface RegularPolyhedronMeshOptions extends PrimitiveMeshOptions {
  /**
   * The number of subdivisions per triangle edge, rounded down with a minimum of 1.
   * Values above 1 project the new vertices onto the sphere and use smooth normals.
   * @defaultValue `1`
   */
  edgeSegments?: number;
}

/**
 * Settings for revolving a radius-height profile around Y.
 */
export interface LatheMeshOptions extends PrimitiveMeshOptions {
  /**
   * The number of segments along the revolution, rounded down with a minimum of 1.
   * @defaultValue `12`
   */
  segments?: number;
  /**
   * The start (`x`) and end (`y`) angles in degrees around Y, measured from +Z towards +X.
   * Cut boundaries remain open.
   * @defaultValue `new Vector2(0, 360)`
   */
  angleRange?: Vector2;
}

/**
 * Settings for sweeping a circular cross-section along a polyline.
 */
export interface TubeMeshOptions extends PrimitiveMeshOptions {
  /**
   * The number of segments along the resampled path, rounded down with a minimum of 1.
   * @defaultValue `64`
   */
  pathSegments?: number;
  /**
   * The number of segments around the cross-section, rounded down with a minimum of 3.
   * @defaultValue `8`
   */
  radialSegments?: number;
  /**
   * Whether to join the path ends with matching cross-sections. The closing point need not be repeated.
   * Open tubes have no end caps.
   * @defaultValue `false`
   */
  closedPath?: boolean;
}

/**
 * Settings for a zero-thickness polygon mesh in XY facing +Z.
 */
export interface PolygonMeshOptions extends PrimitiveMeshOptions {
  /**
   * Whether to create one sub-mesh per polygon in input order. Holes share their outer contour's sub-mesh.
   * @defaultValue `false`
   */
  separateMaterialSlots?: boolean;
}

/**
 * Settings for extruding polygon contours along +Z.
 */
export interface LinearExtrudedPolygonMeshOptions extends PrimitiveMeshOptions {
  /**
   * The number of subdivisions along the extrusion, rounded down with a minimum of 1.
   * @defaultValue `1`
   */
  depthSegments?: number;
  /**
   * The inset of each end cap relative to the side wall in local units. Zero disables bevels.
   * @defaultValue `0`
   */
  bevelWidth?: number;
  /**
   * The bevel depth at each end in local units, limited to half the extrusion depth.
   * @defaultValue The value of `bevelWidth`.
   */
  bevelDepth?: number;
  /**
   * The side-wall contour offset in local units. Positive values expand the solid and contract holes.
   * Applies even when bevels are disabled.
   * @defaultValue `0`
   */
  contourOffset?: number;
  /**
   * The number of subdivisions per bevel, rounded down with a minimum of 1.
   * @defaultValue `3`
   */
  bevelSegments?: number;
  /**
   * Whether each polygon contributes a cap sub-mesh followed by a wall sub-mesh, in input order.
   * Both end caps share one slot; outer walls, hole walls and bevels share the next.
   * @defaultValue `false`
   */
  separateMaterialSlots?: boolean;
}

/**
 * Settings for sweeping polygon contours along a polyline, without bevels.
 * Polygon X and Y coordinates become offsets along the moving cross-section's axes.
 */
export interface PathExtrudedPolygonMeshOptions extends PrimitiveMeshOptions {
  /**
   * The number of subdivisions along the resampled path, rounded down with a minimum of 1, or 3 for closed paths.
   * @defaultValue `1`, increased to `3` when `closedPath` is true.
   */
  pathSegments?: number;
  /**
   * Whether to join the path ends with matching cross-sections and omit end caps.
   * The closing point need not be repeated.
   * @defaultValue `false`
   */
  closedPath?: boolean;
  /**
   * Whether each polygon contributes a cap sub-mesh followed by a wall sub-mesh, in input order.
   * Both end caps share one slot; outer and hole walls share the next. Closed paths use only the wall slot.
   * @defaultValue `false`
   */
  separateMaterialSlots?: boolean;
}

/**
 * Settings for a closed torus knot.
 */
export interface TorusKnotMeshOptions extends PrimitiveMeshOptions {
  /**
   * The number of segments along the knot, rounded down with a minimum of 1.
   * @defaultValue `64`
   */
  pathSegments?: number;
  /**
   * The number of segments around the tube cross-section, rounded down with a minimum of 3.
   * @defaultValue `8`
   */
  radialSegments?: number;
}

/**
 * Settings for an axis-aligned cuboid with rounded edges and corners.
 */
export interface RoundedCuboidMeshOptions extends PrimitiveMeshOptions {
  /**
   * The rounding subdivision count, rounded down with a minimum of 1.
   * When `cornerRadius` is positive, each face uses `2 * roundingSegments + 1` subdivisions per axis.
   * @defaultValue `2`
   */
  roundingSegments?: number;
  /**
   * Whether to create one sub-mesh per face, ordered +Y, -Y, -X, +X, +Z, -Z.
   * @defaultValue `false`
   */
  separateMaterialSlots?: boolean;
}
