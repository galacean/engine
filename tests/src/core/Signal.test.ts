import { Signal } from "@galacean/engine-core";
import { describe, expect, it, vi } from "vitest";

describe("Signal", () => {
  it("on and invoke", () => {
    const signal = new Signal<[number, string]>();
    const fn = vi.fn();
    signal.on(fn);
    signal.invoke(42, "hello");
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(42, "hello");
  });

  it("multiple listeners called in order", () => {
    const signal = new Signal<[number]>();
    const order: number[] = [];
    signal.on(() => order.push(1));
    signal.on(() => order.push(2));
    signal.on(() => order.push(3));
    signal.invoke(0);
    expect(order).toEqual([1, 2, 3]);
  });

  it("off removes specific listener", () => {
    const signal = new Signal<[string]>();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    signal.on(fn1);
    signal.on(fn2);
    signal.off(fn1);
    signal.invoke("test");
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledWith("test");
  });

  it("off with context matching", () => {
    const signal = new Signal();
    const fn = vi.fn();
    const ctx1 = { name: "ctx1" };
    const ctx2 = { name: "ctx2" };
    signal.on(fn, ctx1);
    signal.on(fn, ctx2);
    signal.off(fn, ctx1);
    signal.invoke();
    // only ctx2 listener remains
    expect(fn).toHaveBeenCalledOnce();
  });

  it("once fires only once", () => {
    const signal = new Signal<[number]>();
    const fn = vi.fn();
    signal.once(fn);
    signal.invoke(1);
    signal.invoke(2);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(1);
  });

  it("removeAll clears all listeners", () => {
    const signal = new Signal();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    signal.on(fn1);
    signal.once(fn2);
    signal.removeAll();
    signal.invoke();
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
  });

  it("hasListeners reflects state", () => {
    const signal = new Signal();
    expect(signal.hasListeners).toBe(false);
    const fn = vi.fn();
    signal.on(fn);
    expect(signal.hasListeners).toBe(true);
    signal.off(fn);
    expect(signal.hasListeners).toBe(false);
  });

  it("hasListeners after once + invoke", () => {
    const signal = new Signal();
    signal.once(vi.fn());
    expect(signal.hasListeners).toBe(true);
    signal.invoke();
    expect(signal.hasListeners).toBe(false);
  });

  it("invoke with no listeners does not throw", () => {
    const signal = new Signal<[number]>();
    expect(() => signal.invoke(42)).not.toThrow();
  });

  it("invoke with no args (Signal<[]>)", () => {
    const signal = new Signal();
    const fn = vi.fn();
    signal.on(fn);
    signal.invoke();
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith();
  });

  it("context is applied correctly", () => {
    const signal = new Signal();
    const ctx = { value: 0 };
    signal.on(function (this: typeof ctx) {
      this.value = 42;
    }, ctx);
    signal.invoke();
    expect(ctx.value).toBe(42);
  });

  it("listener added during invoke is not called in same invoke", () => {
    const signal = new Signal();
    const late = vi.fn();
    signal.on(() => {
      signal.on(late);
    });
    signal.invoke();
    expect(late).not.toHaveBeenCalled();
    signal.invoke();
    expect(late).toHaveBeenCalledOnce();
  });

  it("listener removed during invoke is removed for next invoke", () => {
    const signal = new Signal();
    const fn2 = vi.fn();
    signal.on(() => {
      signal.off(fn2);
    });
    signal.on(fn2);
    signal.invoke();
    // fn2 still fires in the current invoke (snapshot-based iteration)
    expect(fn2).toHaveBeenCalledOnce();
    // but is removed for subsequent invokes
    signal.invoke();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it("off non-existent listener is a no-op", () => {
    const signal = new Signal();
    const fn = vi.fn();
    expect(() => signal.off(fn)).not.toThrow();
  });

  it("multiple once listeners", () => {
    const signal = new Signal<[number]>();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    signal.once(fn1);
    signal.once(fn2);
    signal.invoke(1);
    expect(fn1).toHaveBeenCalledWith(1);
    expect(fn2).toHaveBeenCalledWith(1);
    signal.invoke(2);
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it("mixed on and once", () => {
    const signal = new Signal<[number]>();
    const persistent = vi.fn();
    const oneShot = vi.fn();
    signal.on(persistent);
    signal.once(oneShot);
    signal.invoke(1);
    signal.invoke(2);
    expect(persistent).toHaveBeenCalledTimes(2);
    expect(oneShot).toHaveBeenCalledOnce();
    expect(oneShot).toHaveBeenCalledWith(1);
  });

  it("removeAll then re-add works", () => {
    const signal = new Signal<[number]>();
    signal.on(vi.fn());
    signal.removeAll();
    const fn = vi.fn();
    signal.on(fn);
    signal.invoke(99);
    expect(fn).toHaveBeenCalledWith(99);
  });
});
