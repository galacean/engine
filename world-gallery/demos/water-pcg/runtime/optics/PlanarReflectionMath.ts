/** Allocation-free planar-reflection helpers shared by the reflection service and focused tests. */
import { MathUtil, Matrix, Plane, Vector3 } from "@galacean/engine-math";

const NORMALIZED_PLANE_TOLERANCE = 1e-4;
const MATRIX_SHAPE_TOLERANCE = 1e-5;
const MAX_FLOAT32 = 3.4028234663852886e38;

/** Plane equation `dot(normal, point) + distance = 0` with a unit-length normal. */
export interface NormalizedWorldPlane {
  readonly normal: Readonly<Vector3>;
  readonly distance: number;
}

function isFiniteVector3(value: Readonly<Vector3>): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function isFiniteMatrix(value: Readonly<Matrix>): boolean {
  const elements = value.elements;
  for (let index = 0; index < elements.length; index++) {
    if (!Number.isFinite(elements[index])) return false;
  }
  return true;
}

function isFiniteFloat32(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= MAX_FLOAT32;
}

/** Returns whether a plane is finite and its normal is normalized closely enough for reflection math. */
export function isNormalizedWorldPlane(plane: NormalizedWorldPlane): boolean {
  const normal = plane.normal;
  if (!isFiniteVector3(normal) || !Number.isFinite(plane.distance)) return false;
  const lengthSquared = normal.x * normal.x + normal.y * normal.y + normal.z * normal.z;
  return Number.isFinite(lengthSquared) && Math.abs(lengthSquared - 1) <= NORMALIZED_PLANE_TOLERANCE;
}

/** Builds a normalized plane through `point`. Invalid input leaves `outPlane` unchanged. */
export function tryCreateNormalizedWorldPlane(
  point: Readonly<Vector3>,
  normal: Readonly<Vector3>,
  outPlane: Plane
): boolean {
  if (!isFiniteVector3(point) || !isFiniteVector3(normal)) return false;
  const lengthSquared = normal.x * normal.x + normal.y * normal.y + normal.z * normal.z;
  if (!Number.isFinite(lengthSquared) || lengthSquared <= MathUtil.zeroTolerance * MathUtil.zeroTolerance) return false;

  const inverseLength = 1 / Math.sqrt(lengthSquared);
  const normalX = normal.x * inverseLength;
  const normalY = normal.y * inverseLength;
  const normalZ = normal.z * inverseLength;
  const distance = -(normalX * point.x + normalY * point.y + normalZ * point.z);
  if (
    !isFiniteFloat32(normalX) ||
    !isFiniteFloat32(normalY) ||
    !isFiniteFloat32(normalZ) ||
    !Number.isFinite(distance)
  ) {
    return false;
  }

  outPlane.normal.set(normalX, normalY, normalZ);
  outPlane.distance = distance;
  return true;
}

/** Signed distance from a point to a normalized plane, or `NaN` when either input is invalid. */
export function signedDistanceToNormalizedPlane(point: Readonly<Vector3>, plane: NormalizedWorldPlane): number {
  if (!isFiniteVector3(point) || !isNormalizedWorldPlane(plane)) return Number.NaN;
  const normal = plane.normal;
  return normal.x * point.x + normal.y * point.y + normal.z * point.z + plane.distance;
}

/** Reflects a point across a normalized plane. Invalid input leaves `outPoint` unchanged. */
export function tryReflectPointAcrossPlane(
  point: Readonly<Vector3>,
  plane: NormalizedWorldPlane,
  outPoint: Vector3
): boolean {
  const signedDistance = signedDistanceToNormalizedPlane(point, plane);
  if (!Number.isFinite(signedDistance)) return false;
  const normal = plane.normal;
  const scale = signedDistance * 2;
  const reflectedX = point.x - normal.x * scale;
  const reflectedY = point.y - normal.y * scale;
  const reflectedZ = point.z - normal.z * scale;
  if (!Number.isFinite(reflectedX) || !Number.isFinite(reflectedY) || !Number.isFinite(reflectedZ)) return false;
  outPoint.set(reflectedX, reflectedY, reflectedZ);
  return true;
}

