import { EventDispatcher } from "@galacean/engine-core";
import chai, { expect } from "chai";

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
    const listener1 = chai.spy(() => {});
    const listener2 = chai.spy(() => {});
    const eventDispatcher = new EventDispatcher();
    eventDispatcher.on("listenerX", listener1);
    eventDispatcher.dispatch("listenerX");
    expect(listener1).to.have.been.called.exactly(1);
    eventDispatcher.on("listenerX", listener2);
    eventDispatcher.dispatch("listenerX");
    expect(listener1).to.have.been.called.exactly(2);
    expect(listener2).to.have.been.called.exactly(1);
  });

  it("once", () => {
    const listener1 = chai.spy(() => {});
    const listener2 = chai.spy(() => Promise.resolve());
    const eventDispatcher = new EventDispatcher();
    eventDispatcher.once("listenerX", listener1);
    eventDispatcher.dispatch("listenerX");
    expect(listener1).to.have.been.called.exactly(1);
    expect(eventDispatcher.eventNames()).to.be.eql([]);
    expect(eventDispatcher.listenerCount("listenerX")).to.be.eql(0);

    eventDispatcher.on("listenerX", listener2);
    eventDispatcher.once("listenerX", listener1);
    eventDispatcher.dispatch("listenerX");
    expect(listener1).to.have.been.called.exactly(2);
    expect(listener2).to.have.been.called.exactly(1);
    expect(eventDispatcher.listenerCount("listenerX")).to.be.eql(1);
    expect(eventDispatcher.eventNames()).to.be.eql(["listenerX"]);
  });

  it("off event in listener", () => {
    const eventDispatcher = new EventDispatcher();
    const offFuncIn = chai.spy(() => {});
    const offFuncCall = chai.spy(function () {
      eventDispatcher.off("test-event", offFuncIn);
      expect(eventDispatcher.listenerCount("test-event")).to.be.eql(1);
    });
    eventDispatcher.on("test-event", offFuncCall);
    eventDispatcher.on("test-event", offFuncIn);
    eventDispatcher.dispatch("test-event");
    expect(offFuncIn).to.have.been.called.exactly(0);
    expect(offFuncCall).to.have.been.called.exactly(1);
  });

  it("off event", () => {
    const eventDispatcher = new EventDispatcher();
    const eventOn = chai.spy(() => {});
    const eventOff = chai.spy(() => {});
    eventDispatcher.on("test-event", eventOn);
    eventDispatcher.off("test-event", eventOff);
    eventDispatcher.dispatch("test-event");
    expect(eventOn).to.have.been.called.exactly(1);
    expect(eventDispatcher.listenerCount("test-event")).to.eql(1);
  });

  it("call event in a callback", () => {
    const eventDispatcher = new EventDispatcher();
    const event1On = chai.spy(() => {
      eventDispatcher.dispatch("event2");
    });
    const event2On = chai.spy(() => {});
    eventDispatcher.on("event1", event1On);
    eventDispatcher.on("event1", event1On);
    eventDispatcher.on("event2", event2On);
    eventDispatcher.on("event2", event2On);
    eventDispatcher.dispatch("event1");
    expect(event1On).to.have.been.called.exactly(2);
    expect(event2On).to.have.been.called.exactly(4);
  });
});
