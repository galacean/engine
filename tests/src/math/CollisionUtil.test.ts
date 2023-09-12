import {
  BoundingBox,
  BoundingFrustum,
  BoundingSphere,
  CollisionUtil,
  ContainmentType,
  Matrix,
  Plane,
  PlaneIntersectionType,
  Ray,
  Vector3
} from "@galacean/engine-math";
import { expect } from "chai";

describe("CollisionUtil", () => {
  const plane = new Plane(new Vector3(0, 1, 0), -5);
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

  it("distancePlaneAndPoint", () => {
    const point = new Vector3(0, 10, 0);

    const distance = CollisionUtil.distancePlaneAndPoint(plane, point);
    expect(distance).to.eq(5);
  });

  it("intersectsPlaneAndPoint", () => {
    const point1 = new Vector3(0, 10, 0);
    const point2 = new Vector3(2, 5, -9);
    const point3 = new Vector3(0, 3, 0);

    const intersection1 = CollisionUtil.intersectsPlaneAndPoint(plane, point1);
    const intersection2 = CollisionUtil.intersectsPlaneAndPoint(plane, point2);
    const intersection3 = CollisionUtil.intersectsPlaneAndPoint(plane, point3);
    expect(intersection1).to.eq(PlaneIntersectionType.Front);
    expect(intersection2).to.eq(PlaneIntersectionType.Intersecting);
    expect(intersection3).to.eq(PlaneIntersectionType.Back);
  });

  it("intersectsPlaneAndBox", () => {
    const box1 = new BoundingBox(new Vector3(-1, 6, -2), new Vector3(1, 10, 3));
    const box2 = new BoundingBox(new Vector3(-1, 5, -2), new Vector3(1, 10, 3));
    const box3 = new BoundingBox(new Vector3(-1, 4, -2), new Vector3(1, 5, 3));
    const box4 = new BoundingBox(new Vector3(-1, -5, -2), new Vector3(1, 4.9, 3));

    const intersection1 = CollisionUtil.intersectsPlaneAndBox(plane, box1);
    const intersection2 = CollisionUtil.intersectsPlaneAndBox(plane, box2);
    const intersection3 = CollisionUtil.intersectsPlaneAndBox(plane, box3);
    const intersection4 = CollisionUtil.intersectsPlaneAndBox(plane, box4);
    expect(intersection1).to.eq(PlaneIntersectionType.Front);
    expect(intersection2).to.eq(PlaneIntersectionType.Intersecting);
    expect(intersection3).to.eq(PlaneIntersectionType.Intersecting);
    expect(intersection4).to.eq(PlaneIntersectionType.Back);
  });

  it("intersectsPlaneAndSphere", () => {
    const sphere1 = new BoundingSphere(new Vector3(0, 8, 0), 2);
    const sphere2 = new BoundingSphere(new Vector3(0, 8, 0), 3);
    const sphere3 = new BoundingSphere(new Vector3(0, 3, 0), 2);
    const sphere4 = new BoundingSphere(new Vector3(0, 0, 0), 2);

    const intersection1 = CollisionUtil.intersectsPlaneAndSphere(plane, sphere1);
    const intersection2 = CollisionUtil.intersectsPlaneAndSphere(plane, sphere2);
    const intersection3 = CollisionUtil.intersectsPlaneAndSphere(plane, sphere3);
    const intersection4 = CollisionUtil.intersectsPlaneAndSphere(plane, sphere4);
    expect(intersection1).to.eq(PlaneIntersectionType.Front);
    expect(intersection2).to.eq(PlaneIntersectionType.Intersecting);
    expect(intersection3).to.eq(PlaneIntersectionType.Intersecting);
    expect(intersection4).to.eq(PlaneIntersectionType.Back);
  });

  it("intersectsRayAndPlane", () => {
    const ray1 = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    const ray2 = new Ray(new Vector3(0, 0, 0), new Vector3(0, -1, 0));

    const distance1 = CollisionUtil.intersectsRayAndPlane(ray1, plane);
    const distance2 = CollisionUtil.intersectsRayAndPlane(ray2, plane);
    expect(distance1).to.eq(5);
    expect(distance2).to.eq(-1);
  });

  it("intersectsRayAndBox", () => {
    const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    const box1 = new BoundingBox(new Vector3(-1, 3, -1), new Vector3(2, 8, 3));
    const box2 = new BoundingBox(new Vector3(1, 1, 1), new Vector3(2, 2, 2));

    const distance1 = CollisionUtil.intersectsRayAndBox(ray, box1);
    const distance2 = CollisionUtil.intersectsRayAndBox(ray, box2);
    expect(distance1).to.eq(3);
    expect(distance2).to.eq(-1);
  });

  it("intersectsRayAndSphere", () => {
    const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    const sphere1 = new BoundingSphere(new Vector3(0, 4, 0), 3);
    const sphere2 = new BoundingSphere(new Vector3(0, -5, 0), 4);

    const distance1 = CollisionUtil.intersectsRayAndSphere(ray, sphere1);
    const distance2 = CollisionUtil.intersectsRayAndSphere(ray, sphere2);
    expect(distance1).to.eq(1);
    expect(distance2).to.eq(-1);
  });

  it("intersectsFrustumAndBox", () => {
    const box1 = new BoundingBox(new Vector3(-2, -2, -2), new Vector3(2, 2, 2));
    const flag1 = frustum.intersectsBox(box1);
    expect(flag1).to.eq(true);

    const box2 = new BoundingBox(new Vector3(-32, -2, -2), new Vector3(-28, 2, 2));
    const flag2 = frustum.intersectsBox(box2);
    expect(flag2).to.eq(false);
  });

  it("frustumContainsPoint", () => {
    const point1 = new Vector3(0, 0, -15);
    const point2 = new Vector3(0, 20, -15);
    const point3 = new Vector3(0, 0, -80.00000199);

    const expected1 = CollisionUtil.frustumContainsPoint(frustum, point1);
    const expected2 = CollisionUtil.frustumContainsPoint(frustum, point2);
    const expected3 = CollisionUtil.frustumContainsPoint(frustum, point3);
    expect(expected1).to.eq(ContainmentType.Contains);
    expect(expected2).to.eq(ContainmentType.Disjoint);
    expect(expected3).to.eq(ContainmentType.Intersects);
  });

  it("frustumContainsBox", () => {
    const box1 = new BoundingBox(new Vector3(-2, -2, -2), new Vector3(2, 2, 2));
    const box2 = new BoundingBox(new Vector3(-32, -2, -2), new Vector3(-28, 2, 2));
    const box3 = new BoundingBox(new Vector3(-35, -2, -2), new Vector3(-18, 2, 2));

    const expected1 = CollisionUtil.frustumContainsBox(frustum, box1);
    const expected2 = CollisionUtil.frustumContainsBox(frustum, box2);
    const expected3 = CollisionUtil.frustumContainsBox(frustum, box3);
    expect(expected1).to.eq(ContainmentType.Contains);
    expect(expected2).to.eq(ContainmentType.Disjoint);
    expect(expected3).to.eq(ContainmentType.Intersects);
  });

  it("frustumContainsSphere", () => {
    const sphere1 = new BoundingSphere(new Vector3(0, 0, 0), 2);
    const sphere2 = new BoundingSphere(new Vector3(-32, -2, -2), 1);
    const sphere3 = new BoundingSphere(new Vector3(-32, -2, -2), 15);

    const expected1 = CollisionUtil.frustumContainsSphere(frustum, sphere1);
    const expected2 = CollisionUtil.frustumContainsSphere(frustum, sphere2);
    const expected3 = CollisionUtil.frustumContainsSphere(frustum, sphere3);
    expect(expected1).to.eq(ContainmentType.Contains);
    expect(expected2).to.eq(ContainmentType.Disjoint);
    expect(expected3).to.eq(ContainmentType.Intersects);
  });
});
