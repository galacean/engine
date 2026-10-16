import { describe, expect, it } from "vitest";
import { ClearablePool } from "../../../packages/spine-core-4.2/src/util/ClearablePool";
import { ReturnablePool } from "../../../packages/spine-core-4.2/src/util/ReturnablePool";

class Item {
  value = 0;
}

describe("ClearablePool", () => {
  it("hands out distinct elements, then reuses them after clear", () => {
    const pool = new ClearablePool(Item);
    const a = pool.get();
    const b = pool.get();
    expect(a).to.not.equal(b);

    pool.clear();
    // clear() only resets the cursor; existing elements are reused in order.
    expect(pool.get()).to.equal(a);
    expect(pool.get()).to.equal(b);
  });
});

describe("ReturnablePool", () => {
  it("pre-fills initializeCount and reuses returned elements", () => {
    const pool = new ReturnablePool(Item, 2);
    const a = pool.get();
    const b = pool.get();
    expect(a).to.not.equal(b);

    pool.return(a);
    expect(pool.get()).to.equal(a);
  });

  it("allocates a fresh element when the pool is exhausted", () => {
    const pool = new ReturnablePool(Item, 1);
    const a = pool.get();
    const fresh = pool.get();
    expect(fresh).to.be.instanceOf(Item);
    expect(fresh).to.not.equal(a);
  });
});
