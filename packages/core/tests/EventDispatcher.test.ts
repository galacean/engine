import { EventDispatcher } from "../src/base";

describe("EventDispatcher Test", function () {
  it("create EventDispatcher", () => {
    const eventDispatcher = new EventDispatcher(null);
    expect(eventDispatcher.instanceId).not.toBeNull();
  });

  it("test addEventListener", () => {
    const eventDispatcher = new EventDispatcher(null);
    eventDispatcher.on("test", () => {});
    expect(eventDispatcher.hasEvent("test")).toBeTruthy();
    eventDispatcher.removeEventListener("test");
    expect(eventDispatcher.hasEvent("test")).toBeFalsy();
  });

  it("test once", () => {
    const eventDispatcher = new EventDispatcher(null);
    eventDispatcher.once("test", () => {});
    expect(eventDispatcher.hasEvent("test")).toBeTruthy();
    eventDispatcher.dispatch("test");
    expect(eventDispatcher.hasEvent("test")).toBeFalsy();
  });

  it("test callback", () => {
    const eventDispatcher = new EventDispatcher(null);
    eventDispatcher.on("test", (param) => {
      expect(param).toEqual("test");
    });
    eventDispatcher.dispatch("test", "test");
  });

  it("test multi callback", () => {
    const eventDispatcher = new EventDispatcher(null);
    eventDispatcher.on("test", (param) => {
      expect(param).toEqual("test");
    });
    eventDispatcher.on("test", (param) => {
      expect(param).toEqual("test");
    });
    eventDispatcher.dispatch("test", "test");
  });

  it("listenerCount", () => {
    const eventDispatcher = new EventDispatcher(null);
    eventDispatcher.on("test", (param) => {
      expect(param).toEqual("test");
    });
    expect(eventDispatcher.listenerCount("test") === 1).toBeTruthy();
  });

  it("listenerCount eventNames", () => {
    const eventDispatcher = new EventDispatcher(null);
    eventDispatcher.on("test", (param) => {
      expect(param).toEqual("test");
    });
    expect(eventDispatcher.listenerCount("test") === 1).toBeTruthy();
    expect(eventDispatcher.eventNames()).toEqual(["test"]);
  });

  it("remove all event Listener", () => {
    const eventDispatcher = new EventDispatcher(null);
    eventDispatcher.on("test1", (param) => {
      expect(param).toEqual("test");
    });

    eventDispatcher.on("test2", (param) => {
      expect(param).toEqual("test");
    });

    expect(eventDispatcher.eventNames()).toEqual(["test1", "test2"]);
    eventDispatcher.removeAllEventListeners();
    expect(eventDispatcher.eventNames()).toEqual([]);
  });
});
