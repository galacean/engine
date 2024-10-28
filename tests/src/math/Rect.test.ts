import { Rect } from "@galacean/engine-math";
import { expect } from "chai";

describe("Rect test", () => {
  it("set", () => {
    const a = new Rect();
    a.set(0, 0, 1, 1);
    expect(a.x).to.eq(0);
    expect(a.y).to.eq(0);
    expect(a.width).to.eq(1);
    expect(a.height).to.eq(1);
  });

  it("clone", () => {
    const a = new Rect(0, 0, 1, 2);
    const b = a.clone();
    expect(a.x).to.eq(b.x);
    expect(a.y).to.eq(b.y);
    expect(a.width).to.eq(b.width);
    expect(a.height).to.eq(b.height);
  });

  it("cloneTo", () => {
    const a = new Rect(0, 0, 1, 2);
    const b = new Rect();
    b.copyFrom(a);
    expect(a.x).to.eq(b.x);
    expect(a.y).to.eq(b.y);
    expect(a.width).to.eq(b.width);
    expect(a.height).to.eq(b.height);
  });
  it("_onValueChanged", () => {
    const a = new Rect(0, 0, 1, 2);
    expect(a._onValueChanged).to.eq(null);
    let countChange = 0;
    const _onValueChanged = () => {
      countChange += 1;
    };
    a._onValueChanged = _onValueChanged
    expect(a._onValueChanged).to.eq(_onValueChanged);
    a.x = 1;
    expect(countChange).to.eq(1);
    a.y = 1;
    expect(countChange).to.eq(2);
    a.width = 1;
    expect(countChange).to.eq(3);
    a._onValueChanged = null
    expect(a._onValueChanged).to.eq(null);
  });
});
