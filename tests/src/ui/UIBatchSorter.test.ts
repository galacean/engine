import { UIBatchSorter } from "@galacean/engine-ui/src/component/UIBatchSorter";
import { BoundingBox, Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";

function rect(minX: number, minY: number, maxX: number, maxY: number): BoundingBox {
  return new BoundingBox(new Vector3(minX, minY, 0), new Vector3(maxX, maxY, 0));
}

function fakeElement(materialId: number, textureId: number | null, bounds: BoundingBox): any {
  return {
    component: { bounds },
    material: { instanceId: materialId },
    texture: textureId === null ? null : { instanceId: textureId }
  };
}

const identity = new Matrix();

function countBatches(elements: any[]): number {
  if (elements.length === 0) return 0;
  let batches = 1;
  for (let i = 1; i < elements.length; i++) {
    const a = elements[i - 1];
    const b = elements[i];
    const at = a.texture ? a.texture.instanceId : 0;
    const bt = b.texture ? b.texture.instanceId : 0;
    if (a.material.instanceId !== b.material.instanceId || at !== bt) batches++;
  }
  return batches;
}

describe("UIBatchSorter", () => {
  it("empty input is a no-op", () => {
    const elements: any[] = [];
    expect(() => UIBatchSorter.sort(elements, identity, 200)).to.not.throw();
    expect(elements.length).to.equal(0);
  });

  it("single element is unchanged", () => {
    const elements = [fakeElement(1, 1, rect(0, 0, 10, 10))];
    UIBatchSorter.sort(elements, identity, 200);
    expect(elements.length).to.equal(1);
    expect(elements[0].material.instanceId).to.equal(1);
  });

  it("non-overlapping interleaved buttons cluster by material", () => {
    // 4 (bg, txt) buttons, non-overlapping → optimal: 2 batches (all bg, all txt)
    const elements = [
      fakeElement(1, 1, rect(0, 0, 100, 100)),
      fakeElement(2, 2, rect(10, 10, 90, 50)),
      fakeElement(1, 1, rect(200, 0, 300, 100)),
      fakeElement(2, 2, rect(210, 10, 290, 50)),
      fakeElement(1, 1, rect(0, 200, 100, 300)),
      fakeElement(2, 2, rect(10, 210, 90, 250)),
      fakeElement(1, 1, rect(200, 200, 300, 300)),
      fakeElement(2, 2, rect(210, 210, 290, 250))
    ];
    UIBatchSorter.sort(elements, identity, 200);
    expect(countBatches(elements)).to.equal(2);
  });

  it("overlapping batch-compatible elements stay in one batch", () => {
    const elements = [
      fakeElement(1, 1, rect(0, 0, 100, 100)),
      fakeElement(1, 1, rect(50, 50, 150, 150)),
      fakeElement(1, 1, rect(80, 80, 180, 180))
    ];
    UIBatchSorter.sort(elements, identity, 200);
    expect(countBatches(elements)).to.equal(1);
  });

  it("identical-material overlap preserves hierarchy order", () => {
    const e0 = fakeElement(1, 1, rect(0, 0, 100, 100));
    const e1 = fakeElement(1, 1, rect(0, 0, 100, 100));
    const e2 = fakeElement(1, 1, rect(0, 0, 100, 100));
    const elements = [e0, e1, e2];
    UIBatchSorter.sort(elements, identity, 200);
    expect(elements).to.deep.equal([e0, e1, e2]);
  });

  it("incompatible overlap forces strict hierarchy order", () => {
    const e0 = fakeElement(1, 1, rect(0, 0, 100, 100));
    const e1 = fakeElement(2, 2, rect(0, 0, 100, 100));
    const e2 = fakeElement(3, 3, rect(0, 0, 100, 100));
    const elements = [e0, e1, e2];
    UIBatchSorter.sort(elements, identity, 200);
    expect(elements).to.deep.equal([e0, e1, e2]);
  });

  it("transitive overlap (A-B, B-C, A∩C=∅) keeps hierarchy", () => {
    const e0 = fakeElement(1, 1, rect(0, 0, 100, 100));
    const e1 = fakeElement(2, 2, rect(50, 0, 150, 100));
    const e2 = fakeElement(3, 3, rect(120, 0, 220, 100));
    const elements = [e0, e1, e2];
    UIBatchSorter.sort(elements, identity, 200);
    expect(elements).to.deep.equal([e0, e1, e2]);
    expect(countBatches(elements)).to.equal(3);
  });

  it("isolated clusters batch independently", () => {
    // (A,B) overlap at left, (C,D) overlap at right; A,C share material; B,D share material
    const elements = [
      fakeElement(1, 1, rect(0, 0, 100, 100)),
      fakeElement(2, 2, rect(0, 0, 100, 100)),
      fakeElement(1, 1, rect(200, 0, 300, 100)),
      fakeElement(2, 2, rect(200, 0, 300, 100))
    ];
    UIBatchSorter.sort(elements, identity, 200);
    expect(countBatches(elements)).to.equal(2);
  });

  it("rect spanning multiple grid cells still detects overlap", () => {
    // canvasLongestEdge=200 → gridSize=20; A (400×400) spans 20×20 cells
    const elements = [fakeElement(1, 1, rect(0, 0, 400, 400)), fakeElement(2, 2, rect(200, 200, 300, 300))];
    UIBatchSorter.sort(elements, identity, 200);
    expect(elements[0].material.instanceId).to.equal(1);
    expect(elements[1].material.instanceId).to.equal(2);
  });

  it("complex 2x3 button grid yields 2 batches", () => {
    const elements: any[] = [];
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const x = c * 200;
        const y = r * 200;
        elements.push(fakeElement(1, 1, rect(x, y, x + 100, y + 100)));
        elements.push(fakeElement(2, 2, rect(x + 10, y + 10, x + 90, y + 50)));
      }
    }
    UIBatchSorter.sort(elements, identity, 200);
    expect(countBatches(elements)).to.equal(2);
  });

  it("rotated canvas: world AABBs reduce to canvas-local for precise overlap", () => {
    // Inflated world AABBs of a rotated canvas would falsely overlap; canvas-local recovers truth
    const cosA = Math.cos(Math.PI / 6);
    const sinA = Math.sin(Math.PI / 6);
    const worldRectFromLocal = (lx0: number, ly0: number, lx1: number, ly1: number): BoundingBox => {
      const xs = [lx0, lx1, lx0, lx1];
      const ys = [ly0, ly0, ly1, ly1];
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (let k = 0; k < 4; k++) {
        const wx = xs[k] * cosA - ys[k] * sinA;
        const wy = xs[k] * sinA + ys[k] * cosA;
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy;
        if (wy > maxY) maxY = wy;
      }
      return new BoundingBox(new Vector3(minX, minY, 0), new Vector3(maxX, maxY, 0));
    };

    const elements: any[] = [];
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const x = c * 200;
        const y = r * 200;
        elements.push(fakeElement(1, 1, worldRectFromLocal(x, y, x + 100, y + 100)));
        elements.push(fakeElement(2, 2, worldRectFromLocal(x + 10, y + 10, x + 90, y + 50)));
      }
    }

    const canvasWorldMatrix = new Matrix();
    const q = new Quaternion();
    Quaternion.rotationAxisAngle(new Vector3(0, 0, 1), Math.PI / 6, q);
    Matrix.affineTransformation(new Vector3(1, 1, 1), q, new Vector3(0, 0, 0), canvasWorldMatrix);

    UIBatchSorter.sort(elements, canvasWorldMatrix, 200);
    expect(countBatches(elements)).to.equal(2);
  });

  it("missing texture treated as id 0", () => {
    const elements = [fakeElement(1, null, rect(0, 0, 50, 50)), fakeElement(1, null, rect(100, 0, 150, 50))];
    expect(() => UIBatchSorter.sort(elements, identity, 200)).to.not.throw();
    expect(countBatches(elements)).to.equal(1);
  });
});
