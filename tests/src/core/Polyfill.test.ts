import { describe, expect, it } from "vitest";

describe("Polyfill", () => {
  it("String.prototype.matchAll", async () => {
    const regex = /#include\s+"([./][^\\"]+)"/gm;
    const content = `#include "./f1.glsl"
    #include "./f2.glsl"
    xxx
    #include "/f3.glsl"
    ooo`;
    const originMatchResult = content.matchAll(regex);
    const originResultArray = Array.from(originMatchResult);

    String.prototype.matchAll = null;
    import("@galacean/engine-core").then(() => {
      const regexTest = /noGlobal/;
      const contentTest = "test";
      expect(
        String.prototype.matchAll.bind(contentTest, regexTest),
        "Should throw error caused by absence of g flag"
      ).to.throw(TypeError);

      const matchResult = content.matchAll(regex);
      expect(!!matchResult.next, "result should be iterable").to.be.true;
      const resultArray = Array.from(matchResult);
      expect(resultArray.length).to.equal(3).to.equal(originResultArray.length);

      expect(resultArray[0][0]).to.equal(originResultArray[0][0]).to.equal('#include "./f1.glsl"');
      expect(resultArray[0][1]).to.equal(originResultArray[0][1]).to.equal("./f1.glsl");

      expect(resultArray[1][0]).to.equal(originResultArray[1][0]).to.equal('#include "./f2.glsl"');
      expect(resultArray[1][1]).to.equal(originResultArray[1][1]).to.equal("./f2.glsl");

      expect(resultArray[2][0]).to.equal(originResultArray[2][0]).to.equal('#include "/f3.glsl"');
      expect(resultArray[2][1]).to.equal(originResultArray[2][1]).to.equal("/f3.glsl");
    });
  });

  it("AudioContext polyfill", async () => {
    delete window.AudioContext;

    (window as any).webkitAudioContext = class MockWebkitAudioContext {
      state = "suspended";

      constructor() {}

      decodeAudioData(arrayBuffer: ArrayBuffer, successCallback: Function) {
        setTimeout(() => {
          successCallback({ duration: 10 } as AudioBuffer);
        }, 10);
      }
    };

    window.AudioContext = (window as any).webkitAudioContext;

    expect(window.AudioContext).to.equal((window as any).webkitAudioContext);

    const context = new window.AudioContext();

    const originalDecodeAudioData = context.decodeAudioData;

    AudioContext.prototype.decodeAudioData = function (arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
      const self = this;
      return new Promise((resolve) => {
        originalDecodeAudioData.apply(self, [arrayBuffer, resolve]);
      });
    };

    const arrayBuffer = new ArrayBuffer(10);
    const result = await context.decodeAudioData(arrayBuffer);
    expect(result).to.have.property("duration", 10);
  });

  it("TextMetrics", async () => {
    if (window.TextMetrics) {
      // @ts-ignore
      delete TextMetrics.prototype.actualBoundingBoxLeft;
      // @ts-ignore
      delete TextMetrics.prototype.actualBoundingBoxRight;
    }

    expect("actualBoundingBoxLeft" in TextMetrics.prototype).to.be.false;
    expect("actualBoundingBoxRight" in TextMetrics.prototype).to.be.false;

    import("@galacean/engine-core").then(() => {
      expect("actualBoundingBoxLeft" in TextMetrics.prototype).to.be.true;
      expect("actualBoundingBoxRight" in TextMetrics.prototype).to.be.true;

      const mockTextMetrics = {
        width: 100
      } as TextMetrics;

      expect(mockTextMetrics.actualBoundingBoxLeft).to.equal(0);
      expect(mockTextMetrics.actualBoundingBoxRight).to.equal(100);
    });
  });
});