/** Reflects a direction across a normalized plane. Plane distance is intentionally ignored. */
export function tryReflectVectorAcrossPlane(
  vector: Readonly<Vector3>,
  plane: NormalizedWorldPlane,
  outVector: Vector3
): boolean {
  if (!isFiniteVector3(vector) || !isNormalizedWorldPlane(plane)) return false;
  const normal = plane.normal;
  const scale = 2 * (normal.x * vector.x + normal.y * vector.y + normal.z * vector.z);
  const reflectedX = vector.x - normal.x * scale;
  const reflectedY = vector.y - normal.y * scale;
  const reflectedZ = vector.z - normal.z * scale;
  if (!Number.isFinite(reflectedX) || !Number.isFinite(reflectedY) || !Number.isFinite(reflectedZ)) return false;
  outVector.set(reflectedX, reflectedY, reflectedZ);
  return true;
}

/**
 * Transforms a normalized world plane by an invertible affine world-to-view matrix.
 * The inverse-transpose is evaluated directly so callers do not allocate a temporary matrix per frame.
 */
export function tryTransformPlaneToViewSpace(
  worldPlane: NormalizedWorldPlane,
  viewMatrix: Readonly<Matrix>,
  outViewPlane: Plane
): boolean {
  if (!isNormalizedWorldPlane(worldPlane) || !isFiniteMatrix(viewMatrix)) return false;
  const elements = viewMatrix.elements;
  if (
    Math.abs(elements[3]) > MATRIX_SHAPE_TOLERANCE ||
    Math.abs(elements[7]) > MATRIX_SHAPE_TOLERANCE ||
    Math.abs(elements[11]) > MATRIX_SHAPE_TOLERANCE ||
    Math.abs(elements[15] - 1) > MATRIX_SHAPE_TOLERANCE
  ) {
    return false;
  }

  const a00 = elements[0];
  const a01 = elements[4];
  const a02 = elements[8];
  const a10 = elements[1];
  const a11 = elements[5];
  const a12 = elements[9];
  const a20 = elements[2];
  const a21 = elements[6];
  const a22 = elements[10];
  const cofactor00 = a11 * a22 - a12 * a21;
  const cofactor01 = a12 * a20 - a10 * a22;
  const cofactor02 = a10 * a21 - a11 * a20;
  const cofactor10 = a02 * a21 - a01 * a22;
  const cofactor11 = a00 * a22 - a02 * a20;
  const cofactor12 = a01 * a20 - a00 * a21;
  const cofactor20 = a01 * a12 - a02 * a11;
  const cofactor21 = a02 * a10 - a00 * a12;
  const cofactor22 = a00 * a11 - a01 * a10;
  const determinant = a00 * cofactor00 + a01 * cofactor01 + a02 * cofactor02;
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= MathUtil.zeroTolerance) return false;

  const normal = worldPlane.normal;
  const inverseDeterminant = 1 / determinant;
  let viewNormalX = (cofactor00 * normal.x + cofactor01 * normal.y + cofactor02 * normal.z) * inverseDeterminant;
  let viewNormalY = (cofactor10 * normal.x + cofactor11 * normal.y + cofactor12 * normal.z) * inverseDeterminant;
  let viewNormalZ = (cofactor20 * normal.x + cofactor21 * normal.y + cofactor22 * normal.z) * inverseDeterminant;
  let viewDistance =
    worldPlane.distance - (viewNormalX * elements[12] + viewNormalY * elements[13] + viewNormalZ * elements[14]);
  const normalLengthSquared = viewNormalX * viewNormalX + viewNormalY * viewNormalY + viewNormalZ * viewNormalZ;
  if (!Number.isFinite(normalLengthSquared) || normalLengthSquared <= MathUtil.zeroTolerance * MathUtil.zeroTolerance) {
    return false;
  }

  const inverseNormalLength = 1 / Math.sqrt(normalLengthSquared);
  viewNormalX *= inverseNormalLength;
  viewNormalY *= inverseNormalLength;
  viewNormalZ *= inverseNormalLength;
  viewDistance *= inverseNormalLength;
  if (
    !isFiniteFloat32(viewNormalX) ||
    !isFiniteFloat32(viewNormalY) ||
    !isFiniteFloat32(viewNormalZ) ||
    !Number.isFinite(viewDistance)
  ) {
    return false;
  }

  outViewPlane.normal.set(viewNormalX, viewNormalY, viewNormalZ);
  outViewPlane.distance = viewDistance;
  return true;
}

