import { Rect } from "../src/Rect";

describe("Rect test", () => {
  it("setValue", () => {
    const a = new Rect();
    a.setValue(0, 0, 1, 1);
    expect(a.x).toEqual(0);
    expect(a.y).toEqual(0);
    expect(a.width).toEqual(1);
    expect(a.height).toEqual(1);
  });

  it("clone", () => {
    const a = new Rect(0, 0, 1, 2);
    const b = a.clone();
    expect(a.x).toEqual(b.x);
    expect(a.y).toEqual(b.y);
    expect(a.width).toEqual(b.width);
    expect(a.height).toEqual(b.height);
  });

  it("cloneTo", () => {
    const a = new Rect(0, 0, 1, 2);
    const b = new Rect();
    a.cloneTo(b);
    expect(a.x).toEqual(b.x);
    expect(a.y).toEqual(b.y);
    expect(a.width).toEqual(b.width);
    expect(a.height).toEqual(b.height);
  });
});
