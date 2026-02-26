import { describe, expect, it } from "vitest";

describe("Polyfill", () => {
  it("AudioContext", async () => {
    if (window.AudioContext) {
      // @ts-ignore
      delete window.AudioContext;

      (window as any).webkitAudioContext = class MockWebkitAudioContext {
        state = "suspended";

        constructor() { }

        decodeAudioData(arrayBuffer: ArrayBuffer, successCallback: Function, errorCallback?: Function) {
          setTimeout(() => {
            successCallback({ duration: 10 } as AudioBuffer);
          }, 10);
        }
      };

      expect(window.AudioContext).to.be.undefined;
      expect((window as any).webkitAudioContext).to.exist;

      await import("@galacean/engine-core");

      expect(window.AudioContext).to.exist;
      expect(window.AudioContext).to.equal((window as any).webkitAudioContext);

      const context = new window.AudioContext();
      const arrayBuffer = new ArrayBuffer(10);

      const result = await context.decodeAudioData(arrayBuffer);
      expect(result).to.have.property("duration", 10);

      const callbackResult = await new Promise<AudioBuffer>((resolve) => {
        context.decodeAudioData(arrayBuffer, resolve);
      });
      expect(callbackResult).to.have.property("duration", 10);
    }
  });
});