/**
 * Replaces a Galacean/OpenGL perspective near plane with `viewSpaceClipPlane`.
 * Invalid or numerically unstable input leaves `outProjection` unchanged.
 */
export function tryCreateObliquePerspectiveProjection(
  baseProjection: Readonly<Matrix>,
  viewSpaceClipPlane: NormalizedWorldPlane,
  outProjection: Matrix
): boolean {
  if (!isFiniteMatrix(baseProjection) || !isNormalizedWorldPlane(viewSpaceClipPlane)) return false;
  const elements = baseProjection.elements;
  if (
    Math.abs(elements[1]) > MATRIX_SHAPE_TOLERANCE ||
    Math.abs(elements[2]) > MATRIX_SHAPE_TOLERANCE ||
    Math.abs(elements[3]) > MATRIX_SHAPE_TOLERANCE ||
    Math.abs(elements[4]) > MATRIX_SHAPE_TOLERANCE ||
    Math.abs(elements[6]) > MATRIX_SHAPE_TOLERANCE ||
    Math.abs(elements[7]) > MATRIX_SHAPE_TOLERANCE ||
    Math.abs(elements[12]) > MATRIX_SHAPE_TOLERANCE ||
    Math.abs(elements[13]) > MATRIX_SHAPE_TOLERANCE ||
    Math.abs(elements[15]) > MATRIX_SHAPE_TOLERANCE ||
    Math.abs(elements[0]) <= MathUtil.zeroTolerance ||
    Math.abs(elements[5]) <= MathUtil.zeroTolerance ||
    Math.abs(elements[11]) <= MathUtil.zeroTolerance ||
    Math.abs(elements[14]) <= MathUtil.zeroTolerance
  ) {
    return false;
  }

  const plane = viewSpaceClipPlane;
  const normal = plane.normal;
  const cornerX = normal.x < 0 ? -1 : 1;
  const cornerY = normal.y < 0 ? -1 : 1;
  const cornerZ = 1 / elements[11];
  const cornerViewX = (cornerX - elements[8] * cornerZ) / elements[0];
  const cornerViewY = (cornerY - elements[9] * cornerZ) / elements[5];
  const cornerViewW = (1 - elements[10] * cornerZ) / elements[14];
  const planeCornerDot =
    normal.x * cornerViewX + normal.y * cornerViewY + normal.z * cornerZ + plane.distance * cornerViewW;
  if (!Number.isFinite(planeCornerDot) || Math.abs(planeCornerDot) <= MathUtil.zeroTolerance) return false;

  const scale = 2 / planeCornerDot;
  const clipX = normal.x * scale;
  const clipY = normal.y * scale;
  const clipZ = normal.z * scale;
  const clipW = plane.distance * scale;
  const projection20 = clipX - elements[3];
  const projection21 = clipY - elements[7];
  const projection22 = clipZ - elements[11];
  const projection23 = clipW - elements[15];
  if (
    !isFiniteFloat32(projection20) ||
    !isFiniteFloat32(projection21) ||
    !isFiniteFloat32(projection22) ||
    !isFiniteFloat32(projection23)
  ) {
    return false;
  }

  const outElements = outProjection.elements;
  for (let index = 0; index < elements.length; index++) outElements[index] = elements[index];
  outElements[2] = projection20;
  outElements[6] = projection21;
  outElements[10] = projection22;
  outElements[14] = projection23;
  return true;
}
