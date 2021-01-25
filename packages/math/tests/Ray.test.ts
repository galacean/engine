import { Plane } from "../src/Plane";
import { Ray } from "../src/Ray";
import { Vector3 } from "../src/Vector3";

describe("Ray test", () => {
  it("ray-plane", () => {
    const ray = new Ray(new Vector3(0, 0, 0), new Vector3(1, 0.5, 0.3));
    const plane = new Plane(new Vector3(0.4, 0.5, 1), 5);

    // ray.intersectPlane(plane.)
  });
});
