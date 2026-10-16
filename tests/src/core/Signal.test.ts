import { Entity, Script, Signal } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { describe, expect, it, vi } from "vitest";

class TestHandler extends Script {
  callCount = 0;
  lastPrefix = "";
  lastArgs: any[] = [];

  handleClick() {
    this.callCount++;
  }

  handleClickWithPrefix(prefix: string) {
    this.callCount++;
    this.lastPrefix = prefix;
  }

  handleWithArgs(...args: any[]) {
    this.callCount++;
    this.lastArgs = args;
  }
}

describe("Signal", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  const scene = engine.sceneManager.scenes[0];
  const root = scene.createRootEntity("root");

  // ---- Basic closure-based API ----

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

  it("off with target matching", () => {
    const signal = new Signal();
    const fn = vi.fn();
    const t1 = { name: "t1" };
    const t2 = { name: "t2" };
    signal.on(fn, t1);
    signal.on(fn, t2);
    signal.off(fn, t1);
    signal.invoke();
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

  it("target is applied correctly", () => {
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

  it("listener removed during invoke does not fire in same cycle", () => {
    const signal = new Signal();
    const fn2 = vi.fn();
    signal.on(() => {
      signal.off(fn2);
    });
    signal.on(fn2);
    signal.invoke();
    expect(fn2).not.toHaveBeenCalled();
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

  // ---- Structured binding API ----

  it("structured binding on/invoke", () => {
    const signal = new Signal();
    const entity = root.createChild("sb1");
    const handler = entity.addComponent(TestHandler);

    signal.on(handler, "handleClick");
    signal.invoke();
    expect(handler.callCount).toBe(1);

    entity.destroy();
  });

  it("structured binding with arguments", () => {
    const signal = new Signal();
    const entity = root.createChild("sb2");
    const handler = entity.addComponent(TestHandler);

    signal.on(handler, "handleClickWithPrefix", "hello");
    signal.invoke();
    expect(handler.callCount).toBe(1);
    expect(handler.lastPrefix).toBe("hello");

    entity.destroy();
  });

  it("structured binding off by target + methodName", () => {
    const signal = new Signal();
    const entity = root.createChild("sb3");
    const handler = entity.addComponent(TestHandler);

    signal.on(handler, "handleClick");
    signal.off(handler, "handleClick");
    signal.invoke();
    expect(handler.callCount).toBe(0);

    entity.destroy();
  });

  it("structured binding once", () => {
    const signal = new Signal();
    const entity = root.createChild("sb4");
    const handler = entity.addComponent(TestHandler);

    signal.once(handler, "handleClick");
    signal.invoke();
    signal.invoke();
    expect(handler.callCount).toBe(1);

    entity.destroy();
  });

  it("removeAll(target) removes only matching listeners", () => {
    const signal = new Signal();
    const e1 = root.createChild("ra1");
    const e2 = root.createChild("ra2");
    const h1 = e1.addComponent(TestHandler);
    const h2 = e2.addComponent(TestHandler);

    signal.on(h1, "handleClick");
    signal.on(h2, "handleClick");
    signal.removeAll(h1);
    signal.invoke();
    expect(h1.callCount).toBe(0);
    expect(h2.callCount).toBe(1);

    e1.destroy();
    e2.destroy();
  });

  it("invoke auto-cleans destroyed component's structured binding", () => {
    const signal = new Signal();
    const entity = root.createChild("ac1");
    const handler = entity.addComponent(TestHandler);
    const fn = vi.fn();

    signal.on(handler, "handleClick");
    signal.on(fn);

    entity.destroy();
    signal.invoke();

    // Destroyed component's listener should be skipped
    expect(handler.callCount).toBe(0);
    // Other listeners should still fire
    expect(fn).toHaveBeenCalledOnce();
    // Verify structured binding was auto-cleaned: off the closure, then invoke again
    signal.off(fn);
    const fn2 = vi.fn();
    signal.on(fn2);
    signal.invoke();
    // fn2 fires, but destroyed handler's binding should not cause errors
    expect(fn2).toHaveBeenCalledOnce();
  });

  // ---- Structured binding arg order (runtime first, bound last) ----

  it("structured binding: runtime args precede bound args", () => {
    const signal = new Signal<[string, number]>();
    const entity = root.createChild("sb-order");
    const handler = entity.addComponent(TestHandler);

    signal.on(handler, "handleWithArgs", "boundA", "boundB");
    signal.invoke("event", 42);
    expect(handler.lastArgs).toEqual(["event", 42, "boundA", "boundB"]);

    entity.destroy();
  });

  it("structured binding: event object stays at index 0 regardless of bound args count", () => {
    const event = { type: "click", x: 10, y: 20 };
    const signal = new Signal<[typeof event]>();
    const e1 = root.createChild("sb-evt-1");
    const e2 = root.createChild("sb-evt-2");
    const h1 = e1.addComponent(TestHandler);
    const h2 = e2.addComponent(TestHandler);

    signal.on(h1, "handleWithArgs");
    signal.on(h2, "handleWithArgs", "ctx", 1, true);

    signal.invoke(event);

    expect(h1.lastArgs[0]).toBe(event);
    expect(h2.lastArgs[0]).toBe(event);
    expect(h2.lastArgs).toEqual([event, "ctx", 1, true]);

    e1.destroy();
    e2.destroy();
  });

  it("structured binding once: runtime + bound args order preserved", () => {
    const signal = new Signal<[number]>();
    const entity = root.createChild("sb-once-args");
    const handler = entity.addComponent(TestHandler);

    signal.once(handler, "handleWithArgs", "bound");
    signal.invoke(99);
    signal.invoke(100);

    expect(handler.callCount).toBe(1);
    expect(handler.lastArgs).toEqual([99, "bound"]);

    entity.destroy();
  });

  // ---- Clone ----

  /** Build the identity map (source entity/component -> clone) the engine passes to `_onClone`. */
  function buildCloneMap(src: Entity, target: Entity, map = new Map<Object, Object>()): Map<Object, Object> {
    map.set(src, target);
    // @ts-ignore
    const srcComponents = src._components,
      targetComponents = target._components;
    for (let i = 0; i < srcComponents.length; i++) map.set(srcComponents[i], targetComponents[i]);
    for (let i = 0; i < src.children.length; i++) buildCloneMap(src.children[i], target.children[i], map);
    return map;
  }

  it("clone: closure-based listeners are not cloned", () => {
    const signal = new Signal<[number]>();
    const targetSignal = new Signal<[number]>();
    const fn = vi.fn();
    signal.on(fn);

    const srcRoot = root.createChild("clSrc1");
    const targetRoot = srcRoot.clone();
    // @ts-ignore
    signal._onClone(targetSignal, buildCloneMap(srcRoot, targetRoot));

    // Closure listeners should NOT be copied to clone
    targetSignal.invoke(42);
    expect(fn).not.toHaveBeenCalled();

    srcRoot.destroy();
  });

  it("clone: structured bindings are remapped to cloned hierarchy", () => {
    const signal = new Signal();
    const targetSignal = new Signal();

    const srcRoot = root.createChild("clSrc2");
    const handlerEntity = srcRoot.createChild("handler");
    const handler = handlerEntity.addComponent(TestHandler);

    signal.on(handler, "handleClick");

    const targetRoot = srcRoot.clone();
    // @ts-ignore
    signal._onClone(targetSignal, buildCloneMap(srcRoot, targetRoot));

    const clonedHandler = targetRoot.findByName("handler").getComponent(TestHandler);
    targetSignal.invoke();

    expect(clonedHandler.callCount).toBe(1);
    expect(handler.callCount).toBe(0);

    srcRoot.destroy();
  });

  it("clone: external structured bindings preserve original target", () => {
    const signal = new Signal();
    const targetSignal = new Signal();

    const externalEntity = root.createChild("external");
    const externalHandler = externalEntity.addComponent(TestHandler);

    const srcRoot = root.createChild("clSrc3");
    signal.on(externalHandler, "handleClick");

    const targetRoot = srcRoot.clone();
    // @ts-ignore
    signal._onClone(targetSignal, buildCloneMap(srcRoot, targetRoot));

    targetSignal.invoke();
    expect(externalHandler.callCount).toBe(1);

    srcRoot.destroy();
    externalEntity.destroy();
  });

  it("clone: arguments with Entity/Component refs are remapped", () => {
    const signal = new Signal();
    const targetSignal = new Signal();

    const srcRoot = root.createChild("clSrc4");
    const handlerEntity = srcRoot.createChild("handler");
    const handler = handlerEntity.addComponent(TestHandler);
    const refEntity = srcRoot.createChild("ref");
    const refHandler = refEntity.addComponent(TestHandler);

    signal.on(handler, "handleClickWithPrefix", refHandler);

    const targetRoot = srcRoot.clone();
    // @ts-ignore
    signal._onClone(targetSignal, buildCloneMap(srcRoot, targetRoot));

    const clonedHandler = targetRoot.findByName("handler").getComponent(TestHandler);
    targetSignal.invoke();

    expect(clonedHandler.callCount).toBe(1);
    expect(handler.callCount).toBe(0);

    srcRoot.destroy();
  });

  it("clone: once flag is preserved", () => {
    const signal = new Signal();
    const targetSignal = new Signal();

    const srcRoot = root.createChild("clSrc5");
    const handlerEntity = srcRoot.createChild("handler");
    const handler = handlerEntity.addComponent(TestHandler);

    signal.once(handler, "handleClick");

    const targetRoot = srcRoot.clone();
    // @ts-ignore
    signal._onClone(targetSignal, buildCloneMap(srcRoot, targetRoot));

    const clonedHandler = targetRoot.findByName("handler").getComponent(TestHandler);
    targetSignal.invoke();
    targetSignal.invoke();

    expect(clonedHandler.callCount).toBe(1);

    srcRoot.destroy();
  });
});
