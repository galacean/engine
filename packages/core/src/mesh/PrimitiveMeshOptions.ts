import type { Vector2, Vector3 } from "@galacean/engine-math";
import type { PrimitiveMeshCapMode } from "./enums/PrimitiveMeshCapMode";

/**
 * Settings shared by all primitive meshes.
 */
export interface PrimitiveMeshOptions {
  /**
   * Whether to retain readable CPU copies of vertex attributes and indices after upload.
   * @defaultValue `false`
   */
  keepData?: boolean;
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
   * The radius in local units.
   * @defaultValue `0.5`
   */
  radius?: number;
  /**
   * The subdivision level, rounded down and clamped to 1 through 6.
   * @defaultValue `3`
   */
  subdivisions?: number;
  /**
   * The start (`x`) and end (`y`) horizontal angles in degrees, measured from -X towards +Z.
   * The span is limited to 360 degrees. Section boundaries remain open.
   * @defaultValue `new Vector2(0, 360)`
   */
  horizontalRange?: Vector2;
  /**
   * The start (`x`) and end (`y`) polar angles in degrees, measured from +Y towards -Y.
   * The interval is clipped to [0, 180].
   * Section boundaries remain open.
   * @defaultValue `new Vector2(0, 180)`
   */
  verticalRange?: Vector2;
}

/**
 * Settings for an axis-aligned cuboid centered at the origin.
 */
export interface CuboidMeshOptions extends PrimitiveMeshOptions {
  /**
   * The full size along X in local units.
   * @defaultValue `1`
   */
  width?: number;
  /**
   * The full size along Y in local units.
   * @defaultValue The value of `width`.
   */
  height?: number;
  /**
   * The full size along Z in local units.
   * @defaultValue The value of `width`.
   */
  depth?: number;
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
  separateMaterials?: boolean;
}

/**
 * Settings for a plane in XZ facing +Y, centered at the origin.
 */
export interface PlaneMeshOptions extends PrimitiveMeshOptions {
  /**
   * The full size along X in local units.
   * @defaultValue `1`
   */
  width?: number;
  /**
   * The full size along Z in local units.
   * @defaultValue The value of `width`.
   */
  height?: number;
  /**
   * The number of subdivisions along X, rounded down with a minimum of 1.
   * @defaultValue `1`
   */
  horizontalSegments?: number;
  /**
   * The number of subdivisions along Z, rounded down with a minimum of 1.
   * @defaultValue The value of `horizontalSegments`.
   */
  verticalSegments?: number;
}

/**
 * Settings for a cylinder centered on Y with equal end radii.
 */
export interface CylinderMeshOptions extends PrimitiveMeshOptions {
  /**
   * The radius in local units.
   * @defaultValue `0.5`
   */
  radius?: number;
  /**
   * The full size along Y in local units.
   * @defaultValue `2`
   */
  height?: number;
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
  separateMaterials?: boolean;
}

/**
 * Settings for a truncated cone centered on Y with independently sized ends.
 */
export interface TruncatedConeMeshOptions extends PrimitiveMeshOptions {
  /**
   * The top radius in local units.
   * @defaultValue `0.25`
   */
  topRadius?: number;
  /**
   * The bottom radius in local units.
   * @defaultValue `0.5`
   */
  bottomRadius?: number;
  /**
   * The full size along Y in local units.
   * @defaultValue `2`
   */
  height?: number;
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
  separateMaterials?: boolean;
}

/**
 * Settings for a cone centered on Y with its tip at the top.
 */
export interface ConeMeshOptions extends PrimitiveMeshOptions {
  /**
   * The bottom radius in local units.
   * @defaultValue `0.5`
   */
  radius?: number;
  /**
   * The full size along Y in local units.
   * @defaultValue `2`
   */
  height?: number;
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
  separateMaterials?: boolean;
}

/**
 * Settings for a capsule centered on Y.
 */
export interface CapsuleMeshOptions extends PrimitiveMeshOptions {
  /**
   * The radius of the cylinder and hemispherical ends in local units.
   * @defaultValue `0.5`
   */
  radius?: number;
  /**
   * The straight cylindrical section's height in local units. Total height is `height + 2 * radius`.
   * @defaultValue `2`
   */
  height?: number;
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
   * The distance from the origin to the tube centerline in local units.
   * @defaultValue `0.5`
   */
  radius?: number;
  /**
   * The radius of the tube cross-section in local units.
   * @defaultValue `0.1`
   */
  tubeRadius?: number;
  /**
   * The number of segments around the torus, rounded down with a minimum of 1.
   * @defaultValue `30`
   */
  tubularSegments?: number;
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
  angleRange?: Vector2;
  /**
   * The start (`x`) and end (`y`) tube cross-section angles in degrees, measured from the outward radial direction towards +Z.
   * Cut boundaries remain open.
   * @defaultValue `new Vector2(0, 360)`
   */
  tubeRange?: Vector2;
}

/**
 * Settings for a filled disk or sector in XY facing +Z.
 */
