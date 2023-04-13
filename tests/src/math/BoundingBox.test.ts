import { BoundingBox, BoundingSphere, Matrix, Vector3 } from "@galacean/engine-math";
import { expect } from "chai";

describe("BoundingBox test", () => {
  it("Constructor", () => {
    const box1 = new BoundingBox();
    const box2 = new BoundingBox();
    const box3 = new BoundingBox();

    // Create a same box by different param.
    BoundingBox.fromCenterAndExtent(new Vector3(0, 0, 0), new Vector3(1, 1, 1), box1);

    const points = [
      new Vector3(0, 0, 0),
      new Vector3(-1, 0, 0),
      new Vector3(1, 0, 0),
      new Vector3(0, 1, 0),
      new Vector3(0, 1, 1),
      new Vector3(1, 0, 1),
      new Vector3(0, 0.5, 0.5),
      new Vector3(0, -0.5, 0.5),
      new Vector3(0, -1, 0.5),
      new Vector3(0, 0, -1)
    ];
    BoundingBox.fromPoints(points, box2);

    const sphere = new BoundingSphere(new Vector3(0, 0, 0), 1);
    BoundingBox.fromSphere(sphere, box3);

    const { min: min1, max: max1 } = box1;
    const { min: min2, max: max2 } = box2;
    const { min: min3, max: max3 } = box3;

    expect(Vector3.equals(min1, min2)).eq(true);
    expect(Vector3.equals(max1, max2)).eq(true);
    expect(Vector3.equals(min1, min3)).eq(true);
    expect(Vector3.equals(max1, max3)).eq(true);
    expect(Vector3.equals(min2, min3)).eq(true);
    expect(Vector3.equals(max2, max3)).eq(true);
  });

  it("transform", () => {
    const box = new BoundingBox(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const matrix = new Matrix(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 1, 0.5, -1, 1);
    const newBox = new BoundingBox();
    BoundingBox.transform(box, matrix, newBox);
    box.transform(matrix);

    const newMin = new Vector3(-1, -1.5, -3);
    const newMax = new Vector3(3, 2.5, 1);
    expect(Vector3.equals(newBox.min, newMin)).eq(true);
    expect(Vector3.equals(newBox.max, newMax)).eq(true);
    expect(Vector3.equals(box.min, newMin)).eq(true);
    expect(Vector3.equals(box.max, newMax)).eq(true);
  });

  it("merge", () => {
    const box1 = new BoundingBox(new Vector3(-1, -1, -1), new Vector3(2, 2, 2));
    const box2 = new BoundingBox(new Vector3(-2, -0.5, -2), new Vector3(3, 0, 3));
    const box = new BoundingBox();

    BoundingBox.merge(box1, box2, box);
    expect(Vector3.equals(new Vector3(-2, -1, -2), box.min)).eq(true);
    expect(Vector3.equals(new Vector3(3, 2, 3), box.max)).eq(true);
  });

  it("getCenter", () => {
    const box = new BoundingBox(new Vector3(-1, -1, -1), new Vector3(3, 3, 3));
    const center = new Vector3();

    box.getCenter(center);
    expect(Vector3.equals(new Vector3(1, 1, 1), center)).eq(true);
  });

  it("getExtent", () => {
    const box = new BoundingBox(new Vector3(-1, -1, -1), new Vector3(3, 3, 3));
    const extent = new Vector3();

    box.getExtent(extent);
    expect(Vector3.equals(new Vector3(2, 2, 2), extent)).eq(true);
  });

  it("getCorners", () => {
    const min = new Vector3(-1, -1, -1);
    const max = new Vector3(3, 3, 3);
    const { x: minX, y: minY, z: minZ } = min;
    const { x: maxX, y: maxY, z: maxZ } = max;
    const expectedCorners = [
      new Vector3(),
      new Vector3(),
      new Vector3(),
      new Vector3(),
      new Vector3(),
      new Vector3(),
      new Vector3(),
      new Vector3()
    ];
    expectedCorners[0].set(minX, maxY, maxZ);
    expectedCorners[1].set(maxX, maxY, maxZ);
    expectedCorners[2].set(maxX, minY, maxZ);
    expectedCorners[3].set(minX, minY, maxZ);
    expectedCorners[4].set(minX, maxY, minZ);
    expectedCorners[5].set(maxX, maxY, minZ);
    expectedCorners[6].set(maxX, minY, minZ);
    expectedCorners[7].set(minX, minY, minZ);

    const box = new BoundingBox(min, max);
    const corners = [
      new Vector3(),
      new Vector3(),
      new Vector3(),
      new Vector3(),
      new Vector3(),
      new Vector3(),
      new Vector3(),
      new Vector3()
    ];

    box.getCorners(corners);
    for (let i = 0; i < 8; ++i) {
      expect(Vector3.equals(corners[i], expectedCorners[i])).eq(true);
    }
  });

  it("clone", () => {
    const a = new BoundingBox(new Vector3(0, 0, 0), new Vector3(1, 1, 1));
    const b = a.clone();
    expect(Vector3.equals(a.min, b.min)).eq(true);
    expect(Vector3.equals(a.max, b.max)).eq(true);
  });

  it("copyFrom", () => {
    const a = new BoundingBox(new Vector3(0, 0, 0), new Vector3(1, 1, 1));
    const out = new BoundingBox();
    out.copyFrom(a);
    expect(Vector3.equals(a.min, out.min)).eq(true);
    expect(Vector3.equals(a.max, out.max)).eq(true);
  });
});
