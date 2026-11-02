import { ReturnableObjectPool, type IPoolElement } from "@galacean/engine-core";
import { describe, expect, it } from "vitest";

class Entry {
  disposeCount = 0;

  dispose(): void {
    this.disposeCount++;
  }
}

describe("ReturnableObjectPool", () => {
  it("supports objects without a disposal hook and reuses returned objects", () => {
    class Value {
      value = 0;
    }
    const pool = new ReturnableObjectPool<Value & IPoolElement>(Value, 2);
    const first = pool.get();
    const second = pool.get();
    const third = pool.get();
    expect(new Set([first, second, third]).size).to.eq(3);
    first.value = 7;
    pool.return(first);
    expect(pool.get()).to.eq(first);
    expect(first.value).to.eq(7);
    pool.return(first);
    pool.garbageCollection();
    expect(pool.get()).to.be.instanceOf(Value).and.not.eq(first);
  });

  it("collects only idle objects and remains usable after repeated collection", () => {
    const pool = new ReturnableObjectPool(Entry, 0);
    const returned = pool.get();
    const active = pool.get();
    pool.return(returned);
    pool.return(active);
    expect(pool.get()).to.eq(active);

    pool.garbageCollection();
    pool.garbageCollection();
    expect(returned.disposeCount).to.eq(1);
    expect(active.disposeCount).to.eq(0);
    const fresh = pool.get();
    expect(fresh).to.be.instanceOf(Entry);
    expect(fresh).to.not.eq(returned);
    expect(fresh).to.not.eq(active);

    pool.return(active);
    pool.garbageCollection();
    expect(active.disposeCount).to.eq(1);
    expect(fresh.disposeCount).to.eq(0);
    expect(pool.get()).to.be.instanceOf(Entry);
  });

  it("does not dispose borrowed preallocated objects", () => {
    const pool = new ReturnableObjectPool(Entry, 1);
    const active = pool.get();
    pool.garbageCollection();
    expect(active.disposeCount).to.eq(0);
    pool.return(active);
    expect(pool.get()).to.eq(active);
  });
});
