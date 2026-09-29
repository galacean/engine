import { BoundingBox, BoundingSphere, Plane, Ray, Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";

describe("Ray test", () => {
  it("ray-plane", () => {
    const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    const plane = new Plane(new Vector3(0, 1, 0), -3);

    expect(ray.intersectPlane(plane)).to.eq(-plane.distance);
  });

  it("ray-sphere", () => {
    const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    const sphere = new BoundingSphere(new Vector3(0, 5, 0), 1);

    expect(ray.intersectSphere(sphere)).to.eq(4);
  });

  it("ray-box", () => {
    const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    const box = new BoundingBox();
    BoundingBox.fromCenterAndExtent(new Vector3(0, 20, 0), new Vector3(5, 5, 5), box);

    expect(ray.intersectBox(box)).to.eq(15);
  });

  it("ray-getPoint", () => {
    const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    const out = new Vector3();
    ray.getPoint(10, out);

    expect(Vector3.equals(out, new Vector3(0, 10, 0))).to.eq(true);
  });

  it("ray-clone", () => {
    const ray = new Ray(new Vector3(1, 2, 3), new Vector3(0, 0, 1));
    const out = ray.clone();

    expect(out).not.to.eq(ray);
    expect(out.origin).not.to.eq(ray.origin);
    expect(Vector3.equals(out.origin, ray.origin)).to.eq(true);
    expect(Vector3.equals(out.direction, ray.direction)).to.eq(true);
  });

  it("ray-copyFrom", () => {
    const ray = new Ray(new Vector3(1, 2, 3), new Vector3(0, 0, 1));
    const out = new Ray();
    const result = out.copyFrom(ray);

    expect(result).to.eq(out);
    expect(Vector3.equals(out.origin, ray.origin)).to.eq(true);
    expect(Vector3.equals(out.direction, ray.direction)).to.eq(true);
  });
});
