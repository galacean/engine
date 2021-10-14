import { BoundingBox } from "../src/BoundingBox";
import { BoundingSphere } from "../src/BoundingSphere";
import { Matrix } from "../src/Matrix";
import { Vector3 } from "../src/Vector3";

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

    expect(min1.equals(min2)).toEqual(true);
    expect(max1.equals(max2)).toEqual(true);
    expect(min1.equals(min3)).toEqual(true);
    expect(max1.equals(max3)).toEqual(true);
    expect(min2.equals(min3)).toEqual(true);
    expect(max2.equals(max3)).toEqual(true);
  });

  it("transform", () => {
    const box = new BoundingBox(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const matrix = new Matrix(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 1, 0.5, -1, 1);
    const newBox = new BoundingBox();
    BoundingBox.transform(box, matrix, newBox);
    box.transform(matrix);

    const newMin = new Vector3(-1, -1.5, -3);
    const newMax = new Vector3(3, 2.5, 1);
    expect(newBox.min.equals(newMin)).toEqual(true);
    expect(newBox.max.equals(newMax)).toEqual(true);
    expect(box.min.equals(newMin)).toEqual(true);
    expect(box.max.equals(newMax)).toEqual(true);
  });

  it("merge", () => {
    const box1 = new BoundingBox(new Vector3(-1, -1, -1), new Vector3(2, 2, 2));
    const box2 = new BoundingBox(new Vector3(-2, -0.5, -2), new Vector3(3, 0, 3));
    const box = new BoundingBox();

    BoundingBox.merge(box1, box2, box);
    expect(box.min.equals(new Vector3(-2, -1, -2))).toEqual(true);
    expect(box.max.equals(new Vector3(3, 2, 3))).toEqual(true);
  });

  it("getCenter", () => {
    const box = new BoundingBox(new Vector3(-1, -1, -1), new Vector3(3, 3, 3));
    const center = new Vector3();

    box.getCenter(center);
    expect(center.equals(new Vector3(1, 1, 1))).toEqual(true);
  });

  it("getExtent", () => {
    const box = new BoundingBox(new Vector3(-1, -1, -1), new Vector3(3, 3, 3));
    const extent = new Vector3();

    box.getExtent(extent);
    expect(extent.equals(new Vector3(2, 2, 2))).toEqual(true);
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
    expectedCorners[0].setValue(minX, maxY, maxZ);
    expectedCorners[1].setValue(maxX, maxY, maxZ);
    expectedCorners[2].setValue(maxX, minY, maxZ);
    expectedCorners[3].setValue(minX, minY, maxZ);
    expectedCorners[4].setValue(minX, maxY, minZ);
    expectedCorners[5].setValue(maxX, maxY, minZ);
    expectedCorners[6].setValue(maxX, minY, minZ);
    expectedCorners[7].setValue(minX, minY, minZ);

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
      expect(expectedCorners[i].equals(corners[i])).toEqual(true);
    }
  });

  it("clone", () => {
    const a = new BoundingBox(new Vector3(0, 0, 0), new Vector3(1, 1, 1));
    const b = a.clone();
    expect(a.min.equals(b.min)).toEqual(true);
    expect(a.max.equals(b.max)).toEqual(true);
  });

  it("cloneTo", () => {
    const a = new BoundingBox(new Vector3(0, 0, 0), new Vector3(1, 1, 1));
    const out = new BoundingBox();
    a.cloneTo(out);
    expect(a.min.equals(out.min)).toEqual(true);
    expect(a.max.equals(out.max)).toEqual(true);
  });
});
