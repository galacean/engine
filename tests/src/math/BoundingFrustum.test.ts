import { BoundingBox, BoundingFrustum, BoundingSphere, Matrix, Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";

describe("BoundingFrustum test", () => {
  const viewMatrix = new Matrix(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -20, 1);
  const projectionMatrix = new Matrix(
    0.03954802080988884,
    0,
    0,
    0,
    0,
    0.10000000149011612,
    0,
    0,
    0,
    0,
    -0.0200200192630291,
    0,
    -0,
    -0,
    -1.0020020008087158,
    1
  );
  const vpMatrix = new Matrix();
  Matrix.multiply(projectionMatrix, viewMatrix, vpMatrix);
  const frustum = new BoundingFrustum(vpMatrix);

  it("intersectsBox", () => {
    const box1 = new BoundingBox(new Vector3(-2, -2, -2), new Vector3(2, 2, 2));
    const flag1 = frustum.intersectsBox(box1);
    expect(flag1).eq(true);

    const box2 = new BoundingBox(new Vector3(-32, -2, -2), new Vector3(-28, 2, 2));
    const flag2 = frustum.intersectsBox(box2);
    expect(flag2).eq(false);
  });

  it("intersectsSphere", () => {
    const box1 = new BoundingBox(new Vector3(-2, -2, -2), new Vector3(2, 2, 2));
    const sphere1 = new BoundingSphere();
    BoundingSphere.fromBox(box1, sphere1);
    const flag1 = frustum.intersectsSphere(sphere1);
    expect(flag1).eq(true);

    const box2 = new BoundingBox(new Vector3(-32, -2, -2), new Vector3(-28, 2, 2));
    const sphere2 = new BoundingSphere();
    BoundingSphere.fromBox(box2, sphere2);
    const flag2 = frustum.intersectsSphere(sphere2);
    expect(flag2).eq(false);
  });

  it("clone", () => {
    const a = new BoundingFrustum(projectionMatrix);
    const b = a.clone();

    for (let i = 0; i < 6; ++i) {
      const aPlane = a.getPlane(i);
      const bPlane = b.getPlane(i);

      expect(aPlane.distance).eq(bPlane.distance);
      expect(Vector3.equals(aPlane.normal, bPlane.normal)).eq(true);
    }
  });

  it("copyFrom", () => {
    const a = new BoundingFrustum(projectionMatrix);
    const out = new BoundingFrustum();
    out.copyFrom(a);

    for (let i = 0; i < 6; ++i) {
      const aPlane = a.getPlane(i);
      const outPlane = out.getPlane(i);

      expect(aPlane.distance).eq(outPlane.distance);
      expect(Vector3.equals(aPlane.normal, outPlane.normal)).eq(true);
    }
  });

  it("calculateFromMatrix", () => {
    const a = new BoundingFrustum();
    a.calculateFromMatrix(vpMatrix);

    for (let i = 0; i < 6; ++i) {
      const aPlane = a.getPlane(i);
      const bPlane = frustum.getPlane(i);

      expect(aPlane.distance).eq(bPlane.distance);
      expect(Vector3.equals(aPlane.normal, bPlane.normal)).eq(true);
    }
  });
});