export interface CircleMeshOptions extends PrimitiveMeshOptions {
  /**
   * The radius in local units.
   * @defaultValue `0.5`
   */
  radius?: number;
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
   * The outer radius in local units.
   * @defaultValue `0.5`
   */
  outerRadius?: number;
  /**
   * The inner radius in local units.
   * @defaultValue Half of `outerRadius`.
   */
  innerRadius?: number;
  /**
   * The number of segments along the arc, rounded down with a minimum of 3.
   * @defaultValue `32`
   */
  radialSegments?: number;
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
   * The distance from the origin to each vertex in local units.
   * @defaultValue `0.5`
   */
  radius?: number;
  /**
   * The number of subdivisions per triangle edge, rounded down with a minimum of 1.
   * Values above 1 project the new vertices onto the sphere and use smooth normals.
   * @defaultValue `1`
   */
  segments?: number;
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
   * The radius of the cross-section in local units.
   * @defaultValue `0.5`
   */
  radius?: number;
  /**
   * The number of segments along the resampled path, rounded down with a minimum of 1.
   * @defaultValue `64`
   */
  tubularSegments?: number;
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
  closed?: boolean;
}

/**
 * Settings for triangulating polygons in XY facing +Z.
 */
export interface PolygonMeshOptions extends PrimitiveMeshOptions {
  /**
   * Whether to create one sub-mesh per polygon in input order. Holes share their outer contour's sub-mesh.
   * @defaultValue `false`
   */
  separateMaterials?: boolean;
}

/**
 * Settings for extruding polygons along +Z.
 */
export interface LinearExtrusionMeshOptions extends PrimitiveMeshOptions {
  /**
   * The total extrusion depth in local units, including both bevels.
   * @defaultValue `1`
   */
  depth?: number;
  /**
   * The number of subdivisions along the extrusion, rounded down with a minimum of 1.
   * @defaultValue `1`
   */
  steps?: number;
  /**
   * The inset of each end cap relative to the side wall in local units. Zero disables bevels.
   * @defaultValue `0`
   */
  bevelSize?: number;
  /**
   * The bevel depth at each end in local units, limited to half of `depth`.
   * @defaultValue The value of `bevelSize`.
   */
  bevelThickness?: number;
  /**
   * The side-wall contour offset in local units. Positive values expand the solid and contract holes.
   * Applies even when bevels are disabled.
   * @defaultValue `0`
   */
  bevelOffset?: number;
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
  separateMaterials?: boolean;
  /**
   * A path selects path extrusion, which cannot be combined with depth or bevel settings.
   */
  path?: never;
  /**
   * Closing is only available for path extrusion.
   */
  closed?: never;
}

/**
 * Settings for extruding polygons along a polyline, without bevels.
 * Polygon X and Y coordinates become offsets along the moving cross-section's axes.
 */
export interface PathExtrusionMeshOptions extends PrimitiveMeshOptions {
  /**
   * The path points, resampled at equal distances along the polyline. At least two distinct points are required.
   */
  path: readonly Vector3[];
  /**
   * The number of subdivisions along the resampled path, rounded down with a minimum of 1, or 3 for closed paths.
   * @defaultValue `1`, increased to `3` when `closed` is true.
   */
  steps?: number;
  /**
   * Whether to join the path ends with matching cross-sections and omit end caps.
   * The closing point need not be repeated.
   * @defaultValue `false`
   */
  closed?: boolean;
  /**
   * Whether each polygon contributes a cap sub-mesh followed by a wall sub-mesh, in input order.
   * Both end caps share one slot; outer and hole walls share the next. Closed paths use only the wall slot.
   * @defaultValue `false`
   */
  separateMaterials?: boolean;
  /**
   * Depth is determined by the path.
   */
  depth?: never;
  /**
   * Path extrusion does not support bevels.
   */
  bevelSize?: never;
  /**
   * Path extrusion does not support bevels.
   */
  bevelThickness?: never;
  /**
   * Path extrusion does not support contour offsets.
   */
  bevelOffset?: never;
  /**
   * Path extrusion does not support bevels.
   */
  bevelSegments?: never;
}

/**
 * Settings for linear extrusion or path extrusion. Providing `path` selects path extrusion.
 */
export type ExtrusionMeshOptions = LinearExtrusionMeshOptions | PathExtrusionMeshOptions;

/**
 * Settings for a closed torus knot. At least one of `p` and `q` must be nonzero.
 */
export interface TorusKnotMeshOptions extends PrimitiveMeshOptions {
  /**
   * The base radius of the torus in local units.
   * @defaultValue `0.5`
   */
  radius?: number;
  /**
   * The radius of the tube cross-section in local units.
   * @defaultValue `0.1`
   */
  tubeRadius?: number;
  /**
   * The signed integer revolution count around the torus axis. Negative values reverse the winding.
   * @defaultValue `2`
   */
  p?: number;
  /**
   * The signed integer revolution count through the torus hole. Negative values reverse the winding.
   * @defaultValue `3`
   */
  q?: number;
  /**
   * The number of segments along the knot, rounded down with a minimum of 1.
   * @defaultValue `64`
   */
  tubularSegments?: number;
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
   * The full size along X in local units.
   * @defaultValue `1`
   */
  width?: number;
  /**
   * The full size along Y in local units.
   * @defaultValue The value of `width`.
   */
  height?: number;
  /**
   * The full size along Z in local units.
   * @defaultValue The value of `width`.
   */
  depth?: number;
  /**
   * The edge and corner radius in local units, clamped between zero and half the smallest dimension.
   * @defaultValue `0.1`
   */
  cornerRadius?: number;
  /**
   * The rounding subdivision count, rounded down with a minimum of 1.
   * When `cornerRadius` is positive, each face uses `2 * segments + 1` subdivisions per axis.
   * @defaultValue `2`
   */
  segments?: number;
  /**
   * Whether to create one sub-mesh per face, ordered +Y, -Y, -X, +X, +Z, -Z.
   * @defaultValue `false`
   */
  separateMaterials?: boolean;
}
