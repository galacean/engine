import { Event } from "../src/Event";
import { EventDispatcher } from "../src/EventDispatcher";

describe("oasis 3d event test", () => {
  it("create event", () => {
    const event = new Event("test");
    expect(event.bubbles).toBeTruthy();
    expect(event.currentTarget).toBeNull();
    expect(event.type).toEqual("test");
    expect(event.data).toEqual({});
    expect(event.propagationStopped).toBeFalsy();
    event.stopPropagation();
    expect(event.propagationStopped).toBeTruthy();
    expect(event.timeStamp).toBeLessThan(Date.now());
    expect(event.target).toBeNull();
    const dispatcher = new EventDispatcher();
    event.target = dispatcher;
    expect(event.target).toEqual(dispatcher);
    event.currentTarget = dispatcher;
    expect(event.currentTarget).toEqual(dispatcher);
  });
});
