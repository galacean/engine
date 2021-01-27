import { Plane } from "../src/Plane";
import { Vector3 } from "../src/Vector3";

describe("Plane test", () => {
  it("Constructor", () => {
    const point1 = new Vector3(0, 1, 0);
    const point2 = new Vector3(0, 1, 1);
    const point3 = new Vector3(1, 1, 0);
    const plane1 = new Plane();
    Plane.fromPoints(point1, point2, point3, plane1)
    const plane2 = new Plane(new Vector3(0, 1, 0), -1);

    expect(plane1.distance - plane2.distance).toEqual(0);
    plane1.normalize();
    plane2.normalize();
    expect(Vector3.equals(plane1.normal, plane2.normal)).toEqual(true);
  });
});
