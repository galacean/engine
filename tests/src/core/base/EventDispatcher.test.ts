import { EventDispatcher } from "@galacean/engine-core";
import { vi, describe, expect, it } from "vitest";

describe("EventDispatcher test", function () {
  it("has event", () => {
    const eventDispatcher = new EventDispatcher();
    expect(eventDispatcher.hasEvent("test-event")).to.be.false;
    eventDispatcher.on("test-event", () => {});
    expect(eventDispatcher.hasEvent("test-event")).to.be.true;
  });

  it("eventNames", () => {
    const eventDispatcher = new EventDispatcher();
    eventDispatcher.on("test-event", () => {});
    eventDispatcher.on("test-event1", () => {});
    expect(eventDispatcher.eventNames()).to.be.eql(["test-event", "test-event1"]);
  });

  it("dispatch event", () => {
    const listener1 = vi.fn(() => {});
    const listener2 = vi.fn(() => {});
    const eventDispatcher = new EventDispatcher();
    eventDispatcher.on("listenerX", listener1);
    eventDispatcher.dispatch("listenerX");
    expect(listener1).toHaveBeenCalledTimes(1);
    eventDispatcher.on("listenerX", listener2);
    eventDispatcher.dispatch("listenerX");
    expect(listener1).toHaveBeenCalledTimes(2);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it("once", () => {
    const listener1 = vi.fn(() => {});
    const listener2 = vi.fn(() => Promise.resolve());
    const eventDispatcher = new EventDispatcher();
    eventDispatcher.once("listenerX", listener1);
    eventDispatcher.dispatch("listenerX");
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(eventDispatcher.eventNames()).to.be.eql([]);
    expect(eventDispatcher.listenerCount("listenerX")).to.be.eql(0);

    eventDispatcher.on("listenerX", listener2);
    eventDispatcher.once("listenerX", listener1);
    eventDispatcher.dispatch("listenerX");
    expect(listener1).toHaveBeenCalledTimes(2);
    expect(listener2).toHaveBeenCalledTimes(1);
    expect(eventDispatcher.listenerCount("listenerX")).to.be.eql(1);
    expect(eventDispatcher.eventNames()).to.be.eql(["listenerX"]);
  });

  it("off event in listener", () => {
    const eventDispatcher = new EventDispatcher();
    const offFuncIn = vi.fn(() => {});
    const offFuncCall = vi.fn(function () {
      eventDispatcher.off("test-event", offFuncIn);
      expect(eventDispatcher.listenerCount("test-event")).to.be.eql(1);
    });
    eventDispatcher.on("test-event", offFuncCall);
    eventDispatcher.on("test-event", offFuncIn);
    eventDispatcher.dispatch("test-event");
    expect(offFuncIn).toHaveBeenCalledTimes(0);
    expect(offFuncCall).toHaveBeenCalledTimes(1);
  });

  it("off event", () => {
    const eventDispatcher = new EventDispatcher();
    const eventOn = vi.fn(() => {});
    const eventOff = vi.fn(() => {});
    eventDispatcher.on("test-event", eventOn);
    eventDispatcher.off("test-event", eventOff);
    eventDispatcher.dispatch("test-event");
    expect(eventOn).toHaveBeenCalledTimes(1);
    expect(eventDispatcher.listenerCount("test-event")).to.eql(1);
  });

  it("call event in a callback", () => {
    const eventDispatcher = new EventDispatcher();
    const event1On = vi.fn(() => {
      eventDispatcher.dispatch("event2");
    });
    const event2On = vi.fn(() => {});
    eventDispatcher.on("event1", event1On);
    eventDispatcher.on("event1", event1On);
    eventDispatcher.on("event2", event2On);
    eventDispatcher.on("event2", event2On);
    eventDispatcher.dispatch("event1");
    expect(event1On).toHaveBeenCalledTimes(2);
    expect(event2On).toHaveBeenCalledTimes(4);
  });
});
