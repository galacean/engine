import { Matrix, Plane, Vector3, Vector4 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import {
  isNormalizedWorldPlane,
  signedDistanceToNormalizedPlane,
  tryCreateNormalizedWorldPlane,
  tryCreateObliquePerspectiveProjection,
  tryReflectPointAcrossPlane,
  tryReflectVectorAcrossPlane,
  tryTransformPlaneToViewSpace
} from "../../runtime/optics/PlanarReflectionMath";

const EPSILON = 1e-5;

function expectVectorClose(actual: Readonly<Vector3>, expected: Readonly<Vector3>, epsilon = EPSILON): void {
  expect(actual.x).toBeCloseTo(expected.x, Math.max(0, Math.ceil(-Math.log10(epsilon))));
  expect(actual.y).toBeCloseTo(expected.y, Math.max(0, Math.ceil(-Math.log10(epsilon))));
  expect(actual.z).toBeCloseTo(expected.z, Math.max(0, Math.ceil(-Math.log10(epsilon))));
}

function planeValue(plane: Plane, point: Readonly<Vector3>): number {
  return plane.normal.x * point.x + plane.normal.y * point.y + plane.normal.z * point.z + plane.distance;
}

function clipPoint(projection: Matrix, point: Vector3): Vector4 {
  const out = new Vector4();
  Vector3.transformToVec4(point, projection, out);
  return out;
}

describe("PlanarReflectionMath", () => {
  it("normalizes a world plane and reflects points and vectors without drift", () => {
    const plane = new Plane();
    expect(tryCreateNormalizedWorldPlane(new Vector3(0, 2, 0), new Vector3(0, 4, 0), plane)).toBe(true);
    expect(isNormalizedWorldPlane(plane)).toBe(true);
    expectVectorClose(plane.normal, new Vector3(0, 1, 0));
    expect(plane.distance).toBeCloseTo(-2, 6);

    const originalPoint = new Vector3(3, 5, -2);
    const reflectedPoint = new Vector3();
    const reflectedTwice = new Vector3();
    expect(tryReflectPointAcrossPlane(originalPoint, plane, reflectedPoint)).toBe(true);
    expectVectorClose(reflectedPoint, new Vector3(3, -1, -2));
    expect(tryReflectPointAcrossPlane(reflectedPoint, plane, reflectedTwice)).toBe(true);
    expectVectorClose(reflectedTwice, originalPoint);

    const reflectedVector = new Vector3();
    expect(tryReflectVectorAcrossPlane(new Vector3(1, -2, 3), plane, reflectedVector)).toBe(true);
    expectVectorClose(reflectedVector, new Vector3(1, 2, 3));
  });

  it("preserves signed distance and midpoint invariants for a tilted plane", () => {
    const plane = new Plane();
    expect(tryCreateNormalizedWorldPlane(new Vector3(1, 2, 3), new Vector3(1, 2, -2), plane)).toBe(true);
    const point = new Vector3(5, -1, 4);
    const reflected = new Vector3();
    expect(tryReflectPointAcrossPlane(point, plane, reflected)).toBe(true);

    const originalDistance = signedDistanceToNormalizedPlane(point, plane);
    const reflectedDistance = signedDistanceToNormalizedPlane(reflected, plane);
    expect(reflectedDistance).toBeCloseTo(-originalDistance, 6);
    const midpoint = new Vector3(
      (point.x + reflected.x) * 0.5,
      (point.y + reflected.y) * 0.5,
      (point.z + reflected.z) * 0.5
    );
    expect(signedDistanceToNormalizedPlane(midpoint, plane)).toBeCloseTo(0, 6);
  });

  it("transforms a plane to view space with inverse-transpose semantics", () => {
    const worldPlane = new Plane();
    expect(tryCreateNormalizedWorldPlane(new Vector3(0, 1.5, 0), new Vector3(0, 1, 0), worldPlane)).toBe(true);
    const viewMatrix = new Matrix();
    Matrix.lookAt(new Vector3(3, 5, 9), new Vector3(0, 1.5, 0), new Vector3(0, 1, 0), viewMatrix);
    const viewPlane = new Plane();
    expect(tryTransformPlaneToViewSpace(worldPlane, viewMatrix, viewPlane)).toBe(true);
    expect(isNormalizedWorldPlane(viewPlane)).toBe(true);

    for (const worldPoint of [new Vector3(0, 1.5, 0), new Vector3(2, 1.5, -3), new Vector3(-4, 1.5, 5)]) {
      const viewPoint = new Vector3();
      Vector3.transformCoordinate(worldPoint, viewMatrix, viewPoint);
      expect(planeValue(viewPlane, viewPoint)).toBeCloseTo(0, 5);
    }

    const worldAbove = new Vector3(0, 3.5, 0);
    const viewAbove = new Vector3();
    Vector3.transformCoordinate(worldAbove, viewMatrix, viewAbove);
    expect(Math.sign(planeValue(viewPlane, viewAbove))).toBe(Math.sign(planeValue(worldPlane, worldAbove)));
  });

  it("uses the inverse transpose for non-uniform affine view transforms", () => {
    const worldPlane = new Plane();
    expect(tryCreateNormalizedWorldPlane(new Vector3(1, 0, 0), new Vector3(1, 1, 0), worldPlane)).toBe(true);
    const affineView = new Matrix(2, 0, 0, 0, 0.5, 3, 0, 0, 0, 0, 4, 0, 5, -2, 1, 1);
    const viewPlane = new Plane();
    expect(tryTransformPlaneToViewSpace(worldPlane, affineView, viewPlane)).toBe(true);

    for (const worldPoint of [new Vector3(1, 0, 0), new Vector3(3, -2, 4), new Vector3(-2, 3, -5)]) {
      const viewPoint = new Vector3();
      Vector3.transformCoordinate(worldPoint, affineView, viewPoint);
      expect(planeValue(viewPlane, viewPoint)).toBeCloseTo(0, 5);
    }
  });

  it("replaces the perspective near plane while retaining finite far-side projection", () => {
    const baseProjection = new Matrix();
    Matrix.perspective(Math.PI / 3, 16 / 9, 0.1, 100, baseProjection);
    const baseElements = Array.from(baseProjection.elements);
    const clipPlane = new Plane(new Vector3(0, 0, -1), -2);
    const obliqueProjection = new Matrix();
    expect(tryCreateObliquePerspectiveProjection(baseProjection, clipPlane, obliqueProjection)).toBe(true);
    expect(Array.from(baseProjection.elements)).toEqual(baseElements);
    expect(obliqueProjection.elements.every(Number.isFinite)).toBe(true);
    expect(obliqueProjection.elements[0]).toBe(baseProjection.elements[0]);
    expect(obliqueProjection.elements[5]).toBe(baseProjection.elements[5]);
    expect(obliqueProjection.elements[11]).toBe(baseProjection.elements[11]);

    const onPlane = clipPoint(obliqueProjection, new Vector3(0, 0, -2));
    const cameraSide = clipPoint(obliqueProjection, new Vector3(0, 0, -1));
    const retainedSide = clipPoint(obliqueProjection, new Vector3(0, 0, -3));
    expect(onPlane.z + onPlane.w).toBeCloseTo(0, 5);
    expect(cameraSide.z + cameraSide.w).toBeLessThan(0);
    expect(retainedSide.z + retainedSide.w).toBeGreaterThan(0);
  });

  it("maps a tilted view-space clip plane onto the near clip boundary", () => {
    const baseProjection = new Matrix();
    Matrix.perspective(Math.PI / 2.5, 1.25, 0.2, 80, baseProjection);
    const clipPlane = new Plane();
    expect(tryCreateNormalizedWorldPlane(new Vector3(0, 0, -2), new Vector3(0.2, 0.1, -1), clipPlane)).toBe(true);
    const obliqueProjection = new Matrix();
    expect(tryCreateObliquePerspectiveProjection(baseProjection, clipPlane, obliqueProjection)).toBe(true);

    for (const [x, y] of [
      [0, 0],
      [1, 2],
      [-2, 1]
    ] as const) {
      const pointOnPlane = new Vector3(x, y, 0.2 * x + 0.1 * y - 2);
      const clip = clipPoint(obliqueProjection, pointOnPlane);
      expect(clip.z + clip.w).toBeCloseTo(0, 5);
    }
  });

  it("fails closed on non-finite, degenerate, non-affine, or non-perspective input", () => {
    const unchangedPlane = new Plane(new Vector3(1, 0, 0), 7);
    expect(tryCreateNormalizedWorldPlane(new Vector3(), new Vector3(), unchangedPlane)).toBe(false);
    expect(tryCreateNormalizedWorldPlane(new Vector3(Number.NaN, 0, 0), new Vector3(0, 1, 0), unchangedPlane)).toBe(
      false
    );
    expectVectorClose(unchangedPlane.normal, new Vector3(1, 0, 0));
    expect(unchangedPlane.distance).toBe(7);

    const invalidPlane = new Plane(new Vector3(0, 2, 0), 0);
    const unchangedVector = new Vector3(4, 5, 6);
    expect(tryReflectPointAcrossPlane(new Vector3(1, 2, 3), invalidPlane, unchangedVector)).toBe(false);
    expect(tryReflectVectorAcrossPlane(new Vector3(1, 2, 3), invalidPlane, unchangedVector)).toBe(false);
    expectVectorClose(unchangedVector, new Vector3(4, 5, 6));

    const validPlane = new Plane(new Vector3(0, 1, 0), 0);
    const singularView = new Matrix(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1);
    expect(tryTransformPlaneToViewSpace(validPlane, singularView, unchangedPlane)).toBe(false);
    expectVectorClose(unchangedPlane.normal, new Vector3(1, 0, 0));
    expect(unchangedPlane.distance).toBe(7);

    const orthographicProjection = new Matrix();
    Matrix.ortho(-1, 1, -1, 1, 0.1, 10, orthographicProjection);
    const unchangedProjection = new Matrix();
    const unchangedElements = Array.from(unchangedProjection.elements);
    expect(tryCreateObliquePerspectiveProjection(orthographicProjection, validPlane, unchangedProjection)).toBe(false);
    expect(Array.from(unchangedProjection.elements)).toEqual(unchangedElements);

    const perspectiveProjection = new Matrix();
    Matrix.perspective(Math.PI / 3, 1, 0.1, 100, perspectiveProjection);
    const farPlane = new Plane(new Vector3(0, 0, 1), 100);
    expect(tryCreateObliquePerspectiveProjection(perspectiveProjection, farPlane, unchangedProjection)).toBe(false);
    expect(Array.from(unchangedProjection.elements)).toEqual(unchangedElements);
  });
});
