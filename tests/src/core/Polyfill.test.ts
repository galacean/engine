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
    const originalAudioContext = window.AudioContext;
    const originalWebkitAudioContext = (window as any).webkitAudioContext;
    
    try {
      delete window.AudioContext;
      
      (window as any).webkitAudioContext = class MockWebkitAudioContext {
        state = "suspended";
        
        constructor() { }
        
        decodeAudioData(
          arrayBuffer: ArrayBuffer, 
          successCallback?: ((decodedData: AudioBuffer) => void) | null,
          errorCallback?: ((error: DOMException) => void) | null
        ) {
          setTimeout(() => {
            successCallback?.({ duration: 10 } as AudioBuffer);
          }, 10);
        }
      };
      
      expect(window.AudioContext).to.be.undefined;
      expect((window as any).webkitAudioContext).not.to.be.undefined;
      
      import("@galacean/engine-core").then(() => {
        expect(window.AudioContext).to.equal((window as any).webkitAudioContext);
        
        const context = new window.AudioContext();
        expect(context).to.be.instanceOf((window as any).webkitAudioContext);
        
        const arrayBuffer = new ArrayBuffer(10);
        const promise = context.decodeAudioData(arrayBuffer);
        expect(promise).to.be.instanceOf(Promise);
        
        return promise.then(result => {
          expect(result).to.have.property("duration", 10);
        });
      });
    } finally {
      window.AudioContext = originalAudioContext;
      (window as any).webkitAudioContext = originalWebkitAudioContext;
    }
  });  
});
