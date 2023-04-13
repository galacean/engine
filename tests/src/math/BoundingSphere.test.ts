import { BoundingBox, BoundingSphere, Vector3 } from "@galacean/engine-math";
import { expect } from "chai";

describe("BoundingSphere", () => {
  it("Constructor", () => {
    const sphere1 = new BoundingSphere();
    const sphere2 = new BoundingSphere();

    // Create a same sphere by different param.
    const points = [
      new Vector3(0, 0, 0),
      new Vector3(-1, 0, 0),
      new Vector3(0, 0, 0),
      new Vector3(0, 1, 0),
      new Vector3(1, 1, 1),
      new Vector3(0, 0, 1),
      new Vector3(-1, -0.5, -0.5),
      new Vector3(0, -0.5, -0.5),
      new Vector3(1, 0, -1),
      new Vector3(0, -1, 0)
    ];
    BoundingSphere.fromPoints(points, sphere1);

    const box = new BoundingBox(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    BoundingSphere.fromBox(box, sphere2);

    const { center: center1, radius: radius1 } = sphere1;
    const { center: center2, radius: radius2 } = sphere2;
    expect(Vector3.equals(center1, center2)).to.eq(true);
    expect(radius1).to.eq(radius2);
  });

  it("clone", () => {
    const a = new BoundingSphere(new Vector3(0, 0, 0), 3);
    const b = a.clone();
    expect(Vector3.equals(a.center, b.center)).to.eq(true);
    expect(a.radius).to.eq(b.radius);
  });

  it("copyFrom", () => {
    const a = new BoundingSphere(new Vector3(0, 0, 0), 3);
    const out = new BoundingSphere();
    out.copyFrom(a);
    expect(Vector3.equals(a.center, out.center)).to.eq(true);
    expect(a.radius).to.eq(out.radius);
  });
});
