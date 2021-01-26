import { BoundingBox } from "../src/BoundingBox";
import { BoundingSphere } from "../src/BoundingSphere";
import { Plane } from "../src/Plane";
import { Ray } from "../src/Ray";
import { Vector3 } from "../src/Vector3";

describe("Ray test", () => {
  it("ray-plane", () => {
    const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    const plane = new Plane(new Vector3(0, 1, 0), -3);

    expect(ray.intersectPlane(plane)).toEqual(-plane.distance);
  });

  it("ray-sphere", () => {
    const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    const sphere = new BoundingSphere(new Vector3(0, 5, 0), 1);

    expect(ray.intersectSphere(sphere)).toEqual(4);
  });

  it("ray-box", () => {
    const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    const box = new BoundingBox();
    BoundingBox.fromCenterAndExtent(new Vector3(0, 20, 0), new Vector3(5, 5, 5), box);

    expect(ray.intersectBox(box)).toEqual(15);
  });

  it("ray-getPoint", () => {
    const ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    const out = new Vector3();
    ray.getPoint(10, out);

    expect(Vector3.equals(out, new Vector3(0, 10, 0))).toEqual(true);
  });
});
